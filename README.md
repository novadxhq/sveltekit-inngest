# @novadxhq/sveltekit-inngest

Svelte 5 utilities for building typed realtime subscriptions in SvelteKit with Inngest and SSE.

## What This Library Provides

- A client manager component (`RealtimeManager`) that owns the SSE connection.
- State-first client helpers (`getRealtimeState`, `getRealtimeTopicState`) for Svelte 5 `.current` reads.
- A server helper (`createRealtimeEndpoint`) that creates a `POST` SSE endpoint using `sveltekit-sse`.
- Typed topic payloads based on your `@inngest/realtime` channel definitions.
- Built-in connection health events (`connecting`, `connected`, `degraded`).

## Requirements

This package is for **Svelte 5 + SvelteKit** projects.

Your app must already include these peer dependencies:

- `svelte` (v5)
- `@sveltejs/kit`
- `sveltekit-sse`
- `@inngest/realtime`
- `inngest`

## Install

```sh
npm install @novadxhq/sveltekit-inngest
```

## Quick Start (End-to-End)

### 1. Define your channel and topic

```ts
// src/lib/realtime/orders-channel.ts
import { channel, topic } from "@inngest/realtime";
import { z } from "zod";

export const ordersUpdatedTopic = topic("orders.updated").schema(
	z.object({
		orderId: z.string(),
		status: z.string(),
	})
);

export const ordersChannel = channel("orders").addTopic(ordersUpdatedTopic);
```

### 2. Create the realtime endpoint

```ts
// src/routes/api/events/+server.ts
import { createRealtimeEndpoint } from "@novadxhq/sveltekit-inngest/server";
import { inngest } from "$lib/server/inngest";
import { ordersChannel } from "$lib/realtime/orders-channel";

export const POST = createRealtimeEndpoint({
	inngest,
	channel: ordersChannel,
	healthCheck: {
		intervalMs: 5_000,
	},
	authorize: ({ event, locals, topics, params }) => {
		// You have full RequestEvent access here.
		// Example: block unauthenticated users.
		if (!locals.user) return false;

		// Example: optionally filter allowed topics.
		if (params?.scope === "limited") {
			return {
				allowedTopics: topics.filter((topic) => topic === "orders.updated"),
			};
		}

		return true;
	},
});
```

### 3. Wrap your UI with `RealtimeManager`

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

### 4. Read topic state in a child component

```svelte
<!-- src/routes/OrdersPanel.svelte -->
<script lang="ts">
	import { getRealtimeState, getRealtimeTopicState } from "@novadxhq/sveltekit-inngest";
	import { ordersChannel } from "$lib/realtime/orders-channel";

	const { health } = getRealtimeState();
	const orderUpdated = getRealtimeTopicState<typeof ordersChannel, "orders.updated">(
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

{#if orderUpdated.current}
	<pre>{JSON.stringify(orderUpdated.current, null, 2)}</pre>
{/if}
```

## Client API

### `RealtimeManager`

Wraps children and provides realtime context to descendant components.

Common props:

- `endpoint`: SSE endpoint path (default: `"/api/events"`).
- `channel`: `Realtime.Channel` or channel definition.
- `channelArgs`: args for channel definitions that are factories.
- `topics`: optional subset of topic names.
- `params`: optional metadata sent to server authorize logic.

### `getRealtimeState()`

Returns state-first manager context:

- `health.current`: current health payload (`ok`, `status`, `ts`, optional `detail`).
- `channelId`, `topics`, `select` for lower-level usage.

### `getRealtimeTopicState(topic, options?)`

Returns a state wrapper (`.current`) for a topic stream.

By default, `.current` is the **full Inngest message envelope**, including fields like:

- `topic`
- `data`
- `runId`
- `createdAt`
- `kind`
- `envId`
- `fnId`

`createdAt` is a string on the client because SSE payloads are JSON-parsed.

If you only want `data`, map it:

```ts
const payloadOnly = getRealtimeTopicState<
	typeof ordersChannel,
	"orders.updated",
	{ orderId: string; status: string }
>("orders.updated", {
	map: (message) => message.data,
});
```

## Server API

### `createRealtimeEndpoint(options)`

Creates a SvelteKit `RequestHandler` for `POST` SSE.

Key options:

- `inngest`: your Inngest client instance.
- `channel`: channel object or channel definition.
- `channelArgs`: optional static array or resolver `(event) => unknown[]`.
- `healthCheck`: heartbeat control (`intervalMs`, `enabled`).
- `authorize`: access control callback per request.

`authorize` receives:

- `event`: full SvelteKit `RequestEvent`.
- `locals`, `request`, `channelId`, `topics`, `params`.

`authorize` return values:

- `true`: allow requested topics.
- `false`: deny request (`403` JSON).
- `{ allowedTopics }`: allow only a subset of requested topics.

## Behavior and Contracts

- Endpoint method: `POST`.
- Request body:

```json
{
	"channel": "orders",
	"topics": ["orders.updated"],
	"params": {
		"scope": "limited"
	}
}
```

- SSE events emitted by the endpoint:
  - `message`: realtime message payloads (JSON stringified).
  - `health`: connection health payloads (JSON stringified).
- Unauthorized requests return `403` JSON and no SSE stream.
- Health emits `connecting`, then `connected`, and `degraded` on failures.
- Heartbeat cadence is configurable via `healthCheck.intervalMs`.

## Compatibility APIs (Concise)

These alternatives are still available if you prefer store-returning helpers:

- `getRealtime()` -> returns context with `health` as a `Readable`.
- `getRealtimeTopicJson()` -> returns topic stream as a `Readable`.

The recommended Svelte 5 path is `getRealtimeState()` and `getRealtimeTopicState()` with `.current`.

## Troubleshooting

- `getRealtimeState() requires <RealtimeManager>...`
  - Ensure the component calling it is rendered under `<RealtimeManager>`.
- Endpoint returns `403`
  - Check your `authorize` callback and `locals` auth state.
- No topic messages
  - Confirm `channel` and topic names match your `@inngest/realtime` definitions.
- `createdAt` is not a `Date`
  - It is a string after JSON parsing; convert it in UI when needed.
