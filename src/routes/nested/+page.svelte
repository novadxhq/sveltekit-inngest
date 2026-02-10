<script lang="ts">
  import Badge from "$demo/ui/components/ui/badge/badge.svelte";
  import { demoChannel, secondDemoChannel } from "$demo/channels.js";
  import { RealtimeManager } from "$lib/index.js";
  import RealtimePanel from "../realtime-panel.svelte";
  import NestedPanel from "./nested-panel.svelte";

  const outerSubscriptions = [{ channel: demoChannel }];
  const innerSubscriptions = [{ channel: secondDemoChannel }];
</script>

<div class="min-h-dvh bg-gradient-to-b from-background via-muted/20 to-background">
  <div class="mx-auto grid w-full max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:px-8">
    <header class="grid gap-3">
      <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Realtime Composition Demo
      </p>
      <h1 class="text-2xl font-semibold tracking-tight sm:text-3xl">
        Nested RealtimeManager Components
      </h1>
      <p class="max-w-4xl text-sm text-muted-foreground sm:text-base">
        This page demonstrates nested <code>&lt;RealtimeManager /&gt;</code>
        components sharing a single global endpoint. The outer manager subscribes
        to <code>demo</code>, and the nested manager in the inner subtree subscribes
        to <code>second-demo</code>.
      </p>
      <div class="flex flex-wrap gap-2">
        <Badge variant="outline">Global endpoint: /api/events</Badge>
        <Badge variant="secondary">Outer manager: demo</Badge>
        <Badge variant="secondary">Inner manager: second-demo</Badge>
      </div>
    </header>

    <RealtimeManager endpoint="/api/events" subscriptions={outerSubscriptions}>
      <section class="grid gap-4 rounded-xl border border-border/70 bg-background/95 p-4 shadow-sm sm:p-6">
        <div class="grid gap-1">
          <h2 class="text-xl font-semibold">Outer Manager Scope</h2>
          <p class="text-sm text-muted-foreground">
            Everything below can access the <code>demo</code> channel through the outer
            manager context.
          </p>
        </div>

        <RealtimePanel />

        <div class="grid gap-4 rounded-xl border border-dashed border-primary/40 bg-muted/20 p-4 sm:p-6">
          <div class="grid gap-1">
            <h3 class="text-lg font-semibold">Inner Nested Manager Scope</h3>
            <p class="text-sm text-muted-foreground">
              This subtree mounts a second manager dedicated to
              <code>second-demo</code>, including its own reauthorization flow.
            </p>
          </div>

          <RealtimeManager endpoint="/api/events" subscriptions={innerSubscriptions}>
            <NestedPanel />
          </RealtimeManager>
        </div>
      </section>
    </RealtimeManager>
  </div>
</div>
