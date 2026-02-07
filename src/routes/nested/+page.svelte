<script lang="ts">
	import {RealtimeManager} from "$lib/index.js";
	import {demoChannel, secondDemoChannel} from "$demo/channels.js";
	import RealtimePanel from "../realtime-panel.svelte";
	import NestedPanel from "./nested-panel.svelte";
</script>

<div class="grid grid-cols-2 gap-4 p-6">
	<div class="grid gap-4 border border-border rounded-md p-3">
		<RealtimeManager endpoint="/api/events" channel={demoChannel}>
			<h4>Parent</h4>
			<RealtimePanel />

			<h3>Nested</h3>
			<RealtimeManager endpoint="/api/nested" channel={secondDemoChannel}>
				<p>This is the second realtime panel:</p>
				<NestedPanel />
			</RealtimeManager>
		</RealtimeManager>
	</div>
</div>
