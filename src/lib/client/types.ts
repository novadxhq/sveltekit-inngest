import type { Realtime } from "@inngest/realtime";
import type { Snippet } from "svelte";

export type ChannelInput = Realtime.Channel | Realtime.Channel.Definition;

export type ResolvedChannel<T extends ChannelInput> =
  T extends Realtime.Channel.Definition
    ? Realtime.Channel.Definition.AsChannel<T>
    : T extends Realtime.Channel
      ? T
      : never;

type ChannelTopics<T extends ChannelInput> = Realtime.Channel.InferTopics<ResolvedChannel<T>>;

export type TopicKey<T extends ChannelInput> = keyof ChannelTopics<T> & string;

export type TopicData<T extends ChannelInput, K extends TopicKey<T>> =
  Realtime.Topic.InferSubscribe<ChannelTopics<T>[K]>;

export type HealthStatus = "connecting" | "connected" | "degraded";

export type HealthPayload = {
  ok: boolean;
  status: HealthStatus;
  ts: number;
  detail?: string;
};

export type RealtimeClientFailureSource =
  | "health"
  | "transport-close"
  | "transport-error";

export type RealtimeClientFailureContext = {
  endpoint: string;
  channelId: string;
  source: RealtimeClientFailureSource;
  message?: string;
  status?: number;
  statusText?: string;
  health?: HealthPayload;
};

/**
 * Svelte 5-compatible state wrapper from `fromStore(...)`.
 * Consumers can read values with `.current` instead of `$store` syntax.
 */
export type ReactiveCurrent<T> = {
  readonly current: T;
};

export type RealtimeHealthState = ReactiveCurrent<HealthPayload | null>;

export type RealtimeTopicState<T> = ReactiveCurrent<T | null>;

export type RealtimeRequestParams = Record<string, string | number | boolean | null>;

export type RealtimeSubscription<TChannel extends ChannelInput = ChannelInput> = {
  channel: TChannel;
  channelParams?: string;
  topics?: TopicKey<TChannel>[];
  params?: RealtimeRequestParams;
};

export type RealtimeResolvedSubscription = {
  channelId: string;
  topics: string[];
  params?: RealtimeRequestParams;
};

export type RealtimeManagerProps = {
  endpoint?: string;
  subscriptions: RealtimeSubscription[];
  onFailure?: (failure: RealtimeClientFailureContext) => void | Promise<void>;
  children?: Snippet;
};

export type RealtimeRequestPayload = {
  channel: string;
  topics?: string[];
  params?: RealtimeRequestParams;
};

export type RealtimeTopicEnvelope<
  TChannel extends ChannelInput,
  TTopic extends TopicKey<TChannel>,
> = {
  channel?: string;
  topic: TTopic;
  data: TopicData<TChannel, TTopic>;
  runId?: string;
  createdAt?: string;
  envId?: string;
  kind?: string;
  fnId?: string;
} & Record<string, unknown>;

export type RealtimeTopicMessage<
  TChannel extends ChannelInput,
  TTopic extends TopicKey<TChannel>,
> = RealtimeTopicEnvelope<TChannel, TTopic>;
