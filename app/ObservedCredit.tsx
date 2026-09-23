/**
 * The data credit that travels with an observed line (#959).
 *
 * An observed line ("In flower, seen 2 days ago near Richmond Park") is an
 * iNaturalist volunteer's dated record, read through Pointmoon. iNaturalist's
 * terms require attribution wherever its data appears, and `PhotoCredit` does
 * not cover it: a member may have no photograph, and when it has one the
 * photographed record and the phenology record are usually different records
 * by different people. So the credit names the source, not a person, and it
 * renders wherever the observed line does.
 *
 * Text, never a link. The phenophase token carries no observation id, so
 * there is no specific record page to cite, and a link to the platform's
 * front door is an invitation to join, which class surfaces refuse by rule
 * (#758, `lib/observation-tools.ts`). Attribution is satisfied by naming the
 * source; the exact record stays with Pointmoon.
 */
export function ObservedCredit() {
  // The leading space is text, not margin, so screen readers and copied text
  // do not run "Richmond Parkvia iNaturalist" together.
  return (
    <>
      {" "}
      <span className="observed-credit">via iNaturalist</span>
    </>
  );
}
