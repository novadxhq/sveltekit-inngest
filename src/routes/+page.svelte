<script lang="ts">
	import {demoChannel, demoUserId, userChannel} from "$demo/channels.js";
	import {RealtimeManager} from "$lib/index.js";
	import RealtimePanel from "./realtime-panel.svelte";

	const subscriptions = [
		{channel: demoChannel},
		{channel: userChannel, channelParams: demoUserId},
	];
</script>

<div class="min-h-dvh bg-linear-to-b from-background to-muted/30">
	<div class="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 sm:px-6 lg:px-8">
		<header class="grid gap-2">
			<p
				class="text-xs font-medium uppercase tracking-wide text-muted-foreground"
			>
				Realtime Auth Demo
			</p>
			<h1 class="text-2xl font-semibold tracking-tight sm:text-3xl">
				Global Endpoint Access Control Playground
			</h1>
			<p class="max-w-4xl text-sm text-muted-foreground sm:text-base">
				Use this page to validate topic-level permissions and per-message
				reauthorization behavior while staying on a single realtime endpoint,
				including a user-scoped composite channel.
			</p>
		</header>

		<RealtimeManager
			endpoint="/api/events"
			{subscriptions}
			onFailure={() => {
				alert(
					"Failed to connect to realtime endpoint. Please check your connection and try again.",
				);
			}}
		>
			<RealtimePanel />
		</RealtimeManager>
	</div>
</div>
