import { localizeText } from "@/lib/localization";
import { validLocale } from "@/lib/locale-links";
import type { RememberedFact } from "@/lib/world-memory";
import styles from "./remembered.module.css";

/**
 * WHAT WE REMEMBER ABOUT YOUR GROUNDS — the primer's memory strip (#509).
 *
 * Johan cut "since last time" from the prototype, so what is left is one block
 * in the primer's own register, above the lesson's own sections. It is the
 * first thing she reads before she shapes anything, and it is short on purpose:
 * memory stays few, visible and correctable.
 *
 * NOTHING RENDERS WHEN THERE IS NOTHING TO SAY. A teacher who has never told
 * us anything sees no heading and no frame — an empty block is a product
 * saying "we remember: nothing", which is worse than silence and is the exact
 * shape of the declared-empty rule the rest of this app runs on.
 *
 * HER WORDS ARE QUOTED, NOT PARAPHRASED. When the ledger holds the sentence
 * she typed, that sentence is what the row shows, in the quoted register the
 * primer already uses for somebody else's words. A fact with no sentence
 * behind it — a feature she tapped in the grounds step — reads plainly, and is
 * still hers: it never wears the derived label.
 *
 * THE CONTROL IS A WORD, NOT A DANGER BUTTON. Retiring is ordinary and will
 * happen often; the gardener mows the wild corner. It says what it does
 * ("Not any more" for hers, "Not quite right" for one we worked out).
 *
 * IT IS IN HER OWN ENGLISH. Every word this surface writes goes through the
 * locale layer, because "grounds" is precisely the word #872 found a US
 * teacher reading as British, and a new surface that hard-codes it puts the
 * term back that every other grounds surface translates. Her own sentence is
 * the one thing that never goes through it: swapping a word inside a quotation
 * would be us editing what she said.
 *
 * THERE IS NO CLIENT COMPONENT HERE, AND THAT IS THE FIX RATHER THAN A SAVING.
 * Each row is a plain form posting to `/api/world-memory/retire`, which writes
 * and sends her back with a 303. Three server-action versions of this control
 * each left the retired fact on screen about half the time — see that route's
 * own comment for the measurements. A form post does not depend on hydration,
 * so it also works on the school iPad whose filter ate the JavaScript.
 */
export function RememberedGrounds(props: {
  classId: string;
  facts: RememberedFact[];
  /** The lesson she is on, so the redirect lands her back on the same page. */
  sessionId: string;
  locale?: string;
  /** True when the last retire did not write. Set from `?retire=failed`. */
  retireFailed?: boolean;
}) {
  if (props.facts.length === 0) return null;
  const locale = validLocale(props.locale) ?? "uk";
  const t = (text: string) => localizeText(text, locale);

  return (
    <section className="primer-section" aria-labelledby="remembered-grounds-title">
      <h2 id="remembered-grounds-title" className="primer-head">
        {t("What we remember about your grounds")}
      </h2>
      <div className={styles.list}>
        {props.facts.map((fact) => (
          <div key={`${fact.kind}:${fact.value}`} className={styles.row}>
            <div>
              <p className={styles.said}>
                {fact.quote ? (
                  <>
                    {t("You told us:")} <em>&ldquo;{fact.quote}&rdquo;</em>
                  </>
                ) : (
                  fact.line
                )}
              </p>
              <p
                className={
                  fact.provenance === "teacher-photographed"
                    ? `${styles.source} ${styles.photo}`
                    : styles.source
                }
              >
                {fact.source}
              </p>
            </div>
            <form
              method="post"
              action="/api/world-memory/retire"
              className={styles.retireForm}
            >
              <input type="hidden" name="classId" value={props.classId} />
              <input type="hidden" name="kind" value={fact.kind} />
              <input type="hidden" name="value" value={fact.value} />
              <input type="hidden" name="sessionId" value={props.sessionId} />
              <input type="hidden" name="locale" value={props.locale ?? ""} />
              <button
                type="submit"
                className={styles.retire}
                /* Three buttons all reading "Not any more" name nothing to a
                   screen reader; each says which fact it would retire. */
                aria-label={`${t(fact.retireLabel)}: ${fact.quote ?? fact.line}`}
              >
                {t(fact.retireLabel)}
              </button>
            </form>
          </div>
        ))}
      </div>
      {props.retireFailed && (
        <p className={styles.source} role="status">
          {t(
            "That did not save. It is still here, so nothing was lost — try again, or change it on your grounds page."
          )}
        </p>
      )}
    </section>
  );
}
