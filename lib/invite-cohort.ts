import { isInviteCohort } from "@/lib/analytics/events";
import { prisma } from "@/lib/db";

/**
 * The invited cohort on the teacher's record (#821).
 *
 * A school invite link can carry a neutral cohort code. The code is carried
 * through sign-in the way the school's name is (lib/join-prefill.ts) and lands
 * here at onboarding, on the User, so it survives a change of device and
 * every later surface can read it without the browser that followed the link.
 *
 * SET ONCE. The write only fills an empty field. A teacher who first arrived
 * through an invite and later follows a different link, or signs in from an
 * organic visit, keeps the cohort she arrived with: the question this answers
 * is how she first came in, and a later click must not rewrite it.
 *
 * Neither function throws. Counting where teachers came from is never allowed
 * to stop one finishing setup or seeing Today, so a failed read or write
 * answers null and the teacher carries on.
 */

/**
 * Record the cohort she arrived with, if she has none yet, and return what her
 * record holds afterwards (which may be an earlier cohort, or null).
 */
export async function recordInviteCohort(
  teacherId: string,
  candidate: string | null | undefined
): Promise<string | null> {
  try {
    if (isInviteCohort(candidate)) {
      await prisma.user.updateMany({
        where: { id: teacherId, inviteCohort: null },
        data: { inviteCohort: candidate },
      });
    }
    return await teacherInviteCohort(teacherId);
  } catch {
    return null;
  }
}

/** The cohort on her record, or null. Only a well-shaped code is returned. */
export async function teacherInviteCohort(teacherId: string): Promise<string | null> {
  try {
    const row = await prisma.user.findUnique({
      where: { id: teacherId },
      select: { inviteCohort: true },
    });
    return isInviteCohort(row?.inviteCohort) ? row.inviteCohort : null;
  } catch {
    return null;
  }
}
