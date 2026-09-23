/** One narration segment: what is said, and the silence spliced after it. */
export type NarrationSegment = { gapAfterMs: number; text: string };

/** The tier and voice a corpus was recorded at. Salts the address. */
export type RecordedAt = { model: string; voice: string };

/** The content address of a recording: sixteen hex characters. */
export function clipKeyOf(narration: NarrationSegment[], at: RecordedAt): string;
