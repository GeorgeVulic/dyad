import React, { useState } from "react";
import { PenLine } from "lucide-react";
import {
  DyadCard,
  DyadCardHeader,
  DyadBadge,
  DyadExpandIcon,
  DyadCardContent,
  DyadFilePath,
} from "./DyadCardPrimitives";
import { VanillaMarkdownParser } from "./DyadMarkdownParser";

/**
 * The labelled sections a humanize finding emits, per the output format in
 * `HUMANIZE_REVIEW_SYSTEM_PROMPT`.
 *
 * `suggested` and `needs` are mutually exclusive by design: a finding that
 * depends on a fact the reviewer does not have asks for it instead of
 * inventing a replacement.
 */
export interface ParsedHumanizeFinding {
  what?: string;
  why?: string;
  yourLine?: string;
  suggested?: string;
  needs?: string;
  files?: string;
}

const FIELD_PATTERN =
  /\*\*(What|Why it reads as AI|Your line|Suggested|Needs|Relevant Files)\*\*:\s*/gi;

const FIELD_KEYS: Record<string, keyof ParsedHumanizeFinding> = {
  what: "what",
  "why it reads as ai": "why",
  "your line": "yourLine",
  suggested: "suggested",
  needs: "needs",
  "relevant files": "files",
};

/**
 * Splits a finding body into its labelled sections.
 *
 * Returns an empty object when the body does not use the expected labels, so
 * the card can fall back to rendering the model's prose rather than showing a
 * confidently empty shell.
 */
export function parseHumanizeFinding(body: string): ParsedHumanizeFinding {
  const parsed: ParsedHumanizeFinding = {};
  const matches = [...body.matchAll(FIELD_PATTERN)];

  for (const [i, match] of matches.entries()) {
    const key = FIELD_KEYS[match[1].toLowerCase()];
    if (!key || match.index === undefined) continue;

    const start = match.index + match[0].length;
    const end = matches[i + 1]?.index ?? body.length;
    const value = body.slice(start, end).trim();
    if (value) parsed[key] = value;
  }

  return parsed;
}

/** Strips the backticks the model wraps around `path:line`. */
function cleanPath(raw: string): string {
  return raw.replace(/`/g, "").trim();
}

interface DyadHumanizeFindingProps {
  title?: string;
  tell?: string;
  confidence?: string;
  children?: React.ReactNode;
}

/**
 * A single finding from a humanize review.
 *
 * The card leads with the reader's own sentence rather than a file path,
 * because the person acting on this is reading their page, not navigating a
 * codebase. The path stays available underneath for whoever needs it.
 *
 * Confidence is a muted badge rather than a coloured one: how strongly a line
 * reads as generated is not a severity scale, and painting it like one would
 * teach people to ignore the label.
 */
export function DyadHumanizeFinding({
  title,
  tell,
  confidence,
  children,
}: DyadHumanizeFindingProps) {
  // Collapsed by default. A review returns many findings at once, and the
  // quoted line below the header carries enough to triage without expanding.
  const [isExpanded, setIsExpanded] = useState(false);

  const body = typeof children === "string" ? children : "";
  const finding = parseHumanizeFinding(body);
  const hasFields = Object.keys(finding).length > 0;

  return (
    <DyadCard
      accentColor="violet"
      showAccent
      isExpanded={isExpanded}
      onClick={() => setIsExpanded(!isExpanded)}
      data-testid="humanize-finding"
      data-tell={tell}
    >
      <DyadCardHeader icon={<PenLine size={15} />} accentColor="violet">
        <span className="font-medium text-sm text-foreground truncate">
          {title || "Copy finding"}
        </span>
        {confidence && <DyadBadge color="slate">{confidence}</DyadBadge>}
        <div className="ml-auto">
          <DyadExpandIcon isExpanded={isExpanded} />
        </div>
      </DyadCardHeader>

      {finding.yourLine && (
        <div className="px-3 pb-2">
          <blockquote
            className="border-l-2 border-violet-400/70 pl-2.5 text-sm text-foreground/90 italic cursor-text"
            onClick={(e) => e.stopPropagation()}
          >
            {finding.yourLine}
          </blockquote>
        </div>
      )}

      <DyadCardContent isExpanded={isExpanded}>
        <div
          className="cursor-text space-y-2.5"
          onClick={(e) => e.stopPropagation()}
        >
          {hasFields ? (
            <>
              {finding.what && (
                <p className="text-sm text-foreground/90">{finding.what}</p>
              )}

              {finding.why && (
                <div className="text-xs text-muted-foreground">
                  {finding.why}
                </div>
              )}

              {finding.suggested && (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                    Suggested
                  </div>
                  <p className="text-sm text-foreground rounded-md bg-violet-500/5 ring-1 ring-inset ring-violet-500/20 px-2.5 py-1.5">
                    {finding.suggested}
                  </p>
                </div>
              )}

              {finding.needs && (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                    Needs from you
                  </div>
                  <p className="text-sm text-foreground rounded-md bg-amber-500/5 ring-1 ring-inset ring-amber-500/25 px-2.5 py-1.5">
                    {finding.needs}
                  </p>
                </div>
              )}
            </>
          ) : (
            body && (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <VanillaMarkdownParser content={body} />
              </div>
            )
          )}
        </div>
      </DyadCardContent>

      {finding.files && isExpanded && (
        <DyadFilePath path={cleanPath(finding.files)} />
      )}
    </DyadCard>
  );
}
