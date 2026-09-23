/** Public, child-facing content only. Teacher prose is never a fallback. */
export interface SpeciesLearning {
  introduction: string;
  lookFor: string;
  question: string;
}

export interface SourcedSpeciesLearning {
  learning: SpeciesLearning;
  source: { title: string; url: string };
}
