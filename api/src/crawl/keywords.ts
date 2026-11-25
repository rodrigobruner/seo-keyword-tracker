import { ZONE_WEIGHTS, KEYWORD_OPTIONS, STOPWORDS } from './config';
import type { PageContent } from './fetchPage';

// Keyword extraction = RAKE candidate phrases + SEO zone-weighting.
// RAKE builds candidate keyphrases by splitting on stopwords/punctuation and
// scores words by degree/frequency; we layer the zone weight on top (a term in
// the <title> counts more than one in the body). See docs/heuristics.md.

export interface KeywordScore {
  text: string;
  relevance: number; // 0..1, normalized to the top candidate
}

export interface KeywordOptions {
  minTokenLength?: number;
  maxPhraseLength?: number;
  minScore?: number;
  topN?: number;
}

/** Split text into RAKE candidate phrases (arrays of content words). */
export function candidatePhrases(text: string, minTokenLength: number): string[][] {
  const phrases: string[][] = [];
  // Break on punctuation first (keep letters, numbers, spaces, apostrophes, hyphens).
  const chunks = text.toLowerCase().split(/[^\p{L}\p{N}\s'’-]+/u);
  for (const chunk of chunks) {
    let current: string[] = [];
    const flush = () => {
      if (current.length) phrases.push(current);
      current = [];
    };
    for (const raw of chunk.split(/\s+/)) {
      const w = raw.replace(/^['’-]+|['’-]+$/g, '');
      if (!w) continue;
      // Stopwords, too-short tokens and pure numbers are phrase breakers.
      if (STOPWORDS.has(w) || w.length < minTokenLength || /^\d+$/.test(w)) {
        flush();
        continue;
      }
      current.push(w);
    }
    flush();
  }
  return phrases;
}

/** Classic RAKE word scores: degree / frequency over all candidate phrases. */
function rakeWordScores(phrases: string[][]): Map<string, number> {
  const freq = new Map<string, number>();
  const degree = new Map<string, number>();
  for (const words of phrases) {
    for (const w of words) {
      freq.set(w, (freq.get(w) ?? 0) + 1);
      degree.set(w, (degree.get(w) ?? 0) + words.length); // RAKE degree incl. the word itself
    }
  }
  const score = new Map<string, number>();
  for (const [w, f] of freq) score.set(w, (degree.get(w) ?? 0) / f);
  return score;
}

export function extractKeywords(content: PageContent, opts: KeywordOptions = {}): KeywordScore[] {
  const minTokenLength = opts.minTokenLength ?? KEYWORD_OPTIONS.minTokenLength;
  const maxPhraseLength = opts.maxPhraseLength ?? KEYWORD_OPTIONS.maxPhraseLength;
  const minScore = opts.minScore ?? KEYWORD_OPTIONS.minScore;
  const topN = opts.topN ?? KEYWORD_OPTIONS.topN;

  const zones: Array<{ text: string; weight: number }> = [
    { text: content.title, weight: ZONE_WEIGHTS.title },
    { text: content.h1.join(' '), weight: ZONE_WEIGHTS.h1 },
    { text: content.metaDescription ?? '', weight: ZONE_WEIGHTS.metaDescription },
    { text: content.headings.join(' '), weight: ZONE_WEIGHTS.headings },
    { text: content.slug, weight: ZONE_WEIGHTS.slug },
    { text: content.bodyText, weight: ZONE_WEIGHTS.body },
  ];

  const allPhrases: string[][] = [];
  const phraseWords = new Map<string, string[]>();
  const phraseZoneWeight = new Map<string, number>(); // Σ of distinct zone weights

  for (const zone of zones) {
    if (!zone.text) continue;
    const seenInZone = new Set<string>();
    for (const words of candidatePhrases(zone.text, minTokenLength)) {
      if (words.length === 0 || words.length > maxPhraseLength) continue;
      const key = words.join(' ');
      allPhrases.push(words);
      phraseWords.set(key, words);
      if (!seenInZone.has(key)) {
        seenInZone.add(key);
        phraseZoneWeight.set(key, (phraseZoneWeight.get(key) ?? 0) + zone.weight);
      }
    }
  }

  const wordScore = rakeWordScores(allPhrases);

  const scored: Array<{ text: string; score: number }> = [];
  for (const [key, zoneWeight] of phraseZoneWeight) {
    const words = phraseWords.get(key) ?? [];
    const rake = words.reduce((sum, w) => sum + (wordScore.get(w) ?? 0), 0);
    const score = rake * zoneWeight;
    if (score >= minScore) scored.push({ text: key, score });
  }

  scored.sort((a, b) => b.score - a.score || a.text.localeCompare(b.text));
  const top = scored.slice(0, topN);
  const topScore = top[0]?.score ?? 1;

  return top.map((r) => ({ text: r.text, relevance: Math.round((r.score / topScore) * 100) / 100 }));
}
