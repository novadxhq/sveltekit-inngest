<script lang="ts">
	import Button from "$demo/ui/components/ui/button/button.svelte";
	import {demoChannel} from "$demo/channels.js";
	import {triggerInngestDemo} from "$demo/remote/demo.remote.js";
	import {getRealtimeState, getRealtimeTopicState} from "$lib/index.js";
	import {toast} from "svelte-sonner";

	const {health} = getRealtimeState();
	const message = getRealtimeTopicState<typeof demoChannel, "message">(
		"message",
	);

	let something = $state("hello, world");
</script>

<div class="grid gap-4">
	<p>
		Health:
		{#if health.current}
			{health.current.ok ? "Connected" : "Degraded"} ({health.current.status})
			at
			{new Date(health.current.ts).toLocaleTimeString()}
			{#if health.current.detail}
				- {health.current.detail}
			{/if}
			{#if health.current.ts}
				{health.current.ts}
			{/if}
		{:else}
			Waiting for health updates...
		{/if}
	</p>

	<div class="grid gap-4">
		{#if message.current}
			<pre>{JSON.stringify(message.current, null, 2)}</pre>
			<p>Run ID: {message.current.runId ?? "n/a"}</p>
			<p>Created At: {message.current.createdAt ?? "n/a"}</p>
		{:else}
			<span>Waiting for messages...</span>
		{/if}
	</div>

	<input class="border border-border" bind:value={something} />

	<Button
		onclick={async () => {
			await triggerInngestDemo(something);
			toast("triggered demo");
		}}
	>
		Trigger Demo
	</Button>
</div>
