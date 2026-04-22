import type { Realtime } from "inngest/realtime";
import type { Snippet } from "svelte";
import type { SourceSelect } from "sveltekit-sse";

/**
 * Channel input accepted by the realtime client and server APIs.
 *
 * This can be either:
 * - a concrete `realtime.channel(...)` instance
 * - a channel definition function for parameterized channels such as `user:${id}`
 *
 * @example
 * ```ts
 * const publicChannel: ChannelInput = demoChannel;
 * const scopedChannel: ChannelInput = userChannel;
 * ```
 */
export type ChannelInput = Realtime.ChannelInstance | Realtime.ChannelDef;

/**
 * Resolves a {@link ChannelInput} into its concrete channel instance type.
 */
export type ResolvedChannel<T extends ChannelInput> =
  T extends Realtime.ChannelDef
    ? ReturnType<T>
    : T extends Realtime.ChannelInstance
      ? T
      : never;

type ChannelTopics<T extends ChannelInput> = ResolvedChannel<T>["topics"];

/**
 * Union of valid topic names for a channel.
 *
 * @example
 * ```ts
 * type DemoTopics = TopicKey<typeof demoChannel>;
 * // "message" | "admin-message"
 * ```
 */
export type TopicKey<T extends ChannelInput> = keyof ChannelTopics<T> & string;

/**
 * Infers the topic payload data from an Inngest realtime channel definition.
 *
 * @example
 * ```ts
 * type DemoMessagePayload = TopicData<typeof demoChannel, "message">;
 * // { message: string }
 * ```
 */
export type TopicData<
  T extends ChannelInput,
  K extends TopicKey<T>,
> = ChannelTopics<T>[K] extends Realtime.TopicConfig
  ? Realtime.InferTopicData<ChannelTopics<T>[K]>
  : never;

/**
 * Connection lifecycle statuses emitted through the built-in `health` stream.
 */
export type HealthStatus = "connecting" | "connected" | "degraded";

/**
 * Structured connection-health payload emitted by the realtime client.
 */
export type HealthPayload = {
  /** Whether the underlying stream is currently healthy. */
  ok: boolean;
  /** Current lifecycle status for the channel connection. */
  status: HealthStatus;
  /** Unix timestamp in milliseconds for when this health value was emitted. */
  ts: number;
  /** Optional failure detail when the connection is degraded. */
  detail?: string;
};

/**
 * Origin of a client-side realtime failure notification.
 */
export type RealtimeClientFailureSource =
  | "health"
  | "transport-close"
  | "transport-error";

/**
 * Context passed to `RealtimeManager.onFailure(...)` for client-side failures.
 */
export type RealtimeClientFailureContext = {
  /** Realtime endpoint used by the active stream. */
  endpoint: string;
  /** Channel id associated with the failure. */
  channelId: string;
  /** Which part of the client lifecycle reported the failure. */
  source: RealtimeClientFailureSource;
  /** Human-readable failure message, when available. */
  message?: string;
  /** HTTP or transport status code, when available. */
  status?: number;
  /** HTTP or transport status text, when available. */
  statusText?: string;
  /** Latest health payload associated with the failure, when available. */
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

/**
 * Svelte 5-compatible state wrapper for retained topic values.
 */
export type RealtimeTopicState<T> = ReactiveCurrent<T | null>;

/**
 * Cleanup function returned by realtime subscriptions and listeners.
 *
 * @example
 * ```ts
 * const stop = onMessage("message", (payload) => {
 *   console.log(payload.message);
 * });
 *
 * stop();
 * ```
 */
export type RealtimeUnsubscribe = () => void;

/**
 * Topic listener registered through `getRealtimeBusState(...).onMessage(...)`.
 *
 * The handler receives only the typed `message.data` payload for the selected topic.
 * It is intentionally payload-first so your application code can focus on the
 * business value being emitted instead of unpacking the full SSE envelope.
 *
 * Handlers may be synchronous or asynchronous. Async work is fire-and-forget:
 * the realtime connection will continue delivering future messages without waiting
 * for the returned promise to settle.
 *
 * @example
 * ```ts
 * const handleMessage: RealtimeTopicHandler<typeof demoChannel, "message"> = async (
 *   payload
 * ) => {
 *   console.log(payload.message);
 * };
 * ```
 *
 * @param payload Typed payload for the selected topic.
 */
export type RealtimeTopicHandler<
  TChannel extends ChannelInput,
  TTopic extends TopicKey<TChannel>,
> = (payload: TopicData<TChannel, TTopic>) => void | Promise<void>;

/**
 * Function used by `RealtimeBusState.onMessage` to listen for future topic messages.
 *
 * This is the preferred way to react to realtime events in application code.
 * It is designed for side effects and orchestration:
 * - show toasts
 * - update local `$state`
 * - trigger remote functions
 * - fan out into other app workflows
 *
 * Important behavior:
 * - The callback only receives future messages after registration.
 * - The callback receives `payload` only, not the full envelope.
 * - Cleanup is automatic when registered during component setup.
 * - You can also manually stop the listener using the returned function.
 * - Thrown or rejected handler errors are logged locally and do not degrade the stream.
 *
 * @example
 * Basic usage inside component setup:
 * ```ts
 * const { onMessage } = getRealtimeBusState(demoChannel);
 *
 * onMessage("message", (payload) => {
 *   console.log(payload.message);
 * });
 * ```
 *
 * @example
 * Update local Svelte state from incoming messages:
 * ```ts
 * const { onMessage } = getRealtimeBusState(demoChannel);
 * let activity = $state<string[]>([]);
 *
 * onMessage("message", (payload) => {
 *   activity = [payload.message, ...activity].slice(0, 5);
 * });
 * ```
 *
 * @example
 * Keep a manual unsubscribe when you need to stop listening early:
 * ```ts
 * const { onMessage } = getRealtimeBusState(demoChannel);
 *
 * const stop = onMessage("admin-message", async (payload) => {
 *   await auditAdminMessage(payload.message);
 * });
 *
 * stop();
 * ```
 *
 * @example
 * Listen on a parameterized channel:
 * ```ts
 * const { onMessage } = getRealtimeBusState(userChannel, "alice");
 *
 * onMessage("message", (payload) => {
 *   console.log("user channel", payload.message);
 * });
 * ```
 */
export type RealtimeOnMessage<TChannel extends ChannelInput> = <
  TTopic extends TopicKey<TChannel>,
>(
  topic: TTopic,
  handler: RealtimeTopicHandler<TChannel, TTopic>,
) => RealtimeUnsubscribe;

/**
 * Primitive request params forwarded from the client subscription to the
 * realtime endpoint.
 */
export type RealtimeRequestParams = Record<
  string,
  string | number | boolean | null
>;

/**
 * Subscription configuration passed into `<RealtimeManager />`.
 *
 * @example
 * ```ts
 * const subscriptions: RealtimeSubscription[] = [
 *   { channel: demoChannel, topics: ["message"] },
 *   { channel: userChannel, channelParams: "alice" },
 * ];
 * ```
 */
export type RealtimeSubscription<TChannel extends ChannelInput = ChannelInput> =
  {
    /** Channel instance or channel builder to subscribe to. */
    channel: TChannel;
    /** Parameter used when `channel` is a channel definition function. */
    channelParams?: string;
    /** Optional topic subset. Defaults to all topics on the resolved channel. */
    topics?: TopicKey<TChannel>[];
    /** Optional primitive params forwarded to the realtime endpoint. */
    params?: RealtimeRequestParams;
  };

/**
 * Internal normalized subscription shape used after channel resolution.
 */
export type RealtimeResolvedSubscription = {
  channelId: string;
  topics: string[];
  params?: RealtimeRequestParams;
};

/**
 * Props accepted by `<RealtimeManager />`.
 *
 * @example
 * ```svelte
 * <RealtimeManager
 *   endpoint="/api/events"
 *   subscriptions={[{ channel: demoChannel }]}
 * >
 *   <RealtimePanel />
 * </RealtimeManager>
 * ```
 */
export type RealtimeManagerProps = {
  /** Realtime endpoint URL. Defaults to `"/api/events"`. */
  endpoint?: string;
  /** Channels that should be active for this manager subtree. */
  subscriptions: RealtimeSubscription[];
  /** Optional client-side failure hook for stream or health errors. */
  onFailure?: (failure: RealtimeClientFailureContext) => void | Promise<void>;
  /** Child snippet rendered within the manager scope. */
  children?: Snippet;
};

/**
 * Channel-scoped realtime API returned by `getRealtimeBusState(...)`.
 *
 * This is the preferred client entrypoint for consuming realtime messages.
 * It bundles:
 * - `health` for connection status
 * - `onMessage` for live event handling
 * - low-level `select(...)` access for advanced SSE usage
 *
 * In most app code, the typical flow is:
 * 1. call `getRealtimeBusState(channel)`
 * 2. register `onMessage(...)` listeners during component setup
 * 3. read `health.current` for connection status UI
 *
 * @example
 * ```ts
 * const realtime = getRealtimeBusState(demoChannel);
 *
 * realtime.onMessage("message", (payload) => {
 *   console.log(payload.message);
 * });
 *
 * console.log(realtime.health.current?.status);
 * ```
 */
export type RealtimeBusState<TChannel extends ChannelInput> = {
  /** Resolved channel id for the active subscription. */
  channelId: string;
  /** Topics currently active for this channel connection. */
  topics: TopicKey<TChannel>[];
  /** Low-level raw event selector from `sveltekit-sse`. */
  select: SourceSelect;
  /** Current connection health as a Svelte 5 state wrapper. */
  health: RealtimeHealthState;
  /**
   * Listen for future messages on a specific topic for this channel.
   * @example
   * ```ts
   * const realtime = getRealtimeBusState(demoChannel);
   *
   * realtime.onMessage("message", (payload) => {
   *   console.log(payload.message);
   * });
   * ```
   *
   * @example
   * ```ts
   * const { onMessage } = getRealtimeBusState(demoChannel);
   * let activity = $state<string[]>([]);
   *
   * onMessage("message", (payload) => {
   *   activity = [payload.message, ...activity].slice(0, 5);
   * });
   * ```
   *
   * @example
   * ```ts
   * const { onMessage } = getRealtimeBusState(userChannel, "alice");
   *
   * const stop = onMessage("message", async (payload) => {
   *   await auditMessage(payload.message);
   * });
   *
   * stop();
   * ```
   */
  onMessage: RealtimeOnMessage<TChannel>;
};

/**
 * JSON request body sent by the client to the realtime endpoint.
 */
export type RealtimeRequestPayload = {
  channel: string;
  topics?: string[];
  params?: RealtimeRequestParams;
};

/**
 * Full realtime message envelope emitted by the server for a topic.
 *
 * @example
 * ```ts
 * const message = getRealtimeBusTopicState(demoChannel, "message");
 * console.log(message.current?.data.message);
 * console.log(message.current?.runId);
 * ```
 */
export type RealtimeTopicEnvelope<
  TChannel extends ChannelInput,
  TTopic extends TopicKey<TChannel>,
> = {
  /** Channel id that emitted the message. */
  channel?: string;
  /** Topic name for this message. */
  topic: TTopic;
  /** Typed payload for the selected topic. */
  data: TopicData<TChannel, TTopic>;
  /** Inngest run id, when available. */
  runId?: string;
  /** ISO timestamp for when the message was created, when available. */
  createdAt?: string;
  /** Inngest environment id, when available. */
  envId?: string;
  /** Inngest message kind, when available. */
  kind?: string;
  /** Inngest function id, when available. */
  fnId?: string;
} & Record<string, unknown>;

/**
 * Alias for the parsed realtime message envelope.
 */
export type RealtimeTopicMessage<
  TChannel extends ChannelInput,
  TTopic extends TopicKey<TChannel>,
> = RealtimeTopicEnvelope<TChannel, TTopic>;
