import { command } from "$app/server";
import { inngest } from "$demo/server/inngest.js";
import z from 'zod';

export const triggerInngestDemo = command(z.string(), async (data) => {
  await inngest.send({
    name: 'demo/realtime',
    data: {
      message: data
    }
  })
})

export const triggerNestedInngestDemo = command(z.string(), async (data) => {
  await inngest.send({
    name: 'demo/nested-realtime',
    data: {
      message: data
    }
  })
})
