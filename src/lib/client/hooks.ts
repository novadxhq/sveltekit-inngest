import { onDestroy } from "svelte";
import { derived, fromStore, type Readable } from "svelte/store";
import { getRealtimeContext, type RealtimeBusChannelContextValue } from "./context.js";
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

type TopicJsonOptions<
  TChannel extends ChannelInput,
  TTopic extends TopicKey<TChannel>,
  TOutput,
> = {
  channelParams?: string;
  map?: (message: RealtimeTopicMessage<TChannel, TTopic>) => TOutput;
  or?: (
    payload: JsonPredicatePayload<RealtimeTopicMessage<TChannel, TTopic>>
  ) => RealtimeTopicMessage<TChannel, TTopic> | null;
};

const resolveChannel = <TInput extends ChannelInput>(
  input: TInput,
  channelParam?: string
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

export function getRealtimeBus() {
  const context = getRealtimeContext();
  if (!context) {
    throw new Error(
      "getRealtimeBus() requires <RealtimeManager> in the component tree."
    );
  }

  return context;
}

const getChannelContext = <TChannel extends ChannelInput>(
  channel: TChannel,
  channelParams?: string
): RealtimeBusChannelContextValue => {
  const context = getRealtimeBus();
  const channels = context.channelsState ?? fromStore(context.channels);
  const channelId = resolveChannel(channel, channelParams).name;
  const channelContext = channels.current[channelId];

  if (!channelContext) {
    const activeChannels = Object.keys(channels.current);
    throw new Error(
      `Realtime channel "${channelId}" is not active. Active channels: ${activeChannels.join(", ") || "none"}.`
    );
  }

  return channelContext;
};

const createParsedMessagesFactory = <TChannel extends ChannelInput>(
  channelContext: RealtimeBusChannelContextValue
) => {
  let parsedMessages:
    | Readable<RealtimeTopicMessage<TChannel, TopicKey<TChannel>> | null>
    | undefined;

  return () => {
    if (parsedMessages) return parsedMessages;

    parsedMessages =
      channelContext.select("message").json<
        RealtimeTopicMessage<TChannel, TopicKey<TChannel>>
      >(
        ({
          previous,
        }: {
          previous: RealtimeTopicMessage<TChannel, TopicKey<TChannel>> | null;
        }) => previous ?? null
      );

    return parsedMessages;
  };
};

export function getRealtimeBusState<TChannel extends ChannelInput>(
  channel: TChannel,
  channelParams?: string
): RealtimeBusState<TChannel> {
  const channelContext = getChannelContext(channel, channelParams);
  const getParsedMessages = createParsedMessagesFactory<TChannel>(channelContext);
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
      handler: RealtimeTopicHandler<TChannel, TTopic>
    ) => {
      let skipInitial = true;

      const stop = getParsedMessages().subscribe((message) => {
        if (skipInitial) {
          skipInitial = false;
          return;
        }

        if (!message || message.topic !== topic) return;

        const typedMessage = message as RealtimeTopicMessage<TChannel, TTopic>;

        void Promise.resolve(handler(typedMessage.data)).catch((error) => {
          console.error(
            `[sveltekit-inngest] onMessage handler failed for "${channelContext.channelId}:${String(topic)}".`,
            error
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

export function getRealtimeBusTopicJson<
  TChannel extends ChannelInput,
  TTopic extends TopicKey<TChannel>,
  TOutput = RealtimeTopicEnvelope<TChannel, TTopic>,
>(
  channel: TChannel,
  topic: TTopic,
  options: TopicJsonOptions<TChannel, TTopic, TOutput> = {}
): Readable<TOutput | null> {
  const { select } = getChannelContext(channel, options.channelParams);

  const parsedMessages = select("message").json<RealtimeTopicMessage<TChannel, TTopic>>(
    options.or ??
      (({ previous }: { previous: RealtimeTopicMessage<TChannel, TTopic> | null }) =>
        previous ?? null)
  );

  const mapMessage =
    options.map ??
    ((message: RealtimeTopicMessage<TChannel, TTopic>) =>
      message as TOutput);

  let previous: TOutput | null = null;

  return derived(parsedMessages, ($message) => {
    if (!$message || $message.topic !== topic) {
      return previous;
    }

    previous = mapMessage($message);
    return previous;
  });
}

export function getRealtimeBusTopicState<
  TChannel extends ChannelInput,
  TTopic extends TopicKey<TChannel>,
  TOutput = RealtimeTopicEnvelope<TChannel, TTopic>,
>(
  channel: TChannel,
  topic: TTopic,
  options: TopicJsonOptions<TChannel, TTopic, TOutput> = {}
): RealtimeTopicState<TOutput> {
  return fromStore(
    getRealtimeBusTopicJson<TChannel, TTopic, TOutput>(channel, topic, options)
  );
}
