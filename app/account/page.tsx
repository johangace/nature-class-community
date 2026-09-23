import Link from "next/link";
import { redirect } from "next/navigation";
import { getActiveClass, getTeacher } from "@/lib/teacher";
import { isNonSchoolGroup } from "@/lib/group-profile";
import { AppNav } from "../AppNav";
import { SignOutButton } from "../classes/SignOutButton";

/**
 * Account is deliberately small. Identity and leaving the shared device live
 * here; class, school and nearby-nature management stay on /classes (#578).
 */
export default async function AccountPage() {
  const teacher = await getTeacher();
  if (!teacher) redirect("/sign-in");
  const active = await getActiveClass(teacher.id);

  return (
    <main className="classes">
      <AppNav />
      <h1>Account</h1>
      <p className="classes-intro">
        The account open on this device, and the safe way to leave it.
      </p>

      <section className="account" aria-labelledby="account-heading">
        <h2 id="account-heading" className="sr-only">
          This account
        </h2>
        <p className="account-who">
          Signed in as <span className="account-email">{teacher.email}</span>
        </p>
        <SignOutButton />
        <p className="account-note">
          On a shared iPad, sign out before you hand it on. Getting back in
          takes one email link.
        </p>
      </section>

      <p className="classes-foot">
        <Link href="/classes">{isNonSchoolGroup(active?.groupType) ? "Manage my groups →" : "Manage my classes →"}</Link>
      </p>
      <p className="classes-foot">
        <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link> · To delete your account, write to{" "}
        <a href="mailto:hi@natureclass.education">hi@natureclass.education</a>
      </p>
    </main>
  );
}
