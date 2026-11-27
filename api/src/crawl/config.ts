// Tunable knobs for the SEO heuristics. Everything the keyword/issue logic
// depends on lives here (no magic numbers in the logic). See docs/heuristics.md.

/** SEO zone weights for keyword scoring — where a term appears matters. */
export const ZONE_WEIGHTS = {
  title: 5,
  h1: 4,
  metaDescription: 3,
  headings: 2, // h2/h3
  slug: 2,
  body: 1,
} as const;

export const KEYWORD_OPTIONS = {
  /** Minimum token length to be part of a candidate keyphrase. */
  minTokenLength: 3,
  /** Max words in a keyphrase (drops long run-on boilerplate phrases). */
  maxPhraseLength: 4,
  /** Drop candidates scoring below this (filters lone-mention noise). */
  minScore: 2,
  /** How many keywords to keep (the detail view shows all of them). */
  topN: 15,
} as const;

/** Issue thresholds, aligned to Lighthouse / Yoast (see docs/heuristics.md). */
export const ISSUE_THRESHOLDS = {
  titleMin: 30,
  titleMax: 60,
  metaDescriptionMin: 120,
  metaDescriptionMax: 160,
  thinContentWords: 300,
} as const;

/** Anchor texts that are non-descriptive (Lighthouse). */
export const NON_DESCRIPTIVE_LINK_TEXTS = [
  'click here',
  'read more',
  'learn more',
  'here',
  'link',
  'this',
  'more',
] as const;

/** Compact English stopword list for RAKE candidate splitting. */
export const STOPWORDS = new Set<string>([
  'a','about','above','after','again','against','all','am','an','and','any','are','as','at',
  'be','because','been','before','being','below','between','both','but','by',
  'can','cannot','could',
  'did','do','does','doing','down','during',
  'each','few','for','from','further',
  'had','has','have','having','he','her','here','hers','herself','him','himself','his','how',
  'i','if','in','into','is','it','its','itself',
  'just',
  'me','more','most','my','myself',
  'no','nor','not','now',
  'of','off','on','once','only','or','other','our','ours','ourselves','out','over','own',
  'same','she','should','so','some','such',
  'than','that','the','their','theirs','them','themselves','then','there','these','they',
  'this','those','through','to','too',
  'under','until','up',
  'very',
  'was','we','were','what','when','where','which','while','who','whom','why','will','with','would',
  'you','your','yours','yourself','yourselves',
]);
