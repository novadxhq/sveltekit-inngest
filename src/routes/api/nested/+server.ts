import { secondDemoChannel } from "$demo/channels.js";
import { inngest } from "$demo/server/inngest.js";
import { createRealtimeEndpoint } from '$lib/server/index.js'

export const POST = createRealtimeEndpoint({
  inngest,
  channel: secondDemoChannel,
  healthCheck: {
    intervalMs: 2_000,
    enabled: true
  },
  authorize: ({ locals, channelId, request, topics }) => {
    return true;
  },
})