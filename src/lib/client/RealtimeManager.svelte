<script lang="ts">
  import { onDestroy } from "svelte";
  import { fromStore, writable } from "svelte/store";
  import { source, type Event as SseEvent } from "sveltekit-sse";
  import {
    setRealtimeContext,
    type RealtimeBusChannelContextValue,
  } from "./context.js";
  import type {
    ChannelInput,
    HealthPayload,
    RealtimeClientFailureContext,
    RealtimeManagerProps,
    RealtimeResolvedSubscription,
    RealtimeSubscription,
    ResolvedChannel,
    TopicKey,
  } from "./types.js";

  let {
    endpoint = "/api/events",
    subscriptions = [],
    onFailure,
    children,
  }: RealtimeManagerProps = $props();

  type ManagedConnection = {
    signature: string;
    context: RealtimeBusChannelContextValue;
    stop: () => void;
  };

  const channels = writable<Record<string, RealtimeBusChannelContextValue>>({});
  const channelsState = fromStore(channels);
  const activeConnections: Record<string, ManagedConnection> = {};

  setRealtimeContext({
    channels,
    channelsState,
  });

  const resolveChannel = <TInput extends ChannelInput>(
    input: TInput,
    channelParam?: string,
  ): ResolvedChannel<TInput> => {
    if (typeof input === "function") {
      const channelFactory = input as unknown as (
        value?: string
      ) => ResolvedChannel<TInput>;
      return channelParam === undefined
        ? channelFactory()
        : channelFactory(channelParam);
    }

    return input as ResolvedChannel<TInput>;
  };

  const getDetail = (event: SseEvent): string | undefined => {
    if (event.error instanceof Error) return event.error.message;
    if (event.status >= 400) return `${event.status} ${event.statusText}`;
    return undefined;
  };

  const normalizeTopics = (topics: string[]): string[] =>
    [...new Set(topics)].sort();

  const serializeSignature = (
    subscription: RealtimeResolvedSubscription,
    currentEndpoint: string,
  ) =>
    JSON.stringify({
      endpoint: currentEndpoint,
      channel: subscription.channelId,
      topics: normalizeTopics(subscription.topics),
      params: subscription.params ?? null,
    });

  const resolveSubscriptions = (
    input: RealtimeSubscription[],
  ): RealtimeResolvedSubscription[] => {
    const resolved: RealtimeResolvedSubscription[] = [];
    const seen: string[] = [];

    for (const subscription of input) {
      const resolvedChannel = resolveChannel(
        subscription.channel,
        subscription.channelParams,
      );
      const channelId = resolvedChannel.name;

      if (seen.includes(channelId)) {
        throw new Error(
          `Duplicate realtime subscription for channel "${channelId}" is not allowed.`,
        );
      }

      seen.push(channelId);

      const requestedTopics = (
        subscription.topics?.length
          ? subscription.topics
          : (Object.keys(resolvedChannel.topics) as TopicKey<typeof subscription.channel>[])
      ) as string[];
      const topics = normalizeTopics(requestedTopics);

      resolved.push({
        channelId,
        topics,
        params: subscription.params,
      });
    }

    return resolved;
  };

  const createConnection = (
    subscription: RealtimeResolvedSubscription,
    currentEndpoint: string,
  ): ManagedConnection => {
    const health = writable<HealthPayload | null>({
      ok: true,
      status: "connecting",
      ts: Date.now(),
    });
    const healthState = fromStore(health);
    let lastFailureFingerprint: string | null = null;

    const reportFailure = (failure: RealtimeClientFailureContext) => {
      const failureFingerprint = JSON.stringify({
        message: failure.message ?? null,
        status: failure.status ?? null,
        statusText: failure.statusText ?? null,
      });

      if (failureFingerprint === lastFailureFingerprint) return;
      lastFailureFingerprint = failureFingerprint;

      if (!onFailure) return;
      void Promise.resolve(onFailure(failure)).catch(() => {
        // Swallow callback failures to avoid destabilizing connection lifecycle.
      });
    };

    const events = source(currentEndpoint, {
      cache: false,
      options: {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          channel: subscription.channelId,
          topics: subscription.topics,
          params: subscription.params,
        }),
      },
      open: () => {
        lastFailureFingerprint = null;
        health.set({
          ok: true,
          status: "connected",
          ts: Date.now(),
        });
      },
      close: (event: SseEvent) => {
        const detail = getDetail(event);
        if (!detail && event.status < 400) return;

        reportFailure({
          endpoint: currentEndpoint,
          channelId: subscription.channelId,
          source: "transport-close",
          message: detail,
          status: event.status,
          statusText: event.statusText,
        });

        health.set({
          ok: false,
          status: "degraded",
          ts: Date.now(),
          ...(detail ? { detail } : {}),
        });
      },
      error: (event: SseEvent) => {
        const detail = getDetail(event) ?? "Realtime connection error";

        reportFailure({
          endpoint: currentEndpoint,
          channelId: subscription.channelId,
          source: "transport-error",
          message: detail,
          status: event.status,
          statusText: event.statusText,
        });

        health.set({
          ok: false,
          status: "degraded",
          ts: Date.now(),
          detail,
        });
      },
    });

    const streamHealth = events
      .select("health")
      .json<HealthPayload>(
        ({ previous }: { previous: HealthPayload | null }) => previous ?? null,
      );

    const streamHealthUnsubscribe = streamHealth.subscribe(
      (value: HealthPayload | null) => {
        if (!value) return;

        health.set(value);

        if (value.ok) {
          lastFailureFingerprint = null;
          return;
        }

        reportFailure({
          endpoint: currentEndpoint,
          channelId: subscription.channelId,
          source: "health",
          message: value.detail,
          health: value,
        });
      },
    );

    const context: RealtimeBusChannelContextValue = {
      channelId: subscription.channelId,
      topics: subscription.topics,
      select: events.select,
      health,
      healthState,
    };

    return {
      signature: serializeSignature(subscription, currentEndpoint),
      context,
      stop: () => {
        streamHealthUnsubscribe();
        events.close();
      },
    };
  };

  const publishContext = () => {
    const nextChannels = Object.fromEntries(
      Object.entries(activeConnections).map(([channelId, connection]) => [
        channelId,
        connection.context,
      ]),
    );

    channels.set(nextChannels);
  };

  const syncConnections = (
    nextSubscriptions: RealtimeResolvedSubscription[],
    currentEndpoint: string,
  ) => {
    const nextByChannel = Object.fromEntries(
      nextSubscriptions.map((subscription) => [
        subscription.channelId,
        subscription,
      ]),
    );

    for (const [channelId, connection] of Object.entries(activeConnections)) {
      if (!(channelId in nextByChannel)) {
        connection.stop();
        delete activeConnections[channelId];
      }
    }

    for (const subscription of nextSubscriptions) {
      const nextSignature = serializeSignature(subscription, currentEndpoint);
      const existing = activeConnections[subscription.channelId];

      if (existing?.signature === nextSignature) {
        continue;
      }

      if (existing) {
        existing.stop();
        delete activeConnections[subscription.channelId];
      }

      activeConnections[subscription.channelId] = createConnection(
        subscription,
        currentEndpoint,
      );
    }

    publishContext();
  };

  const applySubscriptions = () => {
    syncConnections(resolveSubscriptions(subscriptions), endpoint);
  };

  applySubscriptions();

  $effect(() => {
    applySubscriptions();
  });

  onDestroy(() => {
    for (const connection of Object.values(activeConnections)) {
      connection.stop();
    }

    for (const channelId of Object.keys(activeConnections)) {
      delete activeConnections[channelId];
    }
    channels.set({});
  });
</script>

{@render children?.()}
