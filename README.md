# @novadxhq/sveltekit-inngest

`@novadxhq/sveltekit-inngest` gives you typed realtime subscriptions in SvelteKit using Inngest + SSE. It pairs a small client manager with a server endpoint helper so your topic payloads, health state, and authorization flow all line up.

It is built for Svelte 5 and leans into state-first reads (`.current`) instead of store syntax.

## Features

- **Typed topic payloads** - Topic types come from your `@inngest/realtime` channel definitions.
- **Svelte 5 state-first API** - Read health and topic data through `getRealtimeState()` and `getRealtimeTopicState()`.
- **Single server helper** - `createRealtimeEndpoint()` handles request parsing, topic checks, authorization, and SSE wiring.
- **Built-in health events** - Streams `connecting`, `connected`, and `degraded` lifecycle updates.
- **Topic-level authorization** - Return `{ allowedTopics }` from `authorize` to scope subscriptions per request.
- **Compatibility helpers included** - `getRealtime()` and `getRealtimeTopicJson()` are still available for store-based usage.

## Requirements

This package is intended for **Svelte 5 + SvelteKit** projects and expects these peer dependencies:

- `svelte`
- `@sveltejs/kit`
- `sveltekit-sse`
- `@inngest/realtime`
- `inngest`

## Installation

```bash
pnpm add @novadxhq/sveltekit-inngest
# or
npm install @novadxhq/sveltekit-inngest
# or
bun add @novadxhq/sveltekit-inngest
```

## How to Use

### 1. Define your channel and topics

```ts
// src/lib/realtime/orders-channel.ts
import { channel, topic } from "@inngest/realtime";
import { z } from "zod";

const ordersUpdatedTopic = topic("orders.updated").schema(
	z.object({
		orderId: z.string(),
		status: z.string(),
	})
);

export const ordersChannel = channel("orders").addTopic(ordersUpdatedTopic);
```

### 2. Create the realtime SSE endpoint

```ts
// src/routes/api/events/+server.ts
import { createRealtimeEndpoint } from "@novadxhq/sveltekit-inngest/server";
import { ordersChannel } from "$lib/realtime/orders-channel";
import { inngest } from "$lib/server/inngest";

export const POST = createRealtimeEndpoint({
	inngest,
	channel: ordersChannel,
	healthCheck: {
		intervalMs: 5_000,
	},
	authorize: ({ locals, topics, params }) => {
		if (!locals.user) return false;

		if (params?.scope === "limited") {
			return {
				allowedTopics: topics.filter((topic) => topic === "orders.updated"),
			};
		}

		return true;
	},
});
```

### 3. Wrap UI with `RealtimeManager`

```svelte
<!-- src/routes/+page.svelte -->
<script lang="ts">
	import { RealtimeManager } from "@novadxhq/sveltekit-inngest";
	import { ordersChannel } from "$lib/realtime/orders-channel";
	import OrdersPanel from "./OrdersPanel.svelte";
</script>

<RealtimeManager endpoint="/api/events" channel={ordersChannel}>
	<OrdersPanel />
</RealtimeManager>
```

### 4. Read health and topic state in child components

```svelte
<!-- src/routes/OrdersPanel.svelte -->
<script lang="ts">
	import { getRealtimeState, getRealtimeTopicState } from "@novadxhq/sveltekit-inngest";
	import { ordersChannel } from "$lib/realtime/orders-channel";

	const { health } = getRealtimeState();
	const ordersUpdated = getRealtimeTopicState<typeof ordersChannel, "orders.updated">(
		"orders.updated"
	);
</script>

<p>
	{#if health.current}
		{health.current.ok ? "Connected" : "Degraded"} ({health.current.status})
	{:else}
		Connecting...
	{/if}
</p>

{#if ordersUpdated.current}
	<pre>{JSON.stringify(ordersUpdated.current, null, 2)}</pre>
{/if}
```

### 5. Return only `data` when you do not need the full envelope

By default, `getRealtimeTopicState()` returns the full Inngest envelope (`topic`, `data`, `runId`, `createdAt`, and more). If you only want the payload, map it:

```ts
const payloadOnly = getRealtimeTopicState<
	typeof ordersChannel,
	"orders.updated",
	{ orderId: string; status: string }
>("orders.updated", {
	map: (message) => message.data,
});
```

## API

### `<RealtimeManager />`

Provides realtime context to descendants and owns the client SSE connection.

#### `endpoint`

SSE route path. Default: `"/api/events"`.

---

#### `channel`

`Realtime.Channel` or channel definition from `@inngest/realtime`.

---

#### `channelArgs`

Optional argument list for channel definition factories.

---

#### `topics`

Optional explicit topic subset. If omitted, all channel topics are requested.

---

#### `params`

Optional scalar metadata sent in the request body and forwarded into `authorize`.

```ts
type RealtimeRequestParams = Record<string, string | number | boolean | null>;
```

### `getRealtimeState()`

Returns manager context with Svelte 5 state wrappers:

- `health.current` - current health payload (`ok`, `status`, `ts`, optional `detail`).
- `channelId`
- `topics`
- `select` (low-level `sveltekit-sse` selector access)

### `getRealtimeTopicState(topic, options?)`

Returns a state wrapper (`.current`) for a topic stream.

#### `options.map(message)`

Transforms each parsed message before it is stored.

#### `options.or(payload)`

Fallback parser hook when JSON parsing fails. Receives `{ error, raw, previous }`.

### `getRealtimeTopicJson(topic, options?)`

Store-based variant of `getRealtimeTopicState()` that returns a Svelte `Readable`.

### `getRealtime()`

Returns the raw realtime context (`health` as a `Readable`) and throws if called outside `<RealtimeManager>`.

### `createRealtimeEndpoint(options)`

Creates a SvelteKit `POST` `RequestHandler` that validates input, authorizes topics, subscribes to Inngest realtime, and emits SSE events.

#### `options.inngest`

Your Inngest client instance.

---

#### `options.channel`

Channel object or channel definition.

---

#### `options.channelArgs`

Optional static args or resolver:

```ts
channelArgs?: unknown[] | ((event: RequestEvent) => unknown[] | Promise<unknown[]>);
```

---

#### `options.healthCheck`

Controls health tick behavior:

```ts
healthCheck?: {
	intervalMs?: number; // default: 5000
	enabled?: boolean;   // default: true
};
```

---

#### `options.authorize(context)`

Optional authorization hook. Useful for auth checks and topic filtering.

`context` includes:

- `event`
- `locals`
- `request`
- `channelId`
- `topics`
- `params`

Allowed return values:

- `true` - allow requested topics.
- `false` - deny request (`403` JSON).
- `{ allowedTopics }` - allow only the intersection of requested and allowed topics.

---

#### `options.heartbeatMs` (deprecated)

Deprecated alias for heartbeat interval. Prefer `healthCheck.intervalMs`.

## Behavior and Contracts

- Endpoint method is `POST`.
- Request payload:

```json
{
	"channel": "orders",
	"topics": ["orders.updated"],
	"params": {
		"scope": "limited"
	}
}
```

- SSE events emitted: `message` (realtime payload JSON), `health` (health payload JSON).
- Unknown topics return `400` JSON.
- Denied requests return `403` JSON and do not open an SSE stream.
- Health moves through `connecting`, `connected`, then `degraded` on failures.

## Troubleshooting

- `getRealtimeState() requires <RealtimeManager> in the component tree.`: Ensure the consuming component is rendered under `<RealtimeManager>`.
- Endpoint returns `403`: Confirm your `authorize` logic and auth state in `locals`.
- No messages for a topic: Verify channel name and topic names match your `@inngest/realtime` definitions.
- `createdAt` is not a `Date`: SSE payloads are JSON-parsed, so `createdAt` arrives as a string.

## Contributing

PRs are welcome. Please include a clear explanation of the behavior you are changing and why.

## License

[MIT](./LICENSE)
