# sveltekit-inngest
`sveltekit-inngest` gives you typed realtime subscriptions in SvelteKit using Inngest + SSE. It pairs a small client manager with a server endpoint helper so your topic payloads, health state, and authorization flow all line up.

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
pnpm add sveltekit-inngest
# or
npm install sveltekit-inngest
# or
bun add sveltekit-inngest
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
import { createRealtimeEndpoint } from "sveltekit-inngest/server";
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
	import { RealtimeManager } from "sveltekit-inngest/client";
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
	import { getRealtimeState, getRealtimeTopicState } from "sveltekit-inngest/client";
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

#### Full options shape

```ts
createRealtimeEndpoint({
	inngest, // required
	channel, // required
	channelArgs, // optional: unknown[] | (event) => unknown[] | Promise<unknown[]>
	healthCheck, // optional: { enabled?: boolean; intervalMs?: number }
	authorize, // optional: ({ event, locals, request, channelId, topics, params }) => ...
	heartbeatMs, // deprecated compatibility field
});
```

#### Minimal endpoint (`inngest` + `channel`)

```ts
import { createRealtimeEndpoint } from "sveltekit-inngest/server";
import { inngest } from "$lib/server/inngest";
import { demoChannel } from "$lib/realtime/channels";

export const POST = createRealtimeEndpoint({
	inngest,
	channel: demoChannel,
});
```

#### `channel`: object or factory

`channel` can be either a channel object or a channel factory function.

```ts
import { channel, topic } from "@inngest/realtime";
import { z } from "zod";

const messageTopic = topic("message").schema(z.object({ text: z.string() }));

export const orgChannel = (orgId: string) =>
	channel(`org:${orgId}`).addTopic(messageTopic);
```

#### `channelArgs`: static args for channel factories

```ts
export const POST = createRealtimeEndpoint({
	inngest,
	channel: orgChannel,
	channelArgs: ["acme-org-id"],
});
```

#### `channelArgs`: derive args from `RequestEvent`

```ts
export const POST = createRealtimeEndpoint({
	inngest,
	channel: orgChannel,
	channelArgs: async (event) => {
		const orgId = event.locals.user?.orgId ?? "";
		return [orgId];
	},
});
```

#### `authorize(context)`: allow all

```ts
export const POST = createRealtimeEndpoint({
	inngest,
	channel: demoChannel,
	authorize: () => true,
});
```

#### `authorize(context)`: deny request

```ts
export const POST = createRealtimeEndpoint({
	inngest,
	channel: demoChannel,
	authorize: ({ locals }) => !!locals.user, // false -> 403 { error: "Forbidden" }
});
```

#### `authorize(context)`: allow only some topics

```ts
export const POST = createRealtimeEndpoint({
	inngest,
	channel: demoChannel,
	authorize: ({ topics, params, locals }) => {
		if (!locals.user) return false;
		if (params?.scope !== "limited") return true;

		return {
			allowedTopics: topics.filter((topic) => topic === "message"),
		};
	},
});
```

`authorize` context contains:

- `event`: full SvelteKit `RequestEvent`
- `locals`: typed locals (generic `TLocals`)
- `request`: raw `Request`
- `channelId`: resolved channel name
- `topics`: requested topics after channel validation
- `params`: scalar request metadata (`string | number | boolean | null`)

If `authorize` throws, the endpoint responds with `403` and the thrown error message.

Typed `locals` example:

```ts
type LocalUser = {
	id: string;
	role: "admin" | "member";
};

export const POST = createRealtimeEndpoint<typeof demoChannel, App.Locals & { user?: LocalUser }>({
	inngest,
	channel: demoChannel,
	authorize: ({ locals }) => locals.user?.role === "admin",
});
```

#### `healthCheck`: default, custom interval, disabled

Default behavior (when omitted):

- `enabled: true`
- `intervalMs: 5000`

Custom interval:

```ts
export const POST = createRealtimeEndpoint({
	inngest,
	channel: demoChannel,
	healthCheck: {
		intervalMs: 10_000,
	},
});
```

Disable periodic ticks (connection lifecycle events still emit):

```ts
export const POST = createRealtimeEndpoint({
	inngest,
	channel: demoChannel,
	healthCheck: {
		enabled: false,
		// intervalMs: 0 also disables periodic ticks
	},
});
```

#### `heartbeatMs` (deprecated)

`heartbeatMs` is kept for compatibility and should be treated as deprecated/no-op. Use `healthCheck.intervalMs` for new code.

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

- `topics` is optional. If omitted or empty, all topics from the resolved channel are used.
- `params` is optional. Only scalar values are retained (`string`, `number`, `boolean`, `null`).
- SSE events emitted: `message` (realtime payload JSON), `health` (health payload JSON).
- Unknown topics return `400` JSON.
- Denied requests return `403` JSON and do not open an SSE stream.
- Health moves through `connecting`, `connected`, then `degraded` on failures.

#### Validation and error responses

Invalid JSON/body shape:

```json
{ "error": "Invalid request body" }
```

Missing `channel`:

```json
{ "error": "Missing channel" }
```

Requested channel does not match configured channel:

```json
{ "error": "Requested channel is not available" }
```

Requested topics include unknown topic names:

```json
{
	"error": "Requested topics are not available",
	"invalidTopics": ["unknown.topic"]
}
```

Denied/filtered to zero topics:

```json
{ "error": "Forbidden" }
```

#### SSE payload examples

Health event (`event: health`):

```json
{ "ok": true, "status": "connecting", "ts": 1730900000000 }
```

```json
{ "ok": true, "status": "connected", "ts": 1730900005000 }
```

```json
{ "ok": false, "status": "degraded", "ts": 1730900010000, "detail": "..." }
```

Message event (`event: message`) forwards the full Inngest envelope as JSON without reshaping.

## Troubleshooting

- `getRealtimeState() requires <RealtimeManager> in the component tree.`: Ensure the consuming component is rendered under `<RealtimeManager>`.
- Endpoint returns `403`: Confirm your `authorize` logic and auth state in `locals`.
- No messages for a topic: Verify channel name and topic names match your `@inngest/realtime` definitions.
- `createdAt` is not a `Date`: SSE payloads are JSON-parsed, so `createdAt` arrives as a string.

## Contributing

PRs are welcome. Please include a clear explanation of the behavior you are changing and why.

## License

[MIT](./LICENSE)
