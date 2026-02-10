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
