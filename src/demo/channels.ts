import { channel, topic } from "@inngest/realtime";
import z from "zod";

/**
 * Topic for real-time messages. Re-usable.
 */
export const messageTopic = topic("message").schema(
  z.object({
    message: z.string(),
  })
);

/**
 * Demo channel for real-time messaging.
 */
export const demoChannel = channel("demo").addTopic(messageTopic);


/**
 * Second demo channel for real-time messaging.
 */
export const secondDemoChannel = channel("second-demo").addTopic(messageTopic);