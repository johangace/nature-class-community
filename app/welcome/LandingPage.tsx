import { SITE_GRAPH, jsonLd } from "@/lib/seo";
import { IdentifyTeacher } from "../Analytics";
import { isInternalTeacher } from "@/lib/analytics/events";
import { teacherInviteCohort } from "@/lib/invite-cohort";
import { getTeacher } from "@/lib/teacher";
import { Landing } from "./Landing";
import type { Locale } from "@/lib/localization";

export async function LandingPage({ locale, automatic = false }: { locale: Locale; automatic?: boolean }) {
  const teacher = await getTeacher();
  const inviteCohort = teacher ? await teacherInviteCohort(teacher.id) : null;
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(SITE_GRAPH) }} />
      {teacher && (
        <IdentifyTeacher
          teacherId={teacher.id}
          internal={isInternalTeacher(teacher.email)}
          inviteCohort={inviteCohort}
        />
      )}
      <Landing teacher={teacher} locale={locale} automatic={automatic} />
    </>
  );
}

