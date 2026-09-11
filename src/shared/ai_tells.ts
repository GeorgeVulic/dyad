/**
 * Deterministic detection of AI writing tells in user-facing copy.
 *
 * These matchers carry no model call: they are word lists, shapes and counts.
 * That keeps the Humanize review cheap and its findings identical run to run,
 * and it lets the eval suite score mechanically without a Dyad Pro key.
 *
 * Several patterns and word lists are adapted from petergyang/no-ai-slop
 * (MIT, https://github.com/petergyang/no-ai-slop), whose taxonomy is tuned for
 * essay and newsletter prose. The landing-page tells — tricolon headlines,
 * category inflation, vague CTA labels, inflated social-proof numbers — are
 * additions, because marketing copy has habits long-form writing does not.
 *
 * A match is evidence that copy *looks* generated, never proof that AI wrote
 * it and never proof that it reads badly. That distinction is the point: AI
 * detectors guess, while a named pattern is something the author can check for
 * themselves and disagree with.
 */

export type TellId =
  | "tricolon"
  | "binary-contrast"
  | "inflated-verb"
  | "frictionless-adverb"
  | "category-inflation"
  | "vague-cta"
  | "unsourced-number"
  | "colon-reveal"
  | "question-into-answer"
  | "empty-phrase"
  | "superficial-analysis"
  | "em-dash-density";

/**
 * How strongly a match suggests generated copy. This is deliberately not a
 * severity scale: a colon reveal is not "critical", and forcing copy findings
 * onto a risk scale would train people to ignore the label.
 */
export type TellConfidence = "strong" | "likely" | "subtle";

export interface TellMatch {
  id: TellId;
  /** User-facing finding title. The same string the panel renders as a heading. */
  title: string;
  confidence: TellConfidence;
  /** The offending text, trimmed to something quotable. */
  excerpt: string;
  /** Character offset of `excerpt` within the scanned text. -1 for whole-text checks. */
  index: number;
}

interface TellSpec {
  id: TellId;
  title: string;
  confidence: TellConfidence;
  /** Plain-language reason, shown in the finding detail. */
  why: string;
}

/**
 * Titles double as finding headings, so they read as plain descriptions rather
 * than taxonomy labels — "weasel attribution" means nothing to someone who has
 * never used a terminal.
 */
const TELLS: Record<TellId, TellSpec> = {
  tricolon: {
    id: "tricolon",
    title: "Three adjectives, no substance",
    confidence: "strong",
    why: "Three short parallel fragments is a rhythm language models reach for constantly. It sounds confident while committing to nothing, and a visitor still cannot tell what the product does.",
  },
  "binary-contrast": {
    id: "binary-contrast",
    title: "A contrast that reveals nothing",
    confidence: "strong",
    why: "The “not X, it's Y” shape sounds like a claim but adds no information. It tells the reader what the product is not, and leaves what it is undefined.",
  },
  "inflated-verb": {
    id: "inflated-verb",
    title: "Verbs doing too much work",
    confidence: "likely",
    why: "Verbs like supercharge and unlock stand in for a concrete outcome. Naming what actually happens is shorter and more convincing.",
  },
  "frictionless-adverb": {
    id: "frictionless-adverb",
    title: "Everything is effortless",
    confidence: "likely",
    why: "Claiming something is seamless invites doubt. Showing the number of steps earns the same point without asking to be believed.",
  },
  "category-inflation": {
    id: "category-inflation",
    title: "Claims a category with nothing behind it",
    confidence: "likely",
    why: "Phrases like world-class and enterprise-grade assert standing without evidence. Readers discount them automatically.",
  },
  "vague-cta": {
    id: "vague-cta",
    title: "The button doesn't say what happens",
    confidence: "likely",
    why: "People hesitate when they cannot tell what a click costs them. Saying what happens next converts better than inviting them to begin.",
  },
  "unsourced-number": {
    id: "unsourced-number",
    title: "A number with no source",
    confidence: "strong",
    why: "A figure this specific reads as verified. If nothing in the project supports it, it needs a real source or it needs to go — a false claim on a live site is the author's risk to carry.",
  },
  "colon-reveal": {
    id: "colon-reveal",
    title: "A colon promising a payoff",
    confidence: "subtle",
    why: "The colon sets up a reveal that the clause after it rarely earns.",
  },
  "question-into-answer": {
    id: "question-into-answer",
    title: "Asks a question to answer it",
    confidence: "likely",
    why: "Rhetorical setups delay the point. Leading with the answer respects the reader's time.",
  },
  "empty-phrase": {
    id: "empty-phrase",
    title: "A phrase that delays the point",
    confidence: "likely",
    why: "Openers like “at the end of the day” and “when it comes to” take up room before the sentence starts. Deleting them costs nothing.",
  },
  "superficial-analysis": {
    id: "superficial-analysis",
    title: "A clause that explains nothing",
    confidence: "likely",
    why: "Trailing “highlighting” or “underscoring” clauses look like analysis but only restate the fact. Say what it lets the reader do instead.",
  },
  "em-dash-density": {
    id: "em-dash-density",
    title: "Dashes doing comma work",
    confidence: "subtle",
    why: "Em dashes used this often make every clause sound like an aside. It reads breathless.",
  },
};

export function getTellSpec(id: TellId): TellSpec {
  return TELLS[id];
}

export function listTells(): readonly TellSpec[] {
  return Object.values(TELLS);
}

// ── word lists ───────────────────────────────────────────────────────────────
// Kept narrow on purpose. A list that catches every possible offender also
// catches ordinary writing, and a scanner people learn to distrust is worse
// than no scanner.

// The overlap with no-ai-slop's banned list is deliberate: those words earned
// their place there. Left out are its formal-but-honest entries (utilize,
// facilitate, leverage) — wordiness is a different complaint from inflation,
// and "leverage" has a legitimate sense in business copy.
const INFLATED_VERBS = [
  "supercharge",
  "supercharges",
  "turbocharge",
  "unlock",
  "unlocks",
  "unleash",
  "unleashes",
  "elevate",
  "elevates",
  "revolutionize",
  "revolutionizes",
  "empower",
  "empowers",
  "harness",
  "harnesses",
  "streamline",
  "streamlines",
  "embark",
  "delve",
  "foster",
  "fosters",
];

const FRICTIONLESS_ADVERBS = [
  "seamlessly",
  "effortlessly",
  "painlessly",
  "frictionlessly",
  "magically",
];

const CATEGORY_INFLATION = [
  "world-class",
  "best-in-class",
  "enterprise-grade",
  "industry-leading",
  "cutting-edge",
  "state-of-the-art",
  "next-generation",
  "game-changing",
  "game changer",
  "paradigm shift",
  "best-of-breed",
  "transformative",
];

/** Phrases that occupy the front of a sentence without starting it. */
const EMPTY_PHRASES = [
  "it's worth noting",
  "it is worth noting",
  "it's important to note",
  "it is important to note",
  "at the end of the day",
  "when it comes to",
  "at its core",
  "in today's world",
  "in the age of",
  "in the world of",
  "the reality is",
  "the truth is",
  "going forward",
  "let's dive in",
  "needless to say",
];

/**
 * Trailing -ing clauses that restate rather than explain.
 *
 * Deliberately excludes `making`, `letting` and `giving`. They form the same
 * shape but are load-bearing far more often than not: "we rebuilt the
 * importer, making it four times faster" adds a fact, and a comma list
 * ("analyzing data, making observations, and reviewing literature") is not a
 * participle clause at all. Every occurrence of `making` across the 140-doc
 * review corpus was one of those two, and none was a tell.
 */
const SUPERFICIAL_ANALYSIS_VERBS = [
  "highlighting",
  "underscoring",
  "reflecting",
  "showcasing",
  "demonstrating",
  "emphasizing",
  "signaling",
  "solidifying",
  "helping",
  "allowing",
  "enabling",
  "ensuring",
];

/** Matched only as a whole string, so prose containing "learn more" is left alone. */
const VAGUE_CTA_LABELS = [
  "get started",
  "learn more",
  "unlock access",
  "discover more",
  "find out more",
  "get access",
  "see more",
  "explore now",
];

/** Nouns that turn a bare number into a social-proof claim. */
const PROOF_NOUNS =
  "teams|customers|users|companies|businesses|developers|brands|organizations|creators";

const EM_DASH = /[—–]/g;

/**
 * "400–700 nanometres", "8 November 1848 – 26 July 1925".
 *
 * A dash between two numbers is a range, not a prose aside, so it should not
 * count toward the density ratio. Spec pages and anything with dates or
 * measurements are full of them.
 */
const NUMERIC_RANGE_DASH = /(?<=\d\s?)[—–](?=\s?\d)/g;

// ── matchers ─────────────────────────────────────────────────────────────────

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
}

function matchWordList(
  text: string,
  words: readonly string[],
  id: TellId,
): TellMatch[] {
  const spec = TELLS[id];
  const pattern = new RegExp(
    `\\b(${words.map(escapeForRegex).join("|")})\\b`,
    "gi",
  );
  const out: TellMatch[] = [];
  for (const m of text.matchAll(pattern)) {
    out.push({
      id,
      title: spec.title,
      confidence: spec.confidence,
      excerpt: m[0],
      index: m.index,
    });
  }
  return out;
}

/**
 * Three consecutive single-word sentences: "Faster. Smarter. Simpler."
 *
 * Single words only, so punchy human copy ("Ship it. Test it. Ship again.")
 * stays under the bar. The tell is the adjective stack, not brevity, and the
 * model still reads the wider variants this deliberately misses.
 */
const TRICOLON = /\b([A-Za-z][\w'-]*)\.\s+([A-Z][\w'-]*)\.\s+([A-Z][\w'-]*)\./g;

/**
 * "It's not just a dashboard. It's a decision engine."
 * Also catches the comma and dash variants of the same shape.
 */
const BINARY_CONTRAST =
  /\b(?:it'?s|this is|we'?re|that'?s)\s+not\s+(?:just\s+)?[^.,;!?—–]{2,60}[.,;—–]\s*(?:it'?s|this is|we'?re|that'?s)\b/gi;

/**
 * "Trusted by 2,400+ revenue teams" / "over 500 companies" / "10x faster"
 *
 * An inflation marker is required — the `+`, a "k"/"m" suffix, an "over", or a
 * multiplier. The scanner cannot see whether a figure is sourced, so matching
 * every number would flag ordinary facts ("we support 60 customers"), which
 * are the specific, grounded claims this feature exists to protect.
 */
const UNSOURCED_NUMBER = new RegExp(
  String.raw`\b\d[\d,.]*\s*(?:\+|k\b|m\b)\s*(?:\w+\s+){0,2}(?:${PROOF_NOUNS})\b` +
    String.raw`|\b(?:over|more than|upwards of)\s+\d[\d,.]*\s*(?:\w+\s+){0,2}(?:${PROOF_NOUNS})\b` +
    String.raw`|\b\d[\d,.]*x\s+(?:faster|more|better|cheaper|higher|greater)\b`,
  "gi",
);

/** "The best part: it learns." — a short setup clause before the colon. */
const COLON_REVEAL =
  /\b(?:the\s+(?:best|hard|real|catch|kicker|beauty|magic|result|upshot)\s+(?:part|thing|news|of it)?)\s*:/gi;

/**
 * "…adds file search, highlighting the team's commitment to better workflows."
 *
 * The comma is required: "a dashboard highlighting overdue deals" is a real
 * description, while a trailing clause bolted onto a finished sentence is the
 * tell.
 */
const SUPERFICIAL_ANALYSIS = new RegExp(
  String.raw`,\s*(?:${SUPERFICIAL_ANALYSIS_VERBS.join("|")})\b[^.!?]*`,
  "gi",
);

/** "Tired of messy spreadsheets? There's a better way." */
const QUESTION_INTO_ANSWER =
  /\?\s+(?:there'?s a better way|here'?s (?:how|why|the)|you'?re not alone|we get it|good news|the answer is)\b/gi;

function matchPattern(
  text: string,
  pattern: RegExp,
  id: TellId,
  clean: (raw: string) => string = (raw) => raw.trim(),
): TellMatch[] {
  const spec = TELLS[id];
  const out: TellMatch[] = [];
  for (const m of text.matchAll(pattern)) {
    out.push({
      id,
      title: spec.title,
      confidence: spec.confidence,
      excerpt: clean(m[0]),
      index: m.index,
    });
  }
  return out;
}

/** Roughly, sentence-enders. Good enough for a density ratio. */
function countSentences(text: string): number {
  const enders = text.match(/[.!?]+(?:\s|$)/g);
  return Math.max(enders?.length ?? 0, 1);
}

export const EM_DASH_PER_SENTENCE_THRESHOLD = 0.5;

/**
 * Counts dash *asides* rather than dash characters.
 *
 * A matched pair inside one sentence is a single parenthetical — correct
 * punctuation that formal prose uses freely — while a lone dash is one clause
 * joined where a comma would do. Counting characters treated every
 * parenthetical as two offences and flagged careful writing for it.
 */
function countDashAsides(text: string): number {
  const prose = text.replace(NUMERIC_RANGE_DASH, "");
  let asides = 0;
  for (const sentence of prose.split(/[.!?]+(?:\s|$)/)) {
    asides += Math.ceil((sentence.match(EM_DASH)?.length ?? 0) / 2);
  }
  return asides;
}

/**
 * A ratio rather than a count, so a long page is not flagged for the same
 * dash habit a short one gets away with. Exceeding the threshold is the tell:
 * one aside every other sentence is still within ordinary usage.
 */
function matchEmDashDensity(text: string): TellMatch[] {
  const asides = countDashAsides(text);
  if (asides < 2) return [];

  const sentences = countSentences(text);
  if (asides / sentences <= EM_DASH_PER_SENTENCE_THRESHOLD) return [];

  const spec = TELLS["em-dash-density"];
  return [
    {
      id: "em-dash-density",
      title: spec.title,
      confidence: spec.confidence,
      excerpt: `${asides} dash asides across ${sentences} sentence${sentences === 1 ? "" : "s"}`,
      index: -1,
    },
  ];
}

// ── entry points ─────────────────────────────────────────────────────────────

/**
 * Scan a block of prose. Matches come back in document order, with the
 * whole-text density check last.
 */
export function scanForTells(text: string): TellMatch[] {
  if (!text.trim()) return [];

  const positional = [
    ...matchPattern(text, TRICOLON, "tricolon"),
    ...matchPattern(text, BINARY_CONTRAST, "binary-contrast"),
    ...matchWordList(text, INFLATED_VERBS, "inflated-verb"),
    ...matchWordList(text, FRICTIONLESS_ADVERBS, "frictionless-adverb"),
    ...matchWordList(text, CATEGORY_INFLATION, "category-inflation"),
    ...matchPattern(text, UNSOURCED_NUMBER, "unsourced-number"),
    ...matchPattern(text, COLON_REVEAL, "colon-reveal"),
    ...matchPattern(text, QUESTION_INTO_ANSWER, "question-into-answer"),
    ...matchWordList(text, EMPTY_PHRASES, "empty-phrase"),
    ...matchPattern(text, SUPERFICIAL_ANALYSIS, "superficial-analysis"),
  ].sort((a, b) => a.index - b.index);

  return [...positional, ...matchEmDashDensity(text)];
}

/**
 * Scan a short standalone string such as a button label or link text.
 *
 * Separate from `scanForTells` because the CTA check only makes sense against
 * a whole label: "learn more about pricing" inside a paragraph is ordinary
 * English, while a button reading exactly "Learn more" is the tell.
 */
export function scanLabelForTells(label: string): TellMatch[] {
  const normalized = label.trim().replace(/\s+/g, " ").toLowerCase();
  const bare = normalized.replace(/[.!?→>\s]+$/g, "");
  if (!VAGUE_CTA_LABELS.includes(bare)) return [];

  const spec = TELLS["vague-cta"];
  return [
    {
      id: "vague-cta",
      title: spec.title,
      confidence: spec.confidence,
      excerpt: label.trim(),
      index: 0,
    },
  ];
}

/** Counts by tell id — the shape the eval scores against. */
export function summarizeTells(
  matches: readonly TellMatch[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const match of matches) {
    counts[match.id] = (counts[match.id] ?? 0) + 1;
  }
  return counts;
}
