<script lang="ts">
	import {onMount} from "svelte";
	import Badge from "$demo/ui/components/ui/badge/badge.svelte";
	import Button from "$demo/ui/components/ui/button/button.svelte";
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle,
	} from "$demo/ui/components/ui/card/index.js";
	import {demoChannel, demoUserId, userChannel} from "$demo/channels.js";
	import {
		reauthAndConnect,
		triggerInngestAdminDemo,
		triggerInngestDemo,
		triggerReauthorizationWorkflow,
		triggerUserInngestDemo,
	} from "$demo/remote/demo.remote.js";
	import {getRealtimeBusState, getRealtimeBusTopicState} from "$lib/index.js";
	import {toast} from "svelte-sonner";

	const {health} = getRealtimeBusState(demoChannel);
	const message = getRealtimeBusTopicState<typeof demoChannel, "message">(
		demoChannel,
		"message"
	);
	const adminMessage = getRealtimeBusTopicState<
		typeof demoChannel,
		"admin-message"
	>(demoChannel, "admin-message");
	const userMessage = getRealtimeBusTopicState<typeof userChannel, "message">(
		userChannel,
		"message",
		{channelParams: demoUserId}
	);

	let messageInput = $state("hello, world");
	let adminMessageInput = $state("admin-only update");
	let userMessageInput = $state("hello from user channel");
	let reauthMessageInput = $state("reauth workflow test");
	let role = $state<"admin" | "member">("member");

	const readRole = (): "admin" | "member" => {
		if (typeof document === "undefined") return "member";
		return document.cookie.includes("demo-role=admin") ? "admin" : "member";
	};

	const setRole = (nextRole: "admin" | "member") => {
		if (typeof document === "undefined") return;
		document.cookie = `demo-role=${nextRole}; Path=/; Max-Age=31536000; SameSite=Lax`;
		role = nextRole;
		window.location.reload();
	};

	const healthBadgeVariant = () => {
		if (!health.current || health.current.status === "connecting")
			return "secondary";
		return health.current.ok ? "default" : "destructive";
	};

	onMount(() => {
		role = readRole();
	});
</script>

<div class="grid gap-6">
	<Card class="border-primary/20 bg-background/95">
		<CardHeader class="gap-3">
			<div class="flex flex-wrap items-center gap-2">
				<CardTitle>Connection and Role</CardTitle>
				<Badge variant={healthBadgeVariant()}
					>{health.current?.status ?? "connecting"}</Badge
				>
				<Badge variant={role === "admin" ? "default" : "outline"}>{role}</Badge>
			</div>
			<CardDescription>
				Switch role to verify topic-level access. Members should only see
				<code>message</code>. Admins can see <code>message</code> and
				<code>admin-message</code>.
			</CardDescription>
		</CardHeader>
		<CardContent class="grid gap-4">
			<div class="flex flex-wrap gap-2">
				<Button
					variant={role === "member" ? "default" : "outline"}
					onclick={() => setRole("member")}
				>
					Use Member
				</Button>
				<Button
					variant={role === "admin" ? "default" : "outline"}
					onclick={() => setRole("admin")}
				>
					Use Admin
				</Button>
			</div>

			<div
				class="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground"
			>
				{#if health.current}
					Last health update: {health.current.ok ? "Connected" : "Degraded"} at
					{new Date(health.current.ts).toLocaleTimeString()}
					{#if health.current.detail}
						• {health.current.detail}
					{/if}
				{:else}
					Waiting for health updates...
				{/if}
			</div>
		</CardContent>
	</Card>

	<div class="grid gap-4 lg:grid-cols-2">
		<Card>
			<CardHeader>
				<CardTitle>Public Topic (`message`)</CardTitle>
				<CardDescription>
					All authorized users for this channel should receive these updates.
				</CardDescription>
			</CardHeader>
			<CardContent>
				{#if message.current}
					<pre
						class="max-h-64 overflow-auto rounded-lg border bg-muted/40 p-3 text-xs">{JSON.stringify(
							message.current,
							null,
							2
						)}</pre>
					<div class="mt-3 grid gap-1 text-xs text-muted-foreground">
						<p>Run ID: {message.current.runId ?? "n/a"}</p>
						<p>Created At: {message.current.createdAt ?? "n/a"}</p>
					</div>
				{:else}
					<p class="text-sm text-muted-foreground">
						Waiting for public messages...
					</p>
				{/if}
			</CardContent>
		</Card>

		<Card>
			<CardHeader>
				<CardTitle>Admin Topic (`admin-message`)</CardTitle>
				<CardDescription>
					Only admin-authorized subscribers should receive these updates.
				</CardDescription>
			</CardHeader>
			<CardContent>
				{#if adminMessage.current}
					<pre
						class="max-h-64 overflow-auto rounded-lg border bg-muted/40 p-3 text-xs">{JSON.stringify(
							adminMessage.current,
							null,
							2
						)}</pre>
				{:else}
					<p class="text-sm text-muted-foreground">
						No admin messages visible for this role yet.
					</p>
				{/if}
			</CardContent>
		</Card>

		<Card>
			<CardHeader>
				<CardTitle>User Topic (`user:{demoUserId}`)</CardTitle>
				<CardDescription>
					Composite channel subscription for a single user-scoped stream.
				</CardDescription>
			</CardHeader>
			<CardContent>
				{#if userMessage.current}
					<pre
						class="max-h-64 overflow-auto rounded-lg border bg-muted/40 p-3 text-xs">{JSON.stringify(
							userMessage.current,
							null,
							2
						)}</pre>
				{:else}
					<p class="text-sm text-muted-foreground">
						No user-channel messages received yet.
					</p>
				{/if}
			</CardContent>
		</Card>
	</div>

	<Card>
		<CardHeader>
			<CardTitle>Trigger Events</CardTitle>
			<CardDescription>
				Use these controls to verify filtering and reauthorization behavior.
			</CardDescription>
		</CardHeader>
		<CardContent class="grid gap-4">
			<div class="grid gap-2 rounded-lg border p-3">
				<p class="text-sm font-medium">1) Public message test</p>
				<p class="text-xs text-muted-foreground">
					Sends only <code>message</code>. Both member and admin should receive
					it.
				</p>
				<div class="flex flex-col gap-2 sm:flex-row">
					<input
						id="demo-message"
						class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
						bind:value={messageInput}
					/>
					<Button
						class="sm:w-44"
						onclick={async () => {
							await triggerInngestDemo(messageInput);
							toast("triggered public message");
						}}
					>
						Send Public
					</Button>
				</div>
			</div>

			<div class="grid gap-2 rounded-lg border p-3">
				<p class="text-sm font-medium">2) Admin-only topic test</p>
				<p class="text-xs text-muted-foreground">
					Sends only <code>admin-message</code>. Admin should receive it; member
					should not.
				</p>
				<div class="flex flex-col gap-2 sm:flex-row">
					<input
						id="admin-message"
						class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
						bind:value={adminMessageInput}
					/>
					<Button
						variant="secondary"
						class="sm:w-44"
						onclick={async () => {
							await triggerInngestAdminDemo(adminMessageInput);
							toast("triggered admin-only message");
						}}
					>
						Send Admin
					</Button>
				</div>
			</div>

			<div class="grid gap-2 rounded-lg border p-3">
				<p class="text-sm font-medium">3) User composite channel test</p>
				<p class="text-xs text-muted-foreground">
					Sends a message to <code>user:{demoUserId}</code> via
					<code>channelParams</code>.
				</p>
				<div class="flex flex-col gap-2 sm:flex-row">
					<input
						id="user-message"
						class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
						bind:value={userMessageInput}
					/>
					<Button
						variant="secondary"
						class="sm:w-52"
						onclick={async () => {
							await triggerUserInngestDemo({
								userId: demoUserId,
								message: userMessageInput,
							});
							toast(`triggered user channel message (${demoUserId})`);
						}}
					>
						Send User Event
					</Button>
				</div>
			</div>

			<div
				class="grid gap-2 rounded-lg border border-amber-300/50 bg-amber-50/30 p-3 dark:border-amber-500/40 dark:bg-amber-500/10"
			>
				<p class="text-sm font-medium">4) Reauthorization test</p>
				<p class="text-xs text-muted-foreground">
					Forces auth denial on the next emitted message. Active stream should
					become degraded and close.
				</p>
				<div class="flex flex-col gap-2 sm:flex-row">
					<input
						id="reauth-message"
						class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
						bind:value={reauthMessageInput}
					/>
					<Button
						variant="outline"
						class="sm:w-52"
						onclick={async () => {
							await triggerReauthorizationWorkflow(reauthMessageInput);
							toast("reauthorization workflow triggered");
						}}
					>
						Run Reauth Test
					</Button>
				</div>
				{#if !health.current || health.current.status !== "connected"}
					<div class="pt-1">
						<Button
							variant="default"
							class="w-full sm:w-52"
							onclick={async () => {
								await reauthAndConnect();
								toast("re-authenticated, reconnecting");
								window.location.reload();
							}}
						>
							Re-auth and Connect
						</Button>
					</div>
				{/if}
			</div>
		</CardContent>
	</Card>
</div>
