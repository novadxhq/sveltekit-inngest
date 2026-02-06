<script lang="ts">
	import {Toaster} from "svelte-sonner";
	import "./layout.css";
	import {ModeWatcher} from "mode-watcher";

	const {children} = $props();
</script>

<Toaster />
<ModeWatcher defaultMode="dark" />
{@render children()}
