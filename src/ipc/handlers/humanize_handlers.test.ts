import { describe, expect, it } from "vitest";

import { parseHumanizeFindings } from "./humanize_handlers";

function finding(body: string, attrs = 'title="A test" tell="x"'): string {
  return `<dyad-humanize-finding ${attrs}>\n${body}\n</dyad-humanize-finding>`;
}

describe("parseHumanizeFindings", () => {
  it("pulls the attributes and labelled sections out of a review", () => {
    const findings = parseHumanizeFindings(
      "Here is what I found.\n\n" +
        finding(
          [
            "**What**: The tagline could belong to any product.",
            "**Why it reads as AI**: It fails the portability test.",
            "**Your line**: I design & build delightful products.",
            "**Suggested**: I design & build design systems.",
            "**Relevant Files**: `src/data/config.ts:13`",
          ].join("\n\n"),
          'title="A benefit that fits any product" tell="benefit-padding" confidence="strong"',
        ),
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]).toEqual({
      title: "A benefit that fits any product",
      tell: "benefit-padding",
      confidence: "strong",
      what: "The tagline could belong to any product.",
      why: "It fails the portability test.",
      yourLine: "I design & build delightful products.",
      suggested: "I design & build design systems.",
      // The line number is dropped: the edit is a string replacement, so the
      // path has to be openable.
      filePath: "src/data/config.ts",
    });
  });

  it("reads every finding in a review, not just the first", () => {
    const content =
      finding("**Your line**: One.", 'title="First"') +
      "\n\nSome prose in between.\n\n" +
      finding("**Your line**: Two.", 'title="Second"');

    expect(parseHumanizeFindings(content).map((f) => f.title)).toEqual([
      "First",
      "Second",
    ]);
  });

  it("keeps Needs separate from Suggested", () => {
    const [parsed] = parseHumanizeFindings(
      finding(
        "**Your line**: Cutting ship time by 40%.\n\n**Needs**: The real figure.",
        'title="A number with no source"',
      ),
    );

    expect(parsed.needs).toBe("The real figure.");
    expect(parsed.suggested).toBeUndefined();
  });

  it("drops a confidence it does not recognize rather than trusting it", () => {
    const [parsed] = parseHumanizeFindings(
      finding("**Your line**: Hi.", 'title="T" confidence="extremely"'),
    );
    expect(parsed.confidence).toBeUndefined();
  });

  it("returns nothing for a message with no findings", () => {
    expect(parseHumanizeFindings("Everything reads fine.")).toEqual([]);
    expect(parseHumanizeFindings("")).toEqual([]);
  });
});
