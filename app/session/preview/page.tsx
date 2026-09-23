import { notFound } from "next/navigation";
import { previewForSession } from "@/lib/lesson/preview-audio";
import { loadLessonPreparation, type LessonSearchParams } from "../lesson-data";
import { PreviewDeck } from "./PreviewDeck";

/**
 * THE LESSON PREVIEW, AS ITS OWN PAGE (nc#515).
 *
 * Johan: *"make it full screen instead of overlay"*. So it is a route beside
 * the rest of the preparation journey — `/session/primer`, `/session/safety`,
 * `/session/place` — reached from the doorway's Preview row and left by one ✕
 * back to the same lesson.
 *
 * WHY IT LOADS THROUGH `loadLessonPreparation` AND NOT ITS OWN RESOLVER.
 *
 * The deck's recordings are content-addressed on the words themselves, so the
 * session this page resolves has to be byte-for-byte the session `/run`
 * resolves or the lookup misses and the deck falls silent. That loader is the
 * one that already guarantees it: the same `sessionForPlace` for the
 * school's pack key, then the same `localizeDeep` into the reader's English, in
 * that order, for the reason its own comment gives — the pre-read and the lead
 * must resolve identically or the pre-read is not a pre-read.
 *
 * The one thing `/run` does that this does not is ground the conditions line,
 * and it cannot matter here: `conditions-line` is the one block type the
 * narration never reads, because a recording made in August cannot honestly
 * speak today's sky.
 *
 * NO RECORDINGS, NO PAGE. `previewForSession` returns null when nothing in this
 * session has been voiced, and this 404s rather than opening onto silence. The
 * doorway shows no Preview row in the same case, so the 404 is the belt to that
 * braces: a hand-typed URL for an unvoiced lesson gets an honest not-found
 * rather than a deck that plays nothing.
 */
export default async function Preview({
  searchParams,
}: {
  searchParams: LessonSearchParams;
}) {
  const { locale, session } = await loadLessonPreparation(searchParams);
  const preview = previewForSession(session);
  if (!preview) notFound();

  return <PreviewDeck preview={preview} sessionId={session.id} locale={locale} />;
}
