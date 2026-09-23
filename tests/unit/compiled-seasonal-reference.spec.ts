import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import raw from '../fixtures/bsbi-reference.json'
import {lessonReferences, validPlaceEvidence, lessonPlaceSources} from '../../lib/outside/place-evidence'
const query={lat:51.5,lng:-.1,sources:['bsbi'] as const}
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-08'));vi.stubEnv('POINTMOON_PLACE_EVIDENCE_ENABLED','1')})
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs()})
describe('selected taxon historical reference',()=>{
 it('validates a reference independently then renders only the chosen lesson taxon',()=>{
  const q={...query,sources:[...query.sources]}
  expect(lessonPlaceSources(['trees'])).toContain('bsbi')
  expect(validPlaceEvidence({compiledSeasonalReference:raw},q)).toHaveProperty('compiledSeasonalReference')
  expect(lessonReferences({compiledSeasonalReference:raw},q,[])).toEqual([])
  expect(lessonReferences({compiledSeasonalReference:raw},q,['Hedera helix','oak'])).toEqual([])
  const cards=lessonReferences({compiledSeasonalReference:raw},q,['Quercus robur'])
  expect(cards).toHaveLength(1);expect(cards[0]!.scope).toContain('Britain and Ireland')
  expect(cards[0]!.scope).toContain('does not confirm presence')
  expect(cards[0]!.attribution).toContain('Stroh')
 })
 it('never calls fern spore phases flowers and preserves raw-end interpretation',()=>{
  const [card]=lessonReferences({compiledSeasonalReference:raw},{...query,sources:[...query.sources]},['Equisetum arvense'])
  expect(card!.detail).toContain('Spore-bearing structures: April')
  expect(card!.detail).toContain('source end month missing');expect(card!.detail).not.toContain('Flowers')
 })
 it('rejects bad scope, rights, dates, presence claims and ranges independently',()=>{
  const q={...query,sources:[...query.sources]}
  for(const patch of [{license:'unknown'},{geographicScope:'World'},{localPresenceConfirmed:true},{validUntil:'2026-09-01'}]) expect(lessonReferences({compiledSeasonalReference:{...raw,...patch}},q,['Quercus robur'])).toEqual([])
  const bad=structuredClone(raw);bad.entries[0]!.phases[0]!.endMonth=14
  expect(lessonReferences({compiledSeasonalReference:bad},q,['Quercus robur'])).toEqual([])
 })
})
