import { afterEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { projectDietRelationships } from '@/lib/outside/diet-relationships';
import { lessonPlaceSources, lessonReferences, validPlaceEvidence } from '@/lib/outside/place-evidence';
import { TeacherReferences } from '@/app/outside/TeacherReferences';
import fixture from '../support/globi-diet-references.json';
const now = new Date('2026-09-07T19:00:00Z');
const query = { lat: 42.3554, lng: -71.0655, sources: ['globi' as const] };
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
it('retains dataset references independently of legacy flower resolution', () => {
  expect(fixture.status).toBe('unresolved');
  expect(projectDietRelationships(fixture, now)).toHaveLength(12);
  expect(validPlaceEvidence({ relationships: fixture }, query, now)).toHaveProperty('relationships');
  vi.stubEnv('POINTMOON_PLACE_EVIDENCE_ENABLED', '1');
  expect(lessonPlaceSources(['birds'])).toContain('globi');
});
it('renders only lesson-matching diet questions with original archive, dates and no local feeding claim', () => {
  vi.setSystemTime(now);
  expect(lessonReferences({ relationships: fixture }, query, ['Erithacus rubecula'])).toEqual([]);
  const cards = lessonReferences({ relationships: fixture }, query, ['Poecile atricapillus']);
  expect(cards).toHaveLength(2);
  const html = renderToStaticMarkup(<TeacherReferences references={cards} />);
  expect(html).toContain('A published diet relationship');
  expect(html).toContain('Source event date 1949-01-01');
  expect(html).toContain('feeding interaction is confirmed');
  expect(html).toContain('no study URL supplied');
  expect(html).toContain('dietdatabase-v.1.0.8.zip');
  expect(html).not.toContain('Original study');
});
it('preserves inverse diet direction without turning it into a flower visit', () => {
  const value = structuredClone(fixture);
  const row = value.datasetReferences.entries[0]!;
  [row.sourceTaxon, row.targetTaxon] = [row.targetTaxon, row.sourceTaxon];
  row.interactionType = 'eatenBy';
  const parsed = projectDietRelationships(value, now)[0]!;
  expect(parsed.eater).toBe('Poecile atricapillus');
  expect(parsed.food).toBe('Archips fumiferana');
  expect(parsed.interactionType).toBe('eatenBy');
});
it('rejects stale, future, wrong archive, rights, refutations and invented study URL independently', () => {
  expect(projectDietRelationships(fixture, new Date(fixture.refreshAfter))).toEqual([]);
  expect(projectDietRelationships(fixture, new Date('2026-09-01'))).toEqual([]);
  for (const key of ['datasetArchiveUrl', 'licenseUrl', 'citationBasis', 'studyUrl']) {
    const value = structuredClone(fixture);
    for (const row of value.datasetReferences.entries) Object.assign(row, { [key]: 'https://example.com/' });
    expect(projectDietRelationships(value, now)).toEqual([]);
  }
  const value = structuredClone(fixture); value.quality.refutationSha256 = 'a'.repeat(64);
  expect(projectDietRelationships(value, now)).toEqual([]);
  const dates = structuredClone(fixture); dates.refreshAfter = '2027-01-01T00:00:00Z';
  expect(projectDietRelationships(dates, now)).toEqual([]);
});
