import { ISSUE_THRESHOLDS, NON_DESCRIPTIVE_LINK_TEXTS } from './config';
import type { PageContent } from './fetchPage';

// On-page SEO issue detection. Thresholds align to Lighthouse / Yoast and live
// in config (see docs/heuristics.md). Pure: PageContent in → issues out.

export type Severity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface SeoIssue {
  code: string;
  severity: Severity;
  message: string;
}

export type IssueThresholds = typeof ISSUE_THRESHOLDS;

export function detectIssues(
  content: PageContent,
  thresholds: IssueThresholds = ISSUE_THRESHOLDS,
): SeoIssue[] {
  const issues: SeoIssue[] = [];
  const add = (code: string, severity: Severity, message: string) =>
    issues.push({ code, severity, message });

  // Title
  if (!content.hasTitle) {
    add('TITLE_MISSING', 'HIGH', 'Page has no <title>.');
  } else {
    if (content.title.length < thresholds.titleMin) {
      add('TITLE_TOO_SHORT', 'MEDIUM', `Title is short (${content.title.length} chars; aim ~50–60).`);
    }
    if (content.title.length > thresholds.titleMax) {
      add('TITLE_TOO_LONG', 'MEDIUM', `Title is long (${content.title.length} chars; aim ~50–60).`);
    }
  }

  // Headings
  if (content.h1.length === 0) {
    add('H1_MISSING', 'HIGH', 'Page has no <h1>.');
  } else if (content.h1.length > 1) {
    add('H1_MULTIPLE', 'LOW', `Page has ${content.h1.length} <h1> tags; use one.`);
  }

  // Meta description
  if (!content.metaDescription) {
    add('META_DESC_MISSING', 'MEDIUM', 'Page has no meta description.');
  } else {
    const len = content.metaDescription.length;
    if (len < thresholds.metaDescriptionMin) {
      add('META_DESC_TOO_SHORT', 'LOW', `Meta description is short (${len} chars; aim ~120–160).`);
    }
    if (len > thresholds.metaDescriptionMax) {
      add('META_DESC_TOO_LONG', 'LOW', `Meta description is long (${len} chars; aim ~120–160).`);
    }
  }

  // Images
  if (content.images.missingAlt > 0) {
    add(
      'IMG_MISSING_ALT',
      'MEDIUM',
      `${content.images.missingAlt} image(s) missing alt text.`,
    );
  }

  // Content depth
  if (content.wordCount < thresholds.thinContentWords) {
    add('THIN_CONTENT', 'MEDIUM', `Thin content (${content.wordCount} words; aim ≥ ${thresholds.thinContentWords}).`);
  }

  // Technical
  if (!content.canonical) {
    add('CANONICAL_MISSING', 'LOW', 'Page has no rel="canonical" link.');
  }
  if (!content.viewport) {
    add('VIEWPORT_MISSING', 'LOW', 'Page has no mobile viewport meta tag.');
  }
  if (content.robots && content.robots.includes('noindex')) {
    add('NOINDEX', 'HIGH', 'Page is marked noindex and will not be indexed.');
  }

  // Link text
  const blocklist = new Set<string>(NON_DESCRIPTIVE_LINK_TEXTS);
  const nonDescriptive = content.links.filter((l) => blocklist.has(l.text.toLowerCase())).length;
  if (nonDescriptive > 0) {
    add(
      'NON_DESCRIPTIVE_LINKS',
      'LOW',
      `${nonDescriptive} link(s) use non-descriptive text (e.g. "click here").`,
    );
  }

  return issues;
}
