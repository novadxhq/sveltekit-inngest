<script lang="ts">
  import Badge from "$demo/ui/components/ui/badge/badge.svelte";
  import Button from "$demo/ui/components/ui/button/button.svelte";
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
  } from "$demo/ui/components/ui/card/index.js";
  import { secondDemoChannel } from "$demo/channels.js";
  import {
    reauthAndConnect,
    triggerNestedInngestDemo,
    triggerNestedReauthorizationWorkflow,
  } from "$demo/remote/demo.remote.js";
  import {
    getRealtimeBusState,
    getRealtimeBusTopicState,
  } from "$lib/index.js";
  import { toast } from "svelte-sonner";

  const { health } = getRealtimeBusState(secondDemoChannel);
  const message = getRealtimeBusTopicState<typeof secondDemoChannel, "message">(
    secondDemoChannel,
    "message",
  );

  let nestedMessageInput = $state("nested hello, world");
  let nestedReauthInput = $state("nested reauth workflow test");

  const healthBadgeVariant = () => {
    if (!health.current || health.current.status === "connecting") return "secondary";
    return health.current.ok ? "default" : "destructive";
  };
</script>

<div class="grid gap-4">
  <Card class="border-primary/20 bg-background/95">
    <CardHeader class="gap-3">
      <div class="flex flex-wrap items-center gap-2">
        <CardTitle>Second Channel (`second-demo`)</CardTitle>
        <Badge variant={healthBadgeVariant()}>{health.current?.status ?? "connecting"}</Badge>
      </div>
      <CardDescription>
        This panel is inside the nested manager and only reads
        <code>second-demo</code> events.
      </CardDescription>
    </CardHeader>
    <CardContent class="grid gap-4">
      <div class="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
        {#if health.current}
          {health.current.ok ? "Connected" : "Degraded"} at
          {new Date(health.current.ts).toLocaleTimeString()}
          {#if health.current.detail}
            • {health.current.detail}
          {/if}
        {:else}
          Waiting for health updates...
        {/if}
      </div>

      <div class="grid gap-2 rounded-lg border p-3">
        <p class="text-sm font-medium">Latest nested message (`message`)</p>
        {#if message.current}
          <pre class="max-h-64 overflow-auto rounded-lg border bg-muted/40 p-3 text-xs">{JSON.stringify(message.current, null, 2)}</pre>
          <div class="grid gap-1 text-xs text-muted-foreground">
            <p>Run ID: {message.current.runId ?? "n/a"}</p>
            <p>Created At: {message.current.createdAt ?? "n/a"}</p>
          </div>
        {:else}
          <p class="text-sm text-muted-foreground">Waiting for nested messages...</p>
        {/if}
      </div>
    </CardContent>
  </Card>

  <Card>
    <CardHeader>
      <CardTitle>Nested Channel Tests</CardTitle>
      <CardDescription>
        Trigger second-channel events and verify reauthorization closes/reconnects this nested stream.
      </CardDescription>
    </CardHeader>
    <CardContent class="grid gap-4">
      <div class="grid gap-2 rounded-lg border p-3">
        <p class="text-sm font-medium">1) Send nested message</p>
        <div class="flex flex-col gap-2 sm:flex-row">
          <input
            id="nested-message"
            class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            bind:value={nestedMessageInput}
          />
          <Button
            class="sm:w-44"
            onclick={async () => {
              await triggerNestedInngestDemo(nestedMessageInput);
              toast("triggered nested demo message");
            }}
          >
            Send Nested
          </Button>
        </div>
      </div>

      <div class="grid gap-2 rounded-lg border border-amber-300/50 bg-amber-50/30 p-3 dark:border-amber-500/40 dark:bg-amber-500/10">
        <p class="text-sm font-medium">2) Nested reauthorization test</p>
        <p class="text-xs text-muted-foreground">
          Forces auth denial on the next nested message, degrading and closing this stream.
        </p>
        <div class="flex flex-col gap-2 sm:flex-row">
          <input
            id="nested-reauth-message"
            class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            bind:value={nestedReauthInput}
          />
          <Button
            variant="outline"
            class="sm:w-52"
            onclick={async () => {
              await triggerNestedReauthorizationWorkflow(nestedReauthInput);
              toast("nested reauthorization workflow triggered");
            }}
          >
            Run Nested Reauth
          </Button>
        </div>
        {#if !health.current || health.current.status !== "connected"}
          <div class="pt-1">
            <Button
              class="w-full sm:w-52"
              onclick={async () => {
                await reauthAndConnect();
                toast("re-authenticated, reconnecting nested stream");
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
