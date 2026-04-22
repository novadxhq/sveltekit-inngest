import { onDestroy } from "svelte";
import { derived, fromStore, type Readable } from "svelte/store";
import {
  getRealtimeContext,
  type RealtimeBusChannelContextValue,
  type RealtimeBusContextValue,
} from "./context.js";
import type {
  ChannelInput,
  RealtimeBusState,
  RealtimeTopicHandler,
  RealtimeTopicEnvelope,
  RealtimeTopicMessage,
  RealtimeTopicState,
  RealtimeUnsubscribe,
  ResolvedChannel,
  TopicKey,
} from "./types.js";

type JsonPredicatePayload<T> = {
  error: Error;
  raw: string;
  previous: T | null;
};

/**
 * Options for retained-value topic helpers such as
 * `getRealtimeBusTopicJson(...)` and `getRealtimeBusTopicState(...)`.
 */
type TopicJsonOptions<
  TChannel extends ChannelInput,
  TTopic extends TopicKey<TChannel>,
  TOutput,
> = {
  /** Parameter used when `channel` is a channel definition function. */
  channelParams?: string;
  /** Maps the parsed message envelope into a custom retained output shape. */
  map?: (message: RealtimeTopicMessage<TChannel, TTopic>) => TOutput;
  /**
   * Fallback invoked when JSON parsing fails.
   *
   * Return the previous value to preserve the last retained message, or `null`
   * to clear it.
   */
  or?: (
    payload: JsonPredicatePayload<RealtimeTopicMessage<TChannel, TTopic>>,
  ) => RealtimeTopicMessage<TChannel, TTopic> | null;
};

const resolveChannel = <TInput extends ChannelInput>(
  input: TInput,
  channelParam?: string,
): ResolvedChannel<TInput> => {
  if (typeof input === "function") {
    const channelFactory = input as unknown as (
      value?: string,
    ) => ResolvedChannel<TInput>;
    return channelParam === undefined
      ? channelFactory()
      : channelFactory(channelParam);
  }

  return input as ResolvedChannel<TInput>;
};

/**
 * Returns the realtime bus context from the nearest `<RealtimeManager />`.
 *
 * Most callers should prefer `getRealtimeBusState(channel, channelParams?)`
 * unless they need low-level access to the full channel registry.
 *
 * @example
 * ```ts
 * const bus = getRealtimeBus();
 * const activeChannels = Object.keys(bus.channelsState?.current ?? {});
 * ```
 *
 * @throws {Error} If called outside a `RealtimeManager` subtree.
 */
export function getRealtimeBus(): RealtimeBusContextValue {
  const context = getRealtimeContext();
  if (!context) {
    throw new Error(
      "getRealtimeBus() requires <RealtimeManager> in the component tree.",
    );
  }

  return context;
}

const getChannelContext = <TChannel extends ChannelInput>(
  channel: TChannel,
  channelParams?: string,
): RealtimeBusChannelContextValue => {
  const context = getRealtimeBus();
  const channels = context.channelsState ?? fromStore(context.channels);
  const channelId = resolveChannel(channel, channelParams).name;
  const channelContext = channels.current[channelId];

  if (!channelContext) {
    const activeChannels = Object.keys(channels.current);
    throw new Error(
      `Realtime channel "${channelId}" is not active. Active channels: ${activeChannels.join(", ") || "none"}.`,
    );
  }

  return channelContext;
};

const createParsedMessagesFactory = <TChannel extends ChannelInput>(
  channelContext: RealtimeBusChannelContextValue,
) => {
  let parsedMessages:
    | Readable<RealtimeTopicMessage<TChannel, TopicKey<TChannel>> | null>
    | undefined;

  return () => {
    if (parsedMessages) return parsedMessages;

    parsedMessages = channelContext
      .select("message")
      .json<
        RealtimeTopicMessage<TChannel, TopicKey<TChannel>>
      >(({ previous }: { previous: RealtimeTopicMessage<TChannel, TopicKey<TChannel>> | null }) => previous ?? null);

    return parsedMessages;
  };
};

/**
 * Returns the active channel-scoped realtime API for a subscribed channel.
 *
 * This is the preferred client entrypoint for handling realtime messages.
 * Use `onMessage(...)` for live event handling and `health.current` for
 * connection status.
 *
 * When `channel` is a channel definition function, `channelParams` must match
 * the value used in the corresponding `RealtimeManager` subscription.
 *
 * @example
 * ```ts
 * const { health, onMessage } = getRealtimeBusState(demoChannel);
 *
 * onMessage("message", async ({ data }) => {
 *   console.log(data.message);
 * });
 * ```
 *
 * @param channel Channel instance or channel definition to read from.
 * @param channelParams Parameter used when `channel` is a channel builder.
 * @throws {Error} If the requested channel is not currently active.
 */
export function getRealtimeBusState<TChannel extends ChannelInput>(
  channel: TChannel,
  channelParams?: string,
): RealtimeBusState<TChannel> {
  const channelContext = getChannelContext(channel, channelParams);
  const getParsedMessages =
    createParsedMessagesFactory<TChannel>(channelContext);
  const listenerStops = new Set<RealtimeUnsubscribe>();

  try {
    onDestroy(() => {
      for (const stop of [...listenerStops]) {
        stop();
      }
    });
  } catch {
    // Ignore when called outside component initialization.
  }

  return {
    channelId: channelContext.channelId,
    topics: channelContext.topics as TopicKey<TChannel>[],
    select: channelContext.select,
    health: channelContext.healthState ?? fromStore(channelContext.health),
    onMessage: <TTopic extends TopicKey<TChannel>>(
      topic: TTopic,
      handler: RealtimeTopicHandler<TChannel, TTopic>,
    ) => {
      let skipInitial = true;

      const stop = getParsedMessages().subscribe((message) => {
        if (skipInitial) {
          skipInitial = false;
          return;
        }

        if (!message || message.topic !== topic) return;

        const typedMessage = message as RealtimeTopicMessage<TChannel, TTopic>;

        void Promise.resolve(handler(typedMessage)).catch((error) => {
          console.error(
            `[sveltekit-inngest] onMessage handler failed for "${channelContext.channelId}:${String(topic)}".`,
            error,
          );
        });
      });

      let stopped = false;

      const unsubscribe: RealtimeUnsubscribe = () => {
        if (stopped) return;
        stopped = true;
        listenerStops.delete(unsubscribe);
        stop();
      };

      listenerStops.add(unsubscribe);

      return unsubscribe;
    },
  };
}

/**
 * Returns a retained readable containing the latest parsed message for a topic.
 *
 * This helper is best for display-oriented UI that wants the latest known value.
 * For side effects or live event handling, prefer `getRealtimeBusState(...).onMessage(...)`.
 *
 * @example
 * ```ts
 * const latestMessage = getRealtimeBusTopicJson(demoChannel, "message", {
 *   map: (message) => message.data.message,
 * });
 *
 * latestMessage.subscribe((value) => {
 *   console.log(value);
 * });
 * ```
 *
 * @param channel Channel instance or channel definition to read from.
 * @param topic Topic name whose latest message should be retained.
 * @param options Optional retained-value mapping and parsing controls.
 * @throws {Error} If the requested channel is not currently active.
 */
export function getRealtimeBusTopicJson<
  TChannel extends ChannelInput,
  TTopic extends TopicKey<TChannel>,
  TOutput = RealtimeTopicEnvelope<TChannel, TTopic>,
>(
  channel: TChannel,
  topic: TTopic,
  options: TopicJsonOptions<TChannel, TTopic, TOutput> = {},
): Readable<TOutput | null> {
  const { select } = getChannelContext(channel, options.channelParams);

  const parsedMessages = select("message").json<
    RealtimeTopicMessage<TChannel, TTopic>
  >(
    options.or ??
      (({
        previous,
      }: {
        previous: RealtimeTopicMessage<TChannel, TTopic> | null;
      }) => previous ?? null),
  );

  const mapMessage =
    options.map ??
    ((message: RealtimeTopicMessage<TChannel, TTopic>) => message as TOutput);

  let previous: TOutput | null = null;

  return derived(parsedMessages, ($message) => {
    if (!$message || $message.topic !== topic) {
      return previous;
    }

    previous = mapMessage($message);
    return previous;
  });
}

/**
 * @deprecated Use `onMessage(...)`. This will be removed in a future major release.
 * Returns the latest topic value wrapped in Svelte 5's `.current`-style access.
 *
 * This is the state-first variant of `getRealtimeBusTopicJson(...)`.
 *
 * @example
 * ```ts
 * const message = getRealtimeBusTopicState(demoChannel, "message");
 * console.log(message.current?.data.message);
 *
 * const userMessage = getRealtimeBusTopicState(userChannel, "message", {
 *   channelParams: "alice",
 * });
 * ```
 *
 * @param channel Channel instance or channel definition to read from.
 * @param topic Topic name whose latest message should be retained.
 * @param options Optional retained-value mapping and parsing controls.
 * @throws {Error} If the requested channel is not currently active.
 */
export function getRealtimeBusTopicState<
  TChannel extends ChannelInput,
  TTopic extends TopicKey<TChannel>,
  TOutput = RealtimeTopicEnvelope<TChannel, TTopic>,
>(
  channel: TChannel,
  topic: TTopic,
  options: TopicJsonOptions<TChannel, TTopic, TOutput> = {},
): RealtimeTopicState<TOutput> {
  return fromStore(
    getRealtimeBusTopicJson<TChannel, TTopic, TOutput>(channel, topic, options),
  );
}
