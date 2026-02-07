import { serve } from "inngest/sveltekit";
import { nestedRealtimeDemo, realtimeDemo } from "$demo/server/demo.js";
import { inngest } from "$demo/server/inngest.js";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [realtimeDemo, nestedRealtimeDemo],
});
