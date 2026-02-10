<script lang="ts">
	import {RealtimeManager} from "$lib/index.js";
	import {demoChannel} from "$demo/channels.js";
	import RealtimePanel from "./realtime-panel.svelte";
</script>

<div class="grid gap-4 p-6">
	<div class="grid gap-4 border border-border rounded-md p-3">
		<RealtimeManager endpoint="/api/events" channel={demoChannel}>
			<p>This is the second realtime panel:</p>
			<RealtimePanel />
		</RealtimeManager>
	</div>
</div>
