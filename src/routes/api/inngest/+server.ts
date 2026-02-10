import { serve } from "inngest/sveltekit";
import {
  adminOnlyRealtimeDemo,
  nestedRealtimeDemo,
  realtimeDemo,
} from "$demo/server/demo.js";
import { inngest } from "$demo/server/inngest.js";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [realtimeDemo, adminOnlyRealtimeDemo, nestedRealtimeDemo],
});
