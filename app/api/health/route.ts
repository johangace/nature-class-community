import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * #658 · Which build is answering on this host?
 *
 * On 2026-08-28 the canonical domain served a PREVIEW deployment of a feature
 * branch for five hours. A preview gets no Production environment, so the app
 * came up with no auth secret and sign-in was dead for everyone — and that is
 * the only reason anyone noticed. A branch whose environment happened to line
 * up would have served the public silently for as long as it sat there.
 *
 * Nothing could see it, because "which deployment is this domain pointing at"
 * was a question only the Vercel dashboard could answer. Now it is one request,
 * answerable by a cron, a probe, a person with curl, or Johan on a phone.
 *
 * PUBLIC AND DELIBERATELY DULL. Everything here is already visible to anyone
 * reading the deployment: the environment tier, the commit, the branch. No
 * secrets, no counts, no data. `sha` and `branch` are what turn "this is not
 * production" into "this is <branch>, deployed by whom, at what commit" without
 * a second lookup.
 */
export async function GET(): Promise<Response> {
  return NextResponse.json(
    {
      // production | preview | development, straight from the platform.
      env: process.env.VERCEL_ENV ?? "local",
      sha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
      deployment: process.env.VERCEL_DEPLOYMENT_ID ?? null,
    },
    { headers: { "cache-control": "no-store" } }
  );
}
