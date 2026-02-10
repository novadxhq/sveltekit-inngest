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
 * Optional resolver for channel builder args.
 * This receives the full SvelteKit RequestEvent so callers can derive args from
 * route params, cookies, headers, etc.
 */
type ChannelArgsResolver = (event: RequestEvent) => unknown[] | Promise<unknown[]>;

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

export type RealtimeChannelConfig<
  TChannelInput extends ChannelInput = ChannelInput,
  TLocals = App.Locals,
> = {
  /** Channel definition/object to subscribe to. */
  channel: TChannelInput;
  /** Static args or event-driven args for channel builders. */
  channelArgs?: unknown[] | ChannelArgsResolver;
  /** Optional per-channel override for per-message reauthorization. */
  reauthorizeOnEachMessage?: boolean;
  /** Required permission hook to enforce deny-by-default behavior. */
  authorize: (
    context: RealtimeAuthorizeContext<TLocals, TopicKey<TChannelInput>>
  ) =>
    | AuthorizationResult<TopicKey<TChannelInput>>
    | Promise<AuthorizationResult<TopicKey<TChannelInput>>>;
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
  args: unknown[]
): ResolvedChannel<TInput> => {
  if (typeof input === "function") {
    const channelFactory = input as unknown as (
      ...callArgs: unknown[]
    ) => ResolvedChannel<TInput>;
    return channelFactory(...args);
  }

  return input as ResolvedChannel<TInput>;
};

/**
 * Resolve channel args from either static config or a RequestEvent callback.
 */
const resolveChannelArgs = async (
  channelArgs: unknown[] | ChannelArgsResolver | undefined,
  event: RequestEvent
): Promise<unknown[]> => {
  if (Array.isArray(channelArgs)) return channelArgs;
  if (typeof channelArgs === "function") {
    const args = await channelArgs(event);
    return Array.isArray(args) ? args : [];
  }

  return [];
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
}: RealtimeEndpointOptions<TLocals, TChannels>): RequestHandler {
  const healthCheckEnabled = healthCheck?.enabled ?? true;
  const healthCheckIntervalMs = healthCheck?.intervalMs ?? 15_000;

  return async (event) => {
    const { request, locals } = event;

    // Parse body and route to a configured channel registry entry.
    const payload = await parseRequestPayload(request);
    if (!payload) return jsonError(400, "Invalid request body");

    if (!payload.channel) return jsonError(400, "Missing channel");
    const requestedChannelKey = payload.channel;
    const channelConfig = channels[requestedChannelKey];
    if (!channelConfig) {
      return jsonError(400, "Requested channel is not available");
    }

    // Resolve the configured channel for this request.
    const resolvedChannel = resolveChannel(
      channelConfig.channel,
      await resolveChannelArgs(channelConfig.channelArgs, event)
    );
    const configuredChannelId = resolvedChannel.name;

    // Guard against registry misconfiguration to avoid subscribing wrong channels.
    if (configuredChannelId !== requestedChannelKey) {
      return jsonError(500, "Realtime channel registry mismatch", {
        requestedChannel: requestedChannelKey,
        configuredChannel: configuredChannelId,
      });
    }

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
      return jsonError(400, "Requested topics are not available", {
        invalidTopics,
      });
    }

    let authorizationResult: AuthorizationResult<
      TopicKey<typeof channelConfig.channel>
    >;
    try {
      authorizationResult = await channelConfig.authorize({
        event,
        locals: locals as TLocals,
        request,
        channelId: configuredChannelId,
        topics: requestedTopics,
        params: payload.params,
      });
    } catch (error) {
      return jsonError(403, formatError(error));
    }

    if (authorizationResult === false) {
      return jsonError(403, "Forbidden");
    }

    const authorizedTopics =
      typeof authorizationResult === "object"
        ? (filterAllowedTopics(
          requestedTopics,
          authorizationResult.allowedTopics
        ) as TopicKey<typeof channelConfig.channel>[])
        : requestedTopics;

    if (authorizedTopics.length === 0) {
      return jsonError(403, "Forbidden");
    }
    const authorizedTopicSet = new Set<string>(authorizedTopics);

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
                emitDegraded("Realtime message is missing a valid topic");
                break;
              }

              if (!availableTopicSet.has(messageTopic)) {
                emitDegraded(
                  `Realtime message topic is not configured for channel: ${messageTopic}`
                );
                break;
              }

              if (!authorizedTopicSet.has(messageTopic)) {
                emitDegraded(
                  `Realtime message topic is not authorized for this connection: ${messageTopic}`
                );
                break;
              }

              const messageTopics = [
                messageTopic as TopicKey<typeof channelConfig.channel>,
              ];

              let messageAuthorizationResult: AuthorizationResult<
                TopicKey<typeof channelConfig.channel>
              >;
              try {
                messageAuthorizationResult = await channelConfig.authorize({
                  event,
                  locals: locals as TLocals,
                  request,
                  channelId: configuredChannelId,
                  topics: messageTopics,
                  params: payload.params,
                });
              } catch (error) {
                emitDegraded(formatError(error));
                break;
              }

              if (messageAuthorizationResult === false) {
                emitDegraded("Forbidden");
                break;
              }

              if (typeof messageAuthorizationResult === "object") {
                const allowedMessageTopics = filterAllowedTopics(
                  messageTopics,
                  messageAuthorizationResult.allowedTopics
                );
                if (allowedMessageTopics.length === 0) {
                  emitDegraded("Forbidden");
                  break;
                }
              }
            }

            const { error } = emit("message", JSON.stringify(value));
            if (error) break;
          }
        } catch (error) {
          // Surface failures to the client before closing.
          emitDegraded(formatError(error));
        } finally {
          stop();
        }
      })();

      return () => stop();
    });
  };
}
