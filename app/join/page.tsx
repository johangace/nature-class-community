import type { Metadata } from "next";
import { readInviteCohort, readSchoolName } from "@/lib/join";
import { JoinLanding } from "./JoinLanding";

/**
 * /join — the door an invited teacher comes through (#529).
 *
 * Public and unauthenticated, like /welcome, and read-only: it holds no
 * invitation token, creates nothing, and knows nothing about the person
 * arriving beyond one query parameter the school lead typed into an email
 * template. The name it reads is free text, sanitised in lib/join.ts before it
 * reaches the page, and dropped entirely when it is not usable.
 *
 * The query parameter makes this dynamic. There is no cached variant per
 * school, which is the point: the surface is a template, not a school record.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "You have been invited to Nature Class",
  // A join link is a private invitation between a school lead and a teacher,
  // and every one of them carries a real school's name in the URL. None of
  // them belongs in a search index.
  robots: { index: false, follow: false },
};

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return (
    <JoinLanding
      school={readSchoolName(params.school)}
      cohort={readInviteCohort(params.cohort)}
    />
  );
}
