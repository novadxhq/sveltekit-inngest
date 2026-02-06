<script lang="ts">
	import { RealtimeManager } from "$lib/index.js";
	import { demoChannel } from "$demo/channels.js";
	import RealtimePanel from "./realtime-panel.svelte";
</script>

<div class="p-4">
	<RealtimeManager channel={demoChannel}>
		<RealtimePanel />
	</RealtimeManager>
</div>
