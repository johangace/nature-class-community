import { createAuthClient } from "better-auth/react";
import { emailOTPClient, magicLinkClient } from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";

/**
 * The browser-side auth client. Mirrors the server's plugins so the client
 * knows how to start a magic-link sign-in and a passkey ceremony. baseURL is
 * left to default to the current origin, which is correct for local dev and
 * the deployed domain alike.
 */
export const authClient = createAuthClient({
  plugins: [emailOTPClient(), magicLinkClient(), passkeyClient()],
});

export const { signIn, signOut, useSession } = authClient;
