import { channel, topic } from "@inngest/realtime";
import z from "zod";

/**
 * Topic for standard real-time messages.
 */
export const messageTopic = topic("message").schema(
  z.object({
    message: z.string(),
  })
);

/**
 * Topic reserved for admin consumers.
 */
export const adminMessageTopic = topic("admin-message").schema(
  z.object({
    message: z.string(),
  })
);

/**
 * Demo channel for real-time messaging.
 */
export const demoChannel = channel("demo")
  .addTopic(messageTopic)
  .addTopic(adminMessageTopic);

/**
 * Second demo channel for real-time messaging.
 */
export const secondDemoChannel = channel("second-demo").addTopic(messageTopic);

/**
 * Demo user identifier for composite channel examples.
 */
export const demoUserId = "alice";

/**
 * Composite channel for user-scoped real-time messaging.
 */
export const userChannel = channel((userId: string) => `user:${userId}`).addTopic(
  messageTopic
);
