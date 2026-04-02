import { realtime } from "inngest/realtime";
import z from "zod";

const messageSchema = z.object({
  message: z.string(),
});

/**
 * Demo channel for real-time messaging.
 */
export const demoChannel = realtime.channel({
  name: "demo",
  topics: {
    message: {
      schema: messageSchema,
    },
    "admin-message": {
      schema: messageSchema,
    },
  },
});

/**
 * Second demo channel for real-time messaging.
 */
export const secondDemoChannel = realtime.channel({
  name: "second-demo",
  topics: {
    message: {
      schema: messageSchema,
    },
  },
});

/**
 * Demo user identifier for composite channel examples.
 */
export const demoUserId = "alice";

/**
 * Composite channel for user-scoped real-time messaging.
 */
export const userChannel = realtime.channel({
  name: (userId: string) => `user:${userId}`,
  topics: {
    message: {
      schema: messageSchema,
    },
  },
});
