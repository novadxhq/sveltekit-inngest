import type { Realtime } from "@inngest/realtime";
import type { GetStepTools } from "inngest";
import { demoChannel } from "../channels.js";
import { inngest } from "./inngest.js";


export type DemoEvent = {
  message: string;
};


export const realtimeDemo = inngest.createFunction(
  { id: "demo-stream", name: "Realtime pubsub" },
  { event: "demo/realtime" },
  async ({ event, step, publish }) => {
    await step.run('publish message', async () => {
      await publish(demoChannel().message({ message: event.data.message }))
    })
  }
);
