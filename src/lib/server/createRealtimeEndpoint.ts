import { json, type RequestEvent, type RequestHandler } from "@sveltejs/kit";
import { getSubscriptionToken, subscribe } from "@inngest/realtime";
import type { Inngest } from "inngest";
import { produce, type Connection } from "sveltekit-sse";
import type {
  ChannelInput,
  HealthPayload,
  RealtimeRequestParams,
  RealtimeRequestPayload,
  ResolvedChannel,
  TopicKey,
} from "../client/types.js";

/**
 * Result of authorization:
 * - `true`: allow all requested topics
 * - `false`: deny request (403)
 * - `{ allowedTopics }`: allow only a subset of requested topics
 */
type AuthorizationResult<TTopic extends string> =
  | boolean
  | {
    allowedTopics?: TTopic[];
  };

/**
 * Optional resolver for channel builder params.
 * This receives the full SvelteKit RequestEvent plus requested channel details
 * so callers can derive params from route params, cookies, headers, etc.
 */
type ChannelParamsResolver = (
  event: RequestEvent,
  requestedChannelId: string,
  requestParams?: RealtimeRequestParams,
) => string | Promise<string>;

/**
 * Context passed to `authorize` so userland code can make auth decisions with
 * full request visibility and typed topic names.
 */
export type RealtimeAuthorizeContext<
  TLocals,
  TTopic extends string,
> = {
  event: RequestEvent;
  locals: TLocals;
  request: Request;
  channelId: string;
  topics: TTopic[];
  params?: RealtimeRequestParams;
};

/**
 * Context passed to optional `reauthorize` for per-message stream checks.
 * Returning `true` continues streaming, anything else fails closed.
 */
export type RealtimeReauthorizeContext<
  TLocals,
  TTopic extends string,
> = RealtimeAuthorizeContext<TLocals, TTopic> & {
  messageTopic: TTopic;
  message: unknown;
};

export type RealtimeChannelConfig<
  TChannelInput extends ChannelInput = ChannelInput,
  TLocals = App.Locals,
> = {
  /** Channel definition/object to subscribe to. */
  channel: TChannelInput;
  /** Static params or event-driven params for channel builders. */
  channelParams?: string | ChannelParamsResolver;
  /** Optional per-channel override for per-message reauthorization. */
  reauthorizeOnEachMessage?: boolean;
  /**
   * Optional per-message stream guard.
   * Return `true` to continue streaming or fail closed otherwise.
   */
  reauthorize?: (
    context: RealtimeReauthorizeContext<TLocals, TopicKey<TChannelInput>>
  ) => boolean | Promise<boolean>;
  /** Required permission hook to enforce deny-by-default behavior. */
  authorize: (
    context: RealtimeAuthorizeContext<TLocals, TopicKey<TChannelInput>>
  ) =>
    | AuthorizationResult<TopicKey<TChannelInput>>
    | Promise<AuthorizationResult<TopicKey<TChannelInput>>>;
};

export type RealtimeServerFailureStage =
  | "request-validation"
  | "channel-resolution"
  | "topic-validation"
  | "authorization"
  | "reauthorization"
  | "stream";

export type RealtimeServerFailureContext<TLocals = App.Locals> = {
  event: RequestEvent;
  locals: TLocals;
  request: Request;
  stage: RealtimeServerFailureStage;
  message: string;
  status?: number;
  error?: unknown;
  requestedChannelId?: string;
  channelId?: string;
  topics?: string[];
  params?: RealtimeRequestParams;
};

type RealtimeChannelRegistry<TLocals> = Record<
  string,
  RealtimeChannelConfig<ChannelInput, TLocals>
>;

/**
 * Configuration for creating a SvelteKit `POST` handler that proxies Inngest
 * realtime data over SSE.
 */
export type RealtimeEndpointOptions<
  TLocals = App.Locals,
  TChannels extends RealtimeChannelRegistry<TLocals> = RealtimeChannelRegistry<TLocals>,
> = {
  /** Inngest client used for token generation + realtime subscription. */
  inngest: Inngest.Like;
  /** Static channel registry for global bus routing. */
  channels: TChannels;
  /** Global default for per-message reauthorization (can be overridden per channel). */
  reauthorizeOnEachMessage?: boolean;
  /** Health tick behavior for `health` SSE events. */
  healthCheck?: RealtimeHealthCheckOptions;
  /** Optional endpoint-level failure callback for request + stream failures. */
  onFailure?: (
    failure: RealtimeServerFailureContext<TLocals>
  ) => void | { message?: string } | Promise<void | { message?: string }>;
};

export type RealtimeHealthCheckOptions = {
  /**
   * Emit periodic health updates at this interval (in milliseconds).
   * Set to 0 or a negative number to disable interval-based health ticks.
   *
   * @default 15000
   */
  intervalMs?: number;
  /**
   * Enable or disable interval-based health ticks.
   *
   * @default true
   */
  enabled?: boolean;
};

const jsonError = (
  status: number,
  error: string,
  extra?: Record<string, unknown>
) => json({ error, ...(extra ?? {}) }, { status });

/**
 * Normalize unknown error values into a human-readable message.
 */
const formatError = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return "Unknown realtime error";
};

/**
 * Keep only primitives/null from `params` so we never pass arbitrary objects
 * into authorization logic.
 */
const normalizeParams = (input: unknown): RealtimeRequestParams | undefined => {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;

  const entries = Object.entries(input).filter(
    ([, value]) =>
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
  );

  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries) as RealtimeRequestParams;
};

/**
 * Parse and lightly validate the expected POST payload shape.
 */
const parseRequestPayload = async (
  request: Request
): Promise<RealtimeRequestPayload | null> => {
  try {
    const body = (await request.json()) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;

    const record = body as Record<string, unknown>;
    return {
      channel: typeof record.channel === "string" ? record.channel : "",
      topics: Array.isArray(record.topics)
        ? record.topics.filter((topic): topic is string => typeof topic === "string")
        : undefined,
      params: normalizeParams(record.params),
    };
  } catch {
    return null;
  }
};

const getMessageTopic = (value: unknown): string | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const topic = (value as Record<string, unknown>).topic;
  return typeof topic === "string" ? topic : null;
};

/**
 * Resolve a channel input into a concrete channel object.
 * Supports both channel objects and channel builder functions.
 */
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

/**
 * Resolve channel params from either static config or a RequestEvent callback.
 */
const resolveChannelParams = async (
  channelParams: string | ChannelParamsResolver | undefined,
  event: RequestEvent,
  requestedChannelId: string,
  requestParams?: RealtimeRequestParams,
): Promise<string | undefined> => {
  if (typeof channelParams === "string") return channelParams;
  if (typeof channelParams === "function") {
    return await channelParams(event, requestedChannelId, requestParams);
  }

  return undefined;
};

/**
 * Intersect requested topics with an optional `allowedTopics` list.
 */
const filterAllowedTopics = <TTopic extends string>(
  requested: TTopic[],
  allowed?: TTopic[]
) => {
  if (!allowed) return requested;
  const allowedSet = new Set<string>(allowed);
  return requested.filter((topic) => allowedSet.has(topic));
};

/**
 * Creates a SvelteKit `POST` RequestHandler that:
 * 1) validates subscription input,
 * 2) routes by requested channel through a static registry,
 * 3) authorizes/filter topics per channel,
 * 4) opens an Inngest realtime subscription,
 * 5) forwards data as SSE `message` events,
 * 6) emits lifecycle `health` SSE events.
 */
export function createRealtimeEndpoint<
  TLocals = App.Locals,
  TChannels extends RealtimeChannelRegistry<TLocals> = RealtimeChannelRegistry<TLocals>,
>({
  inngest,
  channels,
  reauthorizeOnEachMessage,
  healthCheck,
  onFailure,
}: RealtimeEndpointOptions<TLocals, TChannels>): RequestHandler {
  const healthCheckEnabled = healthCheck?.enabled ?? true;
  const healthCheckIntervalMs = healthCheck?.intervalMs ?? 15_000;
  const resolveFailureMessage = async (
    failure: RealtimeServerFailureContext<TLocals>
  ): Promise<string> => {
    if (!onFailure) return failure.message;

    try {
      const result = await onFailure(failure);
      if (
        result &&
        typeof result === "object" &&
        !Array.isArray(result) &&
        typeof result.message === "string"
      ) {
        return result.message;
      }
    } catch {
      // Never fail request/stream because `onFailure` itself throws.
    }

    return failure.message;
  };

  return async (event) => {
    const { request, locals } = event;
    const typedLocals = locals as TLocals;

    const failRequest = async ({
      status,
      stage,
      message,
      error,
      requestedChannelId,
      channelId,
      topics,
      params,
      extra,
    }: {
      status: number;
      stage: RealtimeServerFailureStage;
      message: string;
      error?: unknown;
      requestedChannelId?: string;
      channelId?: string;
      topics?: string[];
      params?: RealtimeRequestParams;
      extra?: Record<string, unknown>;
    }) => {
      const resolvedMessage = await resolveFailureMessage({
        event,
        locals: typedLocals,
        request,
        stage,
        message,
        status,
        error,
        requestedChannelId,
        channelId,
        topics,
        params,
      });

      return jsonError(status, resolvedMessage, extra);
    };

    // Parse body and route to a configured channel registry entry.
    const payload = await parseRequestPayload(request);
    if (!payload) {
      return failRequest({
        status: 400,
        stage: "request-validation",
        message: "Invalid request body",
      });
    }

    if (!payload.channel) {
      return failRequest({
        status: 400,
        stage: "request-validation",
        message: "Missing channel",
        params: payload.params,
      });
    }
    const requestedChannelKey = payload.channel;

    const channelMatches: {
      registryKey: string;
      channelConfig: RealtimeChannelConfig<ChannelInput, TLocals>;
      resolvedChannel: ResolvedChannel<ChannelInput>;
    }[] = [];

    for (const [registryKey, configuredChannel] of Object.entries(channels)) {
      const channelConfig =
        configuredChannel as RealtimeChannelConfig<ChannelInput, TLocals>;
      let resolvedChannel: ResolvedChannel<ChannelInput>;
      try {
        resolvedChannel = resolveChannel(
          channelConfig.channel,
          await resolveChannelParams(
            channelConfig.channelParams,
            event,
            requestedChannelKey,
            payload.params,
          )
        );
      } catch (error) {
        return failRequest({
          status: 500,
          stage: "channel-resolution",
          message: formatError(error),
          error,
          requestedChannelId: requestedChannelKey,
          params: payload.params,
        });
      }

      if (resolvedChannel.name === requestedChannelKey) {
        channelMatches.push({
          registryKey,
          channelConfig,
          resolvedChannel,
        });
      }
    }

    if (channelMatches.length === 0) {
      return failRequest({
        status: 400,
        stage: "channel-resolution",
        message: "Requested channel is not available",
        requestedChannelId: requestedChannelKey,
        params: payload.params,
      });
    }

    if (channelMatches.length > 1) {
      return failRequest({
        status: 500,
        stage: "channel-resolution",
        message: "Realtime channel registry is ambiguous",
        requestedChannelId: requestedChannelKey,
        params: payload.params,
        extra: {
          requestedChannel: requestedChannelKey,
          matchingRegistryKeys: channelMatches.map((entry) => entry.registryKey),
        },
      });
    }

    const [{ channelConfig, resolvedChannel }] = channelMatches;
    const configuredChannelId = resolvedChannel.name;

    const availableTopics = Object.keys(
      resolvedChannel.topics
    ) as TopicKey<typeof channelConfig.channel>[];
    const availableTopicSet = new Set<string>(availableTopics);

    // Default to all channel topics when none are explicitly requested.
    const requestedTopics = (
      payload.topics && payload.topics.length > 0
        ? payload.topics
        : availableTopics
    ) as TopicKey<typeof channelConfig.channel>[];

    // Reject unknown topics early.
    const invalidTopics = requestedTopics.filter(
      (topic) => !availableTopicSet.has(topic)
    );
    if (invalidTopics.length > 0) {
      return failRequest({
        status: 400,
        stage: "topic-validation",
        message: "Requested topics are not available",
        requestedChannelId: requestedChannelKey,
        channelId: configuredChannelId,
        topics: requestedTopics as string[],
        params: payload.params,
        extra: {
          invalidTopics,
        },
      });
    }

    let authorizationResult: AuthorizationResult<
      TopicKey<typeof channelConfig.channel>
    >;
    try {
      authorizationResult = await channelConfig.authorize({
        event,
        locals: typedLocals,
        request,
        channelId: configuredChannelId,
        topics: requestedTopics,
        params: payload.params,
      });
    } catch (error) {
      return failRequest({
        status: 403,
        stage: "authorization",
        message: formatError(error),
        error,
        requestedChannelId: requestedChannelKey,
        channelId: configuredChannelId,
        topics: requestedTopics as string[],
        params: payload.params,
      });
    }

    if (authorizationResult === false) {
      return failRequest({
        status: 403,
        stage: "authorization",
        message: "Forbidden",
        requestedChannelId: requestedChannelKey,
        channelId: configuredChannelId,
        topics: requestedTopics as string[],
        params: payload.params,
      });
    }

    const authorizedTopics =
      typeof authorizationResult === "object"
        ? (filterAllowedTopics(
          requestedTopics,
          authorizationResult.allowedTopics
        ) as TopicKey<typeof channelConfig.channel>[])
        : requestedTopics;

    if (authorizedTopics.length === 0) {
      return failRequest({
        status: 403,
        stage: "authorization",
        message: "Forbidden",
        requestedChannelId: requestedChannelKey,
        channelId: configuredChannelId,
        topics: requestedTopics as string[],
        params: payload.params,
      });
    }
    const authorizedTopicSet = new Set<string>(authorizedTopics);
    const authorizedTopicsList = authorizedTopics as string[];

    const shouldReauthorizeOnEachMessage =
      channelConfig.reauthorizeOnEachMessage ??
      reauthorizeOnEachMessage ??
      false;

    // Start SSE stream and bridge Inngest realtime messages to the client.
    return produce(({ emit, lock }: Connection) => {
      let closed = false;
      let heartbeat: ReturnType<typeof setInterval> | null = null;
      let reader: ReadableStreamDefaultReader<unknown> | null = null;

      // Shared shutdown path for client disconnects / errors / completion.
      const stop = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        reader?.cancel().catch(() => { });
        lock.set(false);
      };

      // Emit structured health status as JSON under SSE event name `health`.
      const emitHealth = (healthPayload: HealthPayload): boolean => {
        const { error } = emit("health", JSON.stringify(healthPayload));
        if (error) {
          stop();
          return false;
        }
        return true;
      };

      // Convenience helper for degraded health transitions.
      const emitDegraded = (detail: string) => {
        emitHealth({
          ok: false,
          status: "degraded",
          ts: Date.now(),
          detail,
        });
      };
      const emitDegradedFailure = async ({
        stage,
        message,
        error,
        topics,
      }: {
        stage: RealtimeServerFailureStage;
        message: string;
        error?: unknown;
        topics?: string[];
      }) => {
        const resolvedMessage = await resolveFailureMessage({
          event,
          locals: typedLocals,
          request,
          stage,
          message,
          error,
          requestedChannelId: requestedChannelKey,
          channelId: configuredChannelId,
          topics,
          params: payload.params,
        });
        emitDegraded(resolvedMessage);
      };

      void (async () => {
        // Tell client the stream lifecycle has started.
        if (!emitHealth({ ok: true, status: "connecting", ts: Date.now() })) return;

        try {
          // Create token and open a realtime stream for authorized topics.
          const token = await getSubscriptionToken(inngest, {
            channel: configuredChannelId,
            topics: authorizedTopics,
          });
          const stream = await subscribe({ ...token, app: inngest });
          reader = stream.getReader();

          // Signal healthy active connection.
          if (!emitHealth({ ok: true, status: "connected", ts: Date.now() })) return;

          // Optional periodic health ticks while stream is active.
          if (healthCheckEnabled && healthCheckIntervalMs > 0) {
            heartbeat = setInterval(() => {
              emitHealth({ ok: true, status: "connected", ts: Date.now() });
            }, healthCheckIntervalMs);
          }

          // Forward each realtime chunk as SSE `message` without reshaping.
          // Only JSON serialization is applied so clients receive full
          // Inngest envelope fields (for example: runId, createdAt, kind, envId).
          while (!closed) {
            const { value, done } = await reader.read();
            if (done || closed) break;
            if (value == null) continue;

            if (shouldReauthorizeOnEachMessage) {
              const messageTopic = getMessageTopic(value);
              if (!messageTopic) {
                await emitDegradedFailure({
                  stage: "reauthorization",
                  message: "Realtime message is missing a valid topic",
                  topics: authorizedTopicsList,
                });
                break;
              }

              if (!availableTopicSet.has(messageTopic)) {
                await emitDegradedFailure({
                  stage: "reauthorization",
                  message:
                    `Realtime message topic is not configured for channel: ${messageTopic}`,
                  topics: [messageTopic],
                });
                break;
              }

              if (!authorizedTopicSet.has(messageTopic)) {
                await emitDegradedFailure({
                  stage: "reauthorization",
                  message:
                    `Realtime message topic is not authorized for this connection: ${messageTopic}`,
                  topics: [messageTopic],
                });
                break;
              }

              const messageTopics = [
                messageTopic as TopicKey<typeof channelConfig.channel>,
              ];

              const [typedMessageTopic] = messageTopics;

              if (channelConfig.reauthorize) {
                let shouldContinueStream: boolean;
                try {
                  shouldContinueStream = await channelConfig.reauthorize({
                    event,
                    locals: typedLocals,
                    request,
                    channelId: configuredChannelId,
                    topics: messageTopics,
                    params: payload.params,
                    messageTopic: typedMessageTopic,
                    message: value,
                  });
                } catch (error) {
                  await emitDegradedFailure({
                    stage: "reauthorization",
                    message: formatError(error),
                    error,
                    topics: messageTopics as string[],
                  });
                  break;
                }

                if (shouldContinueStream !== true) {
                  await emitDegradedFailure({
                    stage: "reauthorization",
                    message: "Forbidden",
                    topics: messageTopics as string[],
                  });
                  break;
                }
              } else {
                let messageAuthorizationResult: AuthorizationResult<
                  TopicKey<typeof channelConfig.channel>
                >;
                try {
                  messageAuthorizationResult = await channelConfig.authorize({
                    event,
                    locals: typedLocals,
                    request,
                    channelId: configuredChannelId,
                    topics: messageTopics,
                    params: payload.params,
                  });
                } catch (error) {
                  await emitDegradedFailure({
                    stage: "reauthorization",
                    message: formatError(error),
                    error,
                    topics: messageTopics as string[],
                  });
                  break;
                }

                if (messageAuthorizationResult === false) {
                  await emitDegradedFailure({
                    stage: "reauthorization",
                    message: "Forbidden",
                    topics: messageTopics as string[],
                  });
                  break;
                }

                if (typeof messageAuthorizationResult === "object") {
                  const allowedMessageTopics = filterAllowedTopics(
                    messageTopics,
                    messageAuthorizationResult.allowedTopics
                  );
                  if (allowedMessageTopics.length === 0) {
                    await emitDegradedFailure({
                      stage: "reauthorization",
                      message: "Forbidden",
                      topics: messageTopics as string[],
                    });
                    break;
                  }
                }
              }
            }

            const { error } = emit("message", JSON.stringify(value));
            if (error) break;
          }
        } catch (error) {
          // Surface failures to the client before closing.
          await emitDegradedFailure({
            stage: "stream",
            message: formatError(error),
            error,
            topics: authorizedTopicsList,
          });
        } finally {
          stop();
        }
      })();

      return () => stop();
    });
  };
}
