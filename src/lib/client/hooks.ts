import { derived, fromStore, type Readable } from "svelte/store";
import { getRealtimeContext, type RealtimeBusChannelContextValue } from "./context.js";
import type {
  ChannelInput,
  RealtimeHealthState,
  RealtimeTopicEnvelope,
  RealtimeTopicMessage,
  RealtimeTopicState,
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

export function getRealtimeBusState<TChannel extends ChannelInput>(
  channel: TChannel,
  channelParams?: string
): Omit<RealtimeBusChannelContextValue, "health"> & {
  health: RealtimeHealthState;
} {
  const channelContext = getChannelContext(channel, channelParams);

  return {
    channelId: channelContext.channelId,
    topics: channelContext.topics,
    select: channelContext.select,
    health: channelContext.healthState ?? fromStore(channelContext.health),
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
  const { select } = getRealtimeBusState(channel, options.channelParams);

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
