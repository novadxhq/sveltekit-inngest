import { demoChannel, secondDemoChannel } from "$demo/channels.js";
import { inngest } from "$demo/server/inngest.js";
import { isReauthDenyActive } from "$demo/server/reauth-gate.js";
import { createRealtimeEndpoint } from "$lib/server/index.js";

export const POST = createRealtimeEndpoint({
  // One global endpoint that routes subscriptions by `payload.channel`.
  inngest: inngest,
  // Demo: re-check auth for each emitted message before sending to the client.
  reauthorizeOnEachMessage: true,
  channels: {
    demo: {
      channel: demoChannel,
      authorize: ({ locals, topics }) => {
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
      authorize: () => {
        if (isReauthDenyActive()) {
          return false;
        }

        // Demo policy: allow all topics on this channel when reauth gate is off.
        return true;
      },
    },
  },
  // Emit health events every 15s to match the production-friendly default.
  healthCheck: {
    intervalMs: 15_000,
    enabled: true,
  },
});
