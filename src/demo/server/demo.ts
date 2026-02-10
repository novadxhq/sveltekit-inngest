import { demoChannel, secondDemoChannel } from "../channels.js";
import { inngest } from "./inngest.js";

export type DemoEvent = {
  message: string;
};

export const realtimeDemo = inngest.createFunction(
  { id: "demo-stream", name: "Realtime pubsub" },
  { event: "demo/realtime" },
  async ({ event, step, publish }) => {
    await step.run("publish message", async () => {
      await publish(demoChannel().message({ message: event.data.message }));
    });
  }
);

export const adminOnlyRealtimeDemo = inngest.createFunction(
  { id: "demo-admin-stream", name: "Realtime admin-only pubsub" },
  { event: "demo/realtime-admin" },
  async ({ event, step, publish }) => {
    await step.run("publish admin message", async () => {
      await publish(
        demoChannel()["admin-message"]({
          message: `[admin-only] ${event.data.message}`,
        })
      );
    });
  }
);

export const nestedRealtimeDemo = inngest.createFunction(
  { id: "demo-nested-stream", name: "Realtime nested pubsub" },
  { event: "demo/nested-realtime" },
  async ({ event, step, publish }) => {
    await step.run("publish message", async () => {
      await publish(secondDemoChannel().message({ message: event.data.message }));
    });
  }
);
