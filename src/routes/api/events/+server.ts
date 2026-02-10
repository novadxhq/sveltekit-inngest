import { createRealtimeEndpoint } from "$lib/server/index.js";
import { demoChannel } from "$demo/channels.js";
import { inngest } from "$demo/server/inngest.js";

export const POST = createRealtimeEndpoint({
  inngest,
  channel: demoChannel,
  healthCheck: {
    intervalMs: 1_000,
    enabled: true,
  },
  authorize: ({ locals, channelId, request, topics, params, event }) => {
    // You can add custom authorization logic here.
    return true;
  },
});
