import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

/**
 * Better Auth's endpoints, mounted under /api/auth. Sign-in, magic-link
 * callback, passkey ceremony, session — all Better Auth's, all here. This is
 * the only route auth adds under /api; the demo's /api/conditions is untouched
 * and public.
 */
export const { POST, GET } = toNextJsHandler(auth);
