import { command } from "$app/server";
import {
  demoNestedRealtimeEvent,
  demoRealtimeAdminEvent,
  demoRealtimeEvent,
  demoRealtimeUserEvent,
  inngest,
} from "$demo/server/inngest.js";
import { enableReauthDenyForMs, resetReauthDeny } from "$demo/server/reauth-gate.js";
import z from "zod";

export const triggerInngestDemo = command(z.string(), async (data) => {
  await inngest.send(
    demoRealtimeEvent.create({
      message: data,
    })
  );
});

export const triggerInngestAdminDemo = command(z.string(), async (data) => {
  await inngest.send(
    demoRealtimeAdminEvent.create({
      message: data,
    })
  );
});

const userDemoEventSchema = z.object({
  userId: z.string().min(1),
  message: z.string(),
});

export const triggerUserInngestDemo = command(
  userDemoEventSchema,
  async ({ userId, message }) => {
    await inngest.send(
      demoRealtimeUserEvent.create({
        userId,
        message,
      })
    );
  }
);

export const triggerReauthorizationWorkflow = command(z.string(), async (data) => {
  // Keep denial active long enough for the next published event to be processed.
  enableReauthDenyForMs(30_000);

  await inngest.send(
    demoRealtimeEvent.create({
      message: data,
    })
  );
});

export const reauthAndConnect = command(z.void(), async () => {
  resetReauthDeny();
});

export const triggerNestedInngestDemo = command(z.string(), async (data) => {
  await inngest.send(
    demoNestedRealtimeEvent.create({
      message: data,
    })
  );
});

export const triggerNestedReauthorizationWorkflow = command(
  z.string(),
  async (data) => {
    // Keep denial active long enough for the next published event to be processed.
    enableReauthDenyForMs(30_000);

    await inngest.send(
      demoNestedRealtimeEvent.create({
        message: data,
      })
    );
  }
);
