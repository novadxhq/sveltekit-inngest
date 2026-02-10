<script lang="ts">
	import {Toaster} from "svelte-sonner";
	import "./layout.css";
	import {ModeWatcher} from "mode-watcher";

	const {children} = $props();
</script>

<Toaster />
<ModeWatcher defaultMode="dark" />

<div class="grid grid-cols-2 gap-4 p-4">
	<a class="p-3 border border-border rounded-md text-center" href="/"
		>Normal Demo</a
	>
	<a class="p-3 border border-border rounded-md text-center" href="/nested"
		>Nested Realtime Demo</a
	>
</div>

{@render children()}
