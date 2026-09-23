import Link from "next/link";
import { KindIcon } from "@/engine/icons";
import { CastFace } from "@/app/CastFace";
import { readSurfaceCast } from "@/lib/cast/surface";
import type { TopicTag } from "@/schema/pack";

/**
 * The lesson cast strip on /session and /read.
 *
 * #169 landed this as nearby sightings inside the lesson surfaces,
 * topic-ranked and photo-led. The current contract separates presence evidence
 * from image evidence: a photo renders only when its role, credit, open licence
 * and source URL travelled with it.
 *
 *   - it reads the class's cast (lib/cast/read) instead of composing its own
 *     view of the sightings, so this strip, the daily card, the speak-and-show
 *     and the printed cards are the same creatures in the same order;
 *   - a face is a tap target into the profile, as it is on the daily card;
 *   - a member with no photograph renders a drawn field-guide plate, so the
 *     strip is no longer photos-only. That was #169's honest limit at the
 *     time: a species without a photo had nothing to show, so it was dropped.
 *     The plate is the thing to show, and dropping the regional tier meant
 *     this strip was empty at exactly the schools with the least data;
 *   - it opens the speak-and-show, which keeps the lesson cast together as a
 *     labeled field-guide list with one line to say for each species.
 *
 * Still true from #169, and load-bearing: no cast means NO strip. Not a
 * heading over an empty row, not a placeholder. The caption never claims
 * "near your school" without coordinates.
 *
 * Legacy bare URLs are deliberately suppressed. Pointmoon must pass the image
 * role and rights fields before a remote image is releaseable here.
 */
export async function SeenNearby({
  topicTags,
  primaryTopic,
  /** The session this strip sits on, so the speak-and-show opens on its cast. */
  sessionId,
}: {
  topicTags?: readonly TopicTag[];
  primaryTopic?: TopicTag | null;
  sessionId?: string;
}) {
  const { cast } = await readSurfaceCast({ topicTags, primaryTopic, limit: 4 });
  const members = cast.members.slice(0, 4);
  if (members.length === 0) return null;

  return (
    <section className="seen-nearby">
      <p className="outside-caption">
        <KindIcon kind="conditions-line" size={16} />
        Who we might meet today
      </p>

      <ul className="cast-faces">
        {members.map((member) => (
          <li key={member.sortRank}>
            <CastFace member={member} profileTopic={primaryTopic} />
          </li>
        ))}
      </ul>

      <Link
        href={sessionId ? `/cast?session=${sessionId}` : "/cast"}
        className="seen-nearby-show"
      >
        Show these to the class <span aria-hidden="true">&rarr;</span>
      </Link>

    </section>
  );
}
