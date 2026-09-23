import { notFound } from "next/navigation";
import { findSession, leadPack } from "@/lib/pack";
import { StartChoices } from "./StartChoices";

export default async function SessionStartPage({ searchParams }: {
  searchParams: Promise<{ session?: string; locale?: string }>;
}) {
  const { session: wanted, locale } = await searchParams;
  const session = wanted ? findSession(wanted)?.session : leadPack().sessions[0];
  if (!session) notFound();
  return <StartChoices sessionId={session.id} title={session.title} locale={locale} />;
}
