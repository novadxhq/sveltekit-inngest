import type { Handle } from "@sveltejs/kit";

const ROLE_COOKIE = "demo-role";

export const handle: Handle = async ({ event, resolve }) => {
  const roleCookie = event.cookies.get(ROLE_COOKIE);

  event.locals.user = {
    role: roleCookie === "admin" ? "admin" : "member",
  };

  return resolve(event);
};
