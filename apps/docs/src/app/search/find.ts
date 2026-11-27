import type { FlatDocPage } from '../docs/nav';

/** One section of one page, from the index, with the page it belongs to. */
export interface SearchSection {
  page: FlatDocPage;
  /** The section's heading id, or `''` for the page's opening. */
  id: string;
  heading: string;
  text: string;
  /** `text` and the two titles in lower case, computed once. */
  lower: { title: string; heading: string; text: string };
}

export interface SearchResult {
  section: SearchSection;
  /** The text around the first match, cut into the parts that matched and the rest. */
  snippet: { text: string; hit: boolean }[];
}

/** Shorter than this, a query matches nearly everything. */
export const SHORTEST_QUERY = 2;

const MOST_RESULTS = 20;

/** Characters of context on each side of the match a snippet shows. */
const SNIPPET_BEFORE = 40;
const SNIPPET_AFTER = 110;

/**
 * The sections that contain every word of the query, best first: a word in the
 * page's title counts most, then one in the section's heading, then how often
 * it is in the text. Sections of the same score keep the order of the contents.
 */
export function find(sections: SearchSection[], query: string): SearchResult[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.join('').length < SHORTEST_QUERY) {
    return [];
  }
  const scored: { section: SearchSection; score: number }[] = [];
  for (const section of sections) {
    let score = 0;
    for (const term of terms) {
      const inTitle = section.lower.title.includes(term);
      const inHeading = section.lower.heading.includes(term);
      const inText = count(section.lower.text, term);
      if (!inTitle && !inHeading && inText === 0) {
        score = 0;
        break;
      }
      // The page's opening stands for the whole page: a title match belongs to it.
      score +=
        (inTitle ? (section.id === '' ? 12 : 3) : 0) + (inHeading ? 8 : 0) + Math.min(inText, 5);
    }
    if (score > 0) {
      scored.push({ section, score });
    }
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, MOST_RESULTS)
    .map(({ section }) => ({ section, snippet: snippetOf(section, terms) }));
}

function count(text: string, term: string): number {
  let found = 0;
  for (let at = text.indexOf(term); at !== -1; at = text.indexOf(term, at + term.length)) {
    found++;
  }
  return found;
}

/** The text around the first word that matches, or the section's first words. */
function snippetOf(section: SearchSection, terms: string[]): SearchResult['snippet'] {
  const first = Math.min(
    ...terms.map((term) => section.lower.text.indexOf(term)).filter((at) => at !== -1),
  );
  const from = Number.isFinite(first) ? Math.max(0, first - SNIPPET_BEFORE) : 0;
  const to = Math.min(section.text.length, from + SNIPPET_BEFORE + SNIPPET_AFTER);
  const text =
    (from > 0 ? '…' : '') + section.text.slice(from, to) + (to < section.text.length ? '…' : '');

  const matcher = new RegExp(`(${terms.map(escape).join('|')})`, 'gi');
  return text
    .split(matcher)
    .filter((part) => part !== '')
    .map((part) => ({ text: part, hit: terms.includes(part.toLowerCase()) }));
}

function escape(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
