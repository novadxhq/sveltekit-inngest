import { demoChannel, demoUserId, secondDemoChannel, userChannel } from "$demo/channels.js";
import { inngest } from "$demo/server/inngest.js";
import { isReauthDenyActive } from "$demo/server/reauth-gate.js";
import { createRealtimeEndpoint } from "$lib/server/index.js";

const extractUserIdFromChannelId = (requestedChannelId: string): string | null => {
  if (!requestedChannelId.startsWith("user:")) return null;
  const userId = requestedChannelId.slice("user:".length).trim();
  return userId.length > 0 ? userId : null;
};

export const POST = createRealtimeEndpoint({
  // One global endpoint that routes subscriptions by `payload.channel`.
  inngest: inngest,
  // Demo hook for observing and optionally overriding failure messages.
  onFailure: ({ message }) => ({ message }),
  // Demo: re-check auth for each emitted message before sending to the client.
  reauthorizeOnEachMessage: true,
  channels: {
    demo: {
      channel: demoChannel,
      authorize: ({ locals, topics }) => {
        if (!locals?.user) {
          throw new Error("unable to connect wtih no locals");
        }

        // Demo-only reauth gate: when active, fail authorization to force
        // a fail-closed stream and verify per-message reauthorization behavior.
        if (isReauthDenyActive()) {
          return false;
        }

        // Admin can subscribe to all requested topics on `demo`.
        if (locals.user.role === "admin") {
          return true;
        }

        // Member can only subscribe to the public `message` topic.
        return {
          allowedTopics: topics.filter((topic) => topic === "message"),
        };
      },
    },
    "second-demo": {
      channel: secondDemoChannel,
      reauthorizeOnEachMessage: true,
      reauthorize(context) {
        return true;
      },
      // Reuse the demo reauth gate so nested stream demos can also verify
      // per-message authorization failures and reconnect behavior.
      authorize: ({ locals }) => {
        if (!locals?.user) {
          throw new Error("unable to connect wtih no locals");
        }

        if (isReauthDenyActive()) {
          return false;
        }

        // Demo policy: allow all topics on this channel when reauth gate is off.
        return true;
      },
    },
    user: {
      channel: userChannel,
      channelParams: (_event, requestedChannelId) => {
        const userId = extractUserIdFromChannelId(requestedChannelId);
        return userId ?? "";
      },
      authorize: ({ locals, channelId }) => {
        if (!locals?.user) {
          throw new Error("unable to connect wtih no locals");
        }

        if (isReauthDenyActive()) {
          return false;
        }

        if (locals.user.role === "admin") {
          return true;
        }

        return channelId === `user:${demoUserId}`;
      },
    },
  },
  // Emit health events every 15s to match the production-friendly default.
  healthCheck: {
    intervalMs: 15_000,
    enabled: true,
  },
});
