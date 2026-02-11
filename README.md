# sveltekit-inngest

Typed realtime subscriptions for SvelteKit using Inngest + SSE.

This package is bus-first:

- one global SSE endpoint
- static server channel registry
- multi-channel subscriptions in one `RealtimeManager`
- per-channel topic authorization
- optional per-message reauthorization (fail-closed)

The client API targets Svelte 5 state-first reads (`.current`) instead of `$store` syntax.

## Features

- Typed topic payloads from `@inngest/realtime` channel definitions
- One global realtime endpoint with channel routing
- Per-channel auth with topic filtering (`allowedTopics`)
- Optional per-message reauthorization before each emit
- Optional server and client failure callbacks
- Svelte 5 bus hooks: `getRealtimeBusState()` and `getRealtimeBusTopicState()`
- Multi-subscription diffing in `RealtimeManager`
- Built-in health events: `connecting`, `connected`, `degraded`

## Requirements

Peer dependencies:

- `svelte` (Svelte 5)
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

## Quick Start (Install to Live Events)

### 1. Define channels and topics

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

export const userChannel = channel((userId: string) => `user:${userId}`).addTopic(
  messageTopic
);
```

### 2. Configure Inngest with realtime middleware

```ts
// src/lib/server/inngest.ts
import { Inngest } from "inngest";
import { realtimeMiddleware } from "@inngest/realtime/middleware";

export const inngest = new Inngest({
  id: "my-app",
  middleware: [realtimeMiddleware()],
});
```

### 3. Publish to topics from an Inngest function

```ts
// src/lib/server/functions.ts
import { inngest } from "$lib/server/inngest";
import { demoChannel } from "$lib/realtime/channels";

export const demoRealtime = inngest.createFunction(
  { id: "demo-realtime" },
  { event: "app/demo.message" },
  async ({ event, publish }) => {
    await publish(demoChannel().message({ message: event.data.message }));
  }
);
```

### 4. Expose Inngest serve endpoint

```ts
// src/routes/api/inngest/+server.ts
import { serve } from "inngest/sveltekit";
import { inngest } from "$lib/server/inngest";
import { demoRealtime } from "$lib/server/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [demoRealtime],
});
```

### 5. Create one global realtime endpoint

```ts
// src/routes/api/events/+server.ts
import { createRealtimeEndpoint } from "sveltekit-inngest/server";
import { demoChannel, userChannel } from "$lib/realtime/channels";
import { inngest } from "$lib/server/inngest";

export const POST = createRealtimeEndpoint({
  inngest,
  reauthorizeOnEachMessage: true,
  channels: {
    demo: {
      channel: demoChannel,
      authorize: ({ locals, topics }) => {
        if (!locals?.user) {
          throw new Error("Missing authenticated user");
        }

        if (locals.user.role === "admin") return true;

        return {
          allowedTopics: topics.filter((topic) => topic === "message"),
        };
      },
    },
    user: {
      channel: userChannel,
      channelParams: (_event, requestedChannelId) => {
        return requestedChannelId.startsWith("user:")
          ? requestedChannelId.slice("user:".length)
          : "";
      },
      authorize: () => true,
    },
  },
  onFailure: ({ stage, message }) => {
    console.error(`[realtime:${stage}]`, message);
    return { message };
  },
});
```

### 6. Provide subscriptions with `RealtimeManager`

```svelte
<!-- src/routes/+page.svelte -->
<script lang="ts">
  import { RealtimeManager } from "sveltekit-inngest/client";
  import { demoChannel, userChannel } from "$lib/realtime/channels";
  import RealtimePanel from "./realtime-panel.svelte";

  const subscriptions = [
    { channel: demoChannel },
    { channel: userChannel, channelParams: "alice" },
  ];
</script>

<RealtimeManager endpoint="/api/events" {subscriptions}>
  <RealtimePanel />
</RealtimeManager>
```

### 7. Read health and topic state from hooks

```svelte
<!-- src/routes/realtime-panel.svelte -->
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

<p>Connection: {health.current?.status ?? "connecting"}</p>
<pre>{JSON.stringify(message.current, null, 2)}</pre>
<pre>{JSON.stringify(adminMessage.current, null, 2)}</pre>
```

### 8. Send an event

Send `app/demo.message` to Inngest (CLI/UI/API) with payload:

```json
{
  "message": "hello realtime"
}
```

## API Reference

### Import paths

| Import path | Exports |
| --- | --- |
| `sveltekit-inngest` | Client exports (`RealtimeManager`, `getRealtimeBus*`, client types) |
| `sveltekit-inngest/client` | Same as root client exports |
| `sveltekit-inngest/server` | `createRealtimeEndpoint` and server types |
| `sveltekit-inngest/server/createRealtimeEndpoint` | Direct endpoint factory and server types |

### Client exports

Runtime exports:

- `RealtimeManager`
- `getRealtimeBus()`
- `getRealtimeBusState(channel, channelParams?)`
- `getRealtimeBusTopicJson(channel, topic, options?)`
- `getRealtimeBusTopicState(channel, topic, options?)`

Type exports include:

- `RealtimeManagerProps`, `RealtimeSubscription`, `RealtimeResolvedSubscription`
- `RealtimeClientFailureContext`, `RealtimeClientFailureSource`
- `HealthPayload`, `HealthStatus`
- `TopicKey<TChannel>`, `TopicData<TChannel, TTopic>`
- `RealtimeTopicEnvelope`, `RealtimeTopicMessage`
- `RealtimeRequestParams`, `ReactiveCurrent`, `RealtimeTopicState`, `RealtimeHealthState`

### Server exports

Runtime export:

- `createRealtimeEndpoint(options)`

Type exports include:

- `RealtimeEndpointOptions`
- `RealtimeChannelConfig`
- `RealtimeAuthorizeContext`
- `RealtimeReauthorizeContext`
- `RealtimeHealthCheckOptions`
- `RealtimeServerFailureContext`
- `RealtimeServerFailureStage`

### `createRealtimeEndpoint(options)`

Creates a SvelteKit `POST` request handler for the global realtime bus.

```ts
createRealtimeEndpoint({
  inngest,
  channels: {
    [registryKey]: {
      channel,
      channelParams, // optional: string | (event, requestedChannelId, requestParams) => string | Promise<string>
      authorize, // required
      reauthorize, // optional
      reauthorizeOnEachMessage, // optional channel override
    },
  },
  reauthorizeOnEachMessage, // optional global default
  healthCheck, // optional
  onFailure, // optional
});
```

#### Endpoint options

| Option | Required | Description |
| --- | --- | --- |
| `inngest` | Yes | Inngest client used for token generation and subscription |
| `channels` | Yes | Static channel registry used to resolve incoming `payload.channel` |
| `reauthorizeOnEachMessage` | No | Global default for per-message reauthorization (`false` by default) |
| `healthCheck.enabled` | No | Enable/disable interval health ticks (`true` default) |
| `healthCheck.intervalMs` | No | Health tick interval in ms (`15000` default) |
| `onFailure` | No | Failure hook for request-time and stream-time errors |

#### Channel config options

| Option | Required | Description |
| --- | --- | --- |
| `channel` | Yes | `Realtime.Channel` or channel definition function |
| `channelParams` | No | Static string or resolver for channel builders |
| `authorize` | Yes | Initial request authorization callback |
| `reauthorize` | No | Optional per-message guard callback |
| `reauthorizeOnEachMessage` | No | Per-channel override of global reauth behavior |

#### `authorize(context)` result contract

- `true`: allow all requested topics
- `false`: deny request (`403`)
- `{ allowedTopics }`: allow only subset of requested topics

#### `authorize` context

| Field | Description |
| --- | --- |
| `event` | Full SvelteKit `RequestEvent` |
| `locals` | `event.locals` |
| `request` | Raw `Request` |
| `channelId` | Resolved channel name |
| `topics` | Requested topic list |
| `params` | Sanitized request params (`string \| number \| boolean \| null`) |

#### `reauthorize(context)` additions

`reauthorize` receives the same fields as `authorize`, plus:

| Field | Description |
| --- | --- |
| `messageTopic` | Topic from the current realtime message |
| `message` | Raw message envelope |

#### `onFailure(failure)`

Called for request and stream failures.

- Return `void` to keep the original message.
- Return `{ message }` to override the client-facing message.

Override behavior:

- request failures return JSON `{ error: message }`
- stream failures use `health.detail = message`

`failure.stage` is one of:

- `request-validation`
- `channel-resolution`
- `topic-validation`
- `authorization`
- `reauthorization`
- `stream`

### `<RealtimeManager />`

Props:

| Prop | Required | Description |
| --- | --- | --- |
| `endpoint` | No | Realtime endpoint URL. Default: `"/api/events"` |
| `subscriptions` | Yes | Array of `RealtimeSubscription` |
| `onFailure` | No | Client-side failure callback |
| `children` | No | Svelte snippet children |

`RealtimeSubscription` shape:

| Field | Required | Description |
| --- | --- | --- |
| `channel` | Yes | `Realtime.Channel` or channel definition |
| `channelParams` | No | String param for channel builders |
| `topics` | No | Explicit topic list (defaults to all channel topics) |
| `params` | No | Request params sent to endpoint |

Notes:

- Duplicate subscriptions resolving to the same `channelId` throw immediately.
- Topic lists are normalized (deduped and sorted) before connection signatures are computed.

### Hook reference

#### `getRealtimeBus()`

Returns the full bus context from `RealtimeManager`.

Throws if called outside a `RealtimeManager` subtree.

#### `getRealtimeBusState(channel, channelParams?)`

Returns channel-scoped context:

- `channelId`
- `topics`
- `select(eventName)` from `sveltekit-sse`
- `health` as Svelte 5 state wrapper (`health.current`)

Throws when the requested channel is not currently active.

#### `getRealtimeBusTopicJson(channel, topic, options?)`

Returns `Readable<TOutput | null>` for the latest parsed message matching the selected topic.

`options`:

| Option | Description |
| --- | --- |
| `channelParams` | Channel builder param for composite channels |
| `map(message)` | Map envelope to custom output |
| `or({ error, raw, previous })` | JSON parse fallback to recover/retain value |

#### `getRealtimeBusTopicState(channel, topic, options?)`

Same behavior as `getRealtimeBusTopicJson`, but wrapped in Svelte 5 state-first shape:

- read with `.current`
- type: `ReactiveCurrent<TOutput | null>`

## Request Payload

Realtime manager sends this JSON payload to your endpoint:

```json
{
  "channel": "demo",
  "topics": ["message", "admin-message"],
  "params": { "scope": "limited" }
}
```

Rules:

- `channel` is required
- `topics` is optional (defaults to all topics in the resolved channel)
- `params` values are normalized to primitives or `null`

## Runtime Behavior and Status Matrix

### Request-time status codes

| Status | Stage | Meaning |
| --- | --- | --- |
| `400` | `request-validation` | Invalid JSON body or missing `channel` |
| `400` | `channel-resolution` | Requested channel is not available |
| `500` | `channel-resolution` | Multiple registry entries match requested channel |
| `400` | `topic-validation` | Unknown requested topics |
| `403` | `authorization` | `authorize` denied or filtered to zero topics |
| `500` | `channel-resolution` | Channel builder/params resolution failure |

### Health stream semantics

Server emits `health` events:

- `connecting`: stream bootstrap started
- `connected`: stream is live
- `degraded`: failure occurred; stream closes fail-closed

When `degraded`, `health.detail` carries the resolved error message (including `onFailure` overrides).

### Per-message reauthorization semantics

If `reauthorizeOnEachMessage` is enabled, each message is checked before emit:

1. message must include a valid configured topic
2. topic must be in originally authorized topic set
3. if `reauthorize` exists, it must return exactly `true`
4. otherwise `authorize` is re-run with `topics: [message.topic]`

Any failure degrades and closes the stream before the message is emitted.

## Patterns

### Composite channels

Composite channel entries are matched by resolved channel name.

```ts
const userChannel = channel((userId: string) => `user:${userId}`);

createRealtimeEndpoint({
  inngest,
  channels: {
    user: {
      channel: userChannel,
      channelParams: (_event, requestedChannelId) => {
        return requestedChannelId.slice("user:".length);
      },
      authorize: () => true,
    },
  },
});
```

### Nested `RealtimeManager` components

You can nest managers to scope subscriptions by subtree. Each manager creates and owns connections for its own `subscriptions` list.

## Local Demo Setup

This repository includes a full demo app.

### 1. Configure env

```bash
cp example.env .env
```

`example.env` includes:

- `INNGEST_DEV`
- `INNGEST_BASE_URL`
- `INNGEST_EVENT_KEY`
- optional `INNGEST_SIGNING_KEY`

### 2. Start local Inngest dev server

```bash
docker compose up
```

This uses `/Users/whodges/dev/novadx/sveltekit-inngest/docker-compose.yaml` and points Inngest to `http://host.docker.internal:5173/api/inngest`.

### 3. Run SvelteKit app

```bash
bun run dev
```

Then open:

- `http://localhost:5173/` (main demo)
- `http://localhost:5173/nested` (nested manager demo)

## Development and Release Commands

```bash
# type and svelte diagnostics
bun run check

# package-quality build + publint
bun run build

# release gate (check + build + npm pack dry run)
bun run release:verify
```

Test scripts are intentionally not included right now.

## Troubleshooting

### `getRealtimeBus() requires <RealtimeManager>...`

A hook is being called outside a `RealtimeManager` subtree.

### `Realtime channel "..." is not active`

The requested channel (or `channelParams`) does not match any active subscription.

### Request fails with `400 Requested channel is not available`

- `payload.channel` does not match any resolved registry channel name
- `channelParams` resolver produced unexpected channel name

### Request fails with `500 Realtime channel registry is ambiguous`

Multiple registry entries resolve to the same `channel.name`. Ensure one unique match per requested channel.

### Stream degrades immediately

Check `health.detail` and server `onFailure` logs. Common causes:

- per-message reauthorization denied
- invalid emitted topic envelope
- thrown error inside auth callbacks

### Client receives no topic updates

- ensure topic is included in subscription or allowed by auth filter
- verify published messages include matching `topic`
- verify channel IDs and `channelParams` are consistent between client and server

## Breaking Changes (Bus-First Release)

This release is intentionally not backward compatible with older single-channel APIs.

Removed client APIs:

- `getRealtime()`
- `getRealtimeState()`
- `getRealtimeTopicJson(topic, ...)`
- `getRealtimeTopicState(topic, ...)`

Removed server shape:

- `createRealtimeEndpoint({ channel, channelParams, authorize })`

Migration note:

- `channelArgs` was renamed to `channelParams` (server + client). No alias is provided.

Use:

- `createRealtimeEndpoint({ channels: { ... } })`
- `<RealtimeManager subscriptions={...} />`
- `getRealtimeBus*` hooks

## License

MIT
