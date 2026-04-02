import { demoChannel, secondDemoChannel, userChannel } from "../channels.js";
import {
  demoNestedRealtimeEvent,
  demoRealtimeAdminEvent,
  demoRealtimeEvent,
  demoRealtimeUserEvent,
  inngest,
} from "./inngest.js";

export type DemoEvent = {
  message: string;
};

export type UserDemoEvent = {
  userId: string;
  message: string;
};

export const realtimeDemo = inngest.createFunction(
  { id: "demo-stream", name: "Realtime pubsub", triggers: [demoRealtimeEvent] },
  async ({ event, step }) => {
    await step.realtime.publish(
      "publish message",
      demoChannel.message,
      { message: event.data.message }
    );
  }
);

export const adminOnlyRealtimeDemo = inngest.createFunction(
  {
    id: "demo-admin-stream",
    name: "Realtime admin-only pubsub",
    triggers: [demoRealtimeAdminEvent],
  },
  async ({ event, step }) => {
    await step.realtime.publish(
      "publish admin message",
      demoChannel["admin-message"],
      {
        message: `[admin-only] ${event.data.message}`,
      }
    );
  }
);

export const nestedRealtimeDemo = inngest.createFunction(
  {
    id: "demo-nested-stream",
    name: "Realtime nested pubsub",
    triggers: [demoNestedRealtimeEvent],
  },
  async ({ event, step }) => {
    await step.realtime.publish(
      "publish message",
      secondDemoChannel.message,
      { message: event.data.message }
    );
  }
);

export const userRealtimeDemo = inngest.createFunction(
  {
    id: "demo-user-stream",
    name: "Realtime user-scoped pubsub",
    triggers: [demoRealtimeUserEvent],
  },
  async ({ event, step }) => {
    await step.realtime.publish(
      "publish user message",
      userChannel(event.data.userId).message,
      {
        message: event.data.message,
      }
    );
  }
);
