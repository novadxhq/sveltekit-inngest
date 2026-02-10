# sveltekit-inngest

`sveltekit-inngest` gives you typed realtime subscriptions in SvelteKit using Inngest + SSE.

This version is **bus-first**:

- one global SSE endpoint
- channel registry on the server
- multi-channel subscriptions in one `RealtimeManager`
- per-channel topic authorization

It is built for Svelte 5 and uses state-first reads (`.current`) instead of `$store` syntax.

## Features

- **Typed topic payloads** from `@inngest/realtime` channel definitions
- **Global bus endpoint** with static channel registry
- **Per-channel ACL** with topic filtering (`allowedTopics`)
- **Optional per-message reauthorization** for fail-closed auth rechecks
- **Svelte 5 state-first API** via `getRealtimeBusState()` and `getRealtimeBusTopicState()`
- **Reactive multi-channel manager** with add/remove subscription diffing
- **Built-in health events** (`connecting`, `connected`, `degraded`)

## Requirements

This package is intended for **Svelte 5 + SvelteKit** projects and expects these peer dependencies:

- `svelte`
- `@sveltejs/kit`
- `sveltekit-sse`
- `@inngest/realtime`
- `inngest`

## Installation

```bash
bun add sveltekit-inngest
# or
pnpm add sveltekit-inngest
# or
npm install sveltekit-inngest
```

## Quick Start

### 1. Define your channels/topics

```ts
// src/lib/realtime/channels.ts
import { channel, topic } from "@inngest/realtime";
import { z } from "zod";

const messageTopic = topic("message").schema(
  z.object({
    message: z.string(),
  })
);

const adminMessageTopic = topic("admin-message").schema(
  z.object({
    message: z.string(),
  })
);

export const demoChannel = channel("demo")
  .addTopic(messageTopic)
  .addTopic(adminMessageTopic);

export const secondDemoChannel = channel("second-demo").addTopic(messageTopic);
```

### 2. Create one global realtime endpoint

```ts
// src/routes/api/events/+server.ts
import { createRealtimeEndpoint } from "sveltekit-inngest/server";
import { demoChannel, secondDemoChannel } from "$lib/realtime/channels";
import { inngest } from "$lib/server/inngest";

export const POST = createRealtimeEndpoint({
  inngest,
  reauthorizeOnEachMessage: true,
  channels: {
    demo: {
      channel: demoChannel,
      authorize: ({ locals, topics }) => {
        if (locals.user.role === "admin") return true;

        return {
          allowedTopics: topics.filter((topic) => topic === "message"),
        };
      },
    },
    "second-demo": {
      channel: secondDemoChannel,
      authorize: () => true,
    },
  },
});
```

### 3. Provide subscriptions with `RealtimeManager`

```svelte
<script lang="ts">
  import { RealtimeManager } from "sveltekit-inngest/client";
  import { demoChannel, secondDemoChannel } from "$lib/realtime/channels";
  import Panels from "./Panels.svelte";

  const subscriptions = [
    { channel: demoChannel },
    { channel: secondDemoChannel },
  ];
</script>

<RealtimeManager endpoint="/api/events" {subscriptions}>
  <Panels />
</RealtimeManager>
```

### 4. Read bus health and topic state

```svelte
<script lang="ts">
  import {
    getRealtimeBusState,
    getRealtimeBusTopicState,
  } from "sveltekit-inngest/client";
  import { demoChannel } from "$lib/realtime/channels";

  const { health } = getRealtimeBusState(demoChannel);

  const message = getRealtimeBusTopicState<typeof demoChannel, "message">(
    demoChannel,
    "message"
  );

  const adminMessage = getRealtimeBusTopicState<typeof demoChannel, "admin-message">(
    demoChannel,
    "admin-message"
  );
</script>

<p>{health.current?.status ?? "connecting"}</p>
```

## API

### `createRealtimeEndpoint(options)`

Creates a SvelteKit `POST` handler for the global realtime bus.

```ts
createRealtimeEndpoint({
  inngest,
  channels: {
    [channelId]: {
      channel,
      channelArgs, // optional: unknown[] | (event) => unknown[] | Promise<unknown[]>
      reauthorizeOnEachMessage, // optional: channel override
      reauthorize, // optional: per-message guard, must return true to continue
      authorize,   // required
    },
  },
  reauthorizeOnEachMessage, // optional: endpoint default (default false)
  healthCheck, // optional: { enabled?: boolean; intervalMs?: number } (interval default: 15_000)
});
```

`authorize(context)` returns:

- `true`: allow all requested topics
- `false`: deny request (`403`)
- `{ allowedTopics }`: allow subset of requested topics

`authorize` context includes:

- `event`
- `locals`
- `request`
- `channelId`
- `topics`
- `params`

`reauthorize(context)` is optional and returns `boolean | Promise<boolean>`.
It receives the same fields as `authorize` plus:

- `messageTopic`
- `message`

`reauthorizeOnEachMessage` precedence:

- `channels[channelId].reauthorizeOnEachMessage`
- endpoint `reauthorizeOnEachMessage`
- default `false`

When enabled, per-message checks run right before emit:

- message topic is validated (must exist, be configured, and be part of the initial authorized topic set)
- if `reauthorize` exists, it is called with `topics: [message.topic]` and stream continues only when it returns exactly `true`
- if `reauthorize` is not provided, `authorize` is re-run as fallback with `topics: [message.topic]`

If checks deny, throw, or message topic is invalid, the stream fails closed (degraded health event + close).

### `<RealtimeManager />`

Bus manager for one endpoint and many channel subscriptions.

Props:

- `endpoint?: string` (default: `"/api/events"`)
- `subscriptions: RealtimeSubscription[]`
- `children?: Snippet`

`RealtimeSubscription`:

```ts
type RealtimeSubscription = {
  channel: Realtime.Channel | Realtime.Channel.Definition;
  channelArgs?: unknown[];
  topics?: string[];
  params?: Record<string, string | number | boolean | null>;
};
```

Duplicate subscriptions resolving to the same channel ID throw immediately.

### Hooks

- `getRealtimeBus()`
- `getRealtimeBusState(channel, channelArgs?)`
- `getRealtimeBusTopicJson(channel, topic, options?)`
- `getRealtimeBusTopicState(channel, topic, options?)`

`getRealtimeBusTopicState` returns `.current` state values (Svelte 5-friendly).

## Request Payload

Client request payload shape is unchanged:

```json
{
  "channel": "demo",
  "topics": ["message", "admin-message"],
  "params": { "scope": "limited" }
}
```

Notes:

- `channel` is required
- `topics` is optional (defaults to all topics in that channel)
- unknown channels/topics return `400`
- filtered-to-zero authorized topics returns `403`
- when per-message reauth is enabled, failures close the stream before the message is emitted

## Breaking Changes

This release is intentionally bus-first and not backward compatible with single-channel APIs.

Removed client APIs:

- `getRealtime()`
- `getRealtimeState()`
- `getRealtimeTopicJson(topic, ...)`
- `getRealtimeTopicState(topic, ...)`

Removed server shape:

- `createRealtimeEndpoint({ channel, channelArgs, authorize })`

Use:

- `createRealtimeEndpoint({ channels: { ... } })`
- `RealtimeManager({ subscriptions: [...] })`
- bus hooks (`getRealtimeBus*`)

## License

MIT
