import "server-only";

/**
 * The school doors: sign in with the account the teacher's school already
 * gave her.
 *
 * A magic link is a fine recovery path and a poor everyday one, especially
 * here. It costs an inbox round-trip on a device held in a field, and school
 * mail is the worst place to spend it: district security gateways fetch links
 * to scan them, and ours works once by design, so the scanner can spend the
 * token before the teacher taps it. She sees a dead link and reads it as
 * "this doesn't work" (#568 was a different cause with exactly that face).
 *
 * Google Workspace for Education and Microsoft 365 are what schools in both
 * our markets actually run, and the teacher is already signed into one of
 * them on the device in her hand. One tap, no inbox, nothing to intercept.
 *
 * Configured, not hardcoded: a provider appears only when both halves of its
 * credential are in the environment. So this ships dark and lights up the day
 * the OAuth client exists, without a second deploy, and a fork of this AGPL
 * tree gets a sign-in page that offers only what its own operator has set up.
 */

/** The providers this app knows how to offer. Order is the order shown. */
export const SOCIAL_PROVIDERS = ["google", "microsoft"] as const;

export type SocialProviderId = (typeof SOCIAL_PROVIDERS)[number];

/** Both halves of a provider's credential, or nothing. */
function credential(prefix: string) {
  const clientId = process.env[`${prefix}_CLIENT_ID`];
  const clientSecret = process.env[`${prefix}_CLIENT_SECRET`];
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/**
 * Which providers are actually offerable right now. The sign-in surface reads
 * this on the server so it never paints a button that cannot work — a door
 * that opens onto an error is worse than no door.
 */
export function configuredSocialProviders(): SocialProviderId[] {
  return SOCIAL_PROVIDERS.filter((id) => credential(id.toUpperCase()) !== null);
}

/**
 * The same reading, shaped for Better Auth. An empty object is the honest
 * default: no credential, no provider, no half-wired button.
 *
 * `tenantId` stays at Microsoft's "common" default deliberately. Pinning it to
 * one tenant is what a single district's own deployment would do; this app
 * serves teachers from many schools at once, so it must accept them all.
 */
export function socialProviderConfig() {
  const google = credential("GOOGLE");
  const microsoft = credential("MICROSOFT");
  return {
    ...(google ? { google } : {}),
    ...(microsoft ? { microsoft } : {}),
  };
}
