import { describe, expect, it } from "vitest";

import { flexibleMatcher, parseHumanizeFindings } from "./humanize_handlers";

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

  // Real reviews append where the copy is rendered. The path has to survive
  // that, or approving the finding cannot open the file.
  it.each([
    ["`src/data/config.ts:13`", "src/data/config.ts"],
    [
      "src/data/config.ts:13 (rendered in src/app/page.tsx:18 and src/app/layout.tsx:12)",
      "src/data/config.ts",
    ],
    ["src/app/about/page.tsx", "src/app/about/page.tsx"],
    [
      "`src/components/landing/Hero.tsx:28-31`",
      "src/components/landing/Hero.tsx",
    ],
    ["src/a.tsx, src/b.tsx", "src/a.tsx"],
  ])("reads a usable path out of %s", (written, expected) => {
    const [parsed] = parseHumanizeFindings(
      finding(`**Relevant Files**: ${written}`),
    );
    expect(parsed.filePath).toBe(expected);
  });
});

describe("flexibleMatcher", () => {
  // JSX wraps copy across indented lines; a review quotes it as one sentence.
  // Literal comparison fails on most multi-line copy.
  it("matches copy the source wrapped across lines", () => {
    const source = `          <p>
            A selection of design and engineering projects — each with a real
            challenge, a deliberate approach, and a measured outcome.
          </p>`;
    const quoted =
      "A selection of design and engineering projects — each with a real challenge, a deliberate approach, and a measured outcome.";

    expect([...source.matchAll(flexibleMatcher(quoted))]).toHaveLength(1);
  });

  it("does not match text interrupted by markup", () => {
    const source = `            Designer who codes.
            <br />
            Engineer who cares.`;

    expect([
      ...source.matchAll(
        flexibleMatcher("Designer who codes. Engineer who cares."),
      ),
    ]).toHaveLength(0);
    // Ignoring tags reveals it, which is how the refusal explains itself
    // rather than reporting a line that plainly is on the page as missing.
    expect(
      flexibleMatcher("Designer who codes. Engineer who cares.").test(
        source.replace(/<[^>]+>/g, " "),
      ),
    ).toBe(true);
  });

  it("treats regex characters in copy as literal text", () => {
    const quoted = "Pricing (from $29/seat) — no setup fee.";
    expect(flexibleMatcher(quoted).test(`<p>${quoted}</p>`)).toBe(true);
    expect(flexibleMatcher(quoted).test("<p>Pricing X29 seat</p>")).toBe(false);
  });

  it("finds both copies when a line appears twice, so the edit is refused", () => {
    const source = "<h1>Get started</h1>\n<span>Get  started</span>";
    expect([...source.matchAll(flexibleMatcher("Get started"))]).toHaveLength(
      2,
    );
  });
});
