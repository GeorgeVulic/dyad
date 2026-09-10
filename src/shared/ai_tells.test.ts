import { describe, expect, it } from "vitest";

import {
  listTells,
  scanForTells,
  scanLabelForTells,
  summarizeTells,
  type TellId,
} from "./ai_tells";

function idsFor(text: string): TellId[] {
  return scanForTells(text).map((m) => m.id);
}

describe("scanForTells", () => {
  it("finds a three-adjective stack", () => {
    const matches = scanForTells("Faster. Smarter. Simpler.");
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      id: "tricolon",
      title: "Three adjectives, no substance",
      confidence: "strong",
      excerpt: "Faster. Smarter. Simpler.",
    });
  });

  it("finds the not-X-it's-Y contrast in its comma and dash forms", () => {
    expect(
      idsFor("It's not just a dashboard. It's a decision engine."),
    ).toContain("binary-contrast");
    expect(
      idsFor("This is not a spreadsheet, it's a system of record."),
    ).toContain("binary-contrast");
    expect(
      idsFor("We're not another CRM — we're the layer above it."),
    ).toContain("binary-contrast");
  });

  it("finds inflated verbs and frictionless adverbs", () => {
    const matches = scanForTells(
      "Supercharge your pipeline and seamlessly unlock revenue.",
    );
    const ids = matches.map((m) => m.id);
    expect(ids).toContain("inflated-verb");
    expect(ids).toContain("frictionless-adverb");
    // "Supercharge" and "unlock" are two separate offenders.
    expect(matches.filter((m) => m.id === "inflated-verb")).toHaveLength(2);
  });

  it("finds category inflation", () => {
    expect(idsFor("An enterprise-grade, best-in-class platform.")).toEqual(
      expect.arrayContaining(["category-inflation"]),
    );
  });

  it("finds inflated social-proof numbers", () => {
    expect(idsFor("Trusted by 2,400+ revenue teams")).toContain(
      "unsourced-number",
    );
    expect(idsFor("Join over 500 companies already shipping faster")).toContain(
      "unsourced-number",
    );
    expect(idsFor("Close deals 10x faster")).toContain("unsourced-number");
  });

  // A plain count is a specific, grounded claim — the kind of writing this
  // feature protects rather than flags. Only the inflation markers are a tell.
  it("leaves a plain count alone", () => {
    expect(idsFor("Our team of four supports 60 customers.")).not.toContain(
      "unsourced-number",
    );
    expect(idsFor("We onboarded 12 teams last quarter.")).not.toContain(
      "unsourced-number",
    );
  });

  it("finds phrases that delay the point", () => {
    expect(
      idsFor("At the end of the day, your team needs one source of truth."),
    ).toContain("empty-phrase");
    expect(idsFor("When it comes to pricing, we keep it simple.")).toContain(
      "empty-phrase",
    );
  });

  it("finds trailing clauses that restate instead of explain", () => {
    expect(
      idsFor(
        "We added file search, highlighting our commitment to better workflows.",
      ),
    ).toContain("superficial-analysis");
  });

  // A participle doing real descriptive work is not the tell; the tell is a
  // clause bolted onto an already-finished sentence.
  it("leaves a descriptive participle alone", () => {
    expect(idsFor("A dashboard highlighting overdue deals.")).not.toContain(
      "superficial-analysis",
    );
  });

  it("finds colon reveals and rhetorical setups", () => {
    expect(idsFor("The best part: it learns from every call.")).toContain(
      "colon-reveal",
    );
    expect(
      idsFor("Tired of messy spreadsheets? There's a better way to work."),
    ).toContain("question-into-answer");
  });

  it("returns matches in document order with the density check last", () => {
    const text =
      "Supercharge your day. It's not a tool. It's a habit — really — truly — honestly.";
    const ids = idsFor(text);
    expect(ids.indexOf("inflated-verb")).toBeLessThan(
      ids.indexOf("binary-contrast"),
    );
    expect(ids.at(-1)).toBe("em-dash-density");
  });

  it("reports each match with the offset of the offending text", () => {
    const text = "We help teams move. Supercharge your workflow today.";
    const match = scanForTells(text).find((m) => m.id === "inflated-verb");
    expect(match).toBeDefined();
    expect(text.slice(match!.index, match!.index + match!.excerpt.length)).toBe(
      match!.excerpt,
    );
  });

  it("returns nothing for empty or whitespace input", () => {
    expect(scanForTells("")).toEqual([]);
    expect(scanForTells("   \n  ")).toEqual([]);
  });
});

// The failure that would kill this feature is flagging good writing, so the
// negative cases carry as much weight as the positive ones.
describe("scanForTells leaves human copy alone", () => {
  const CLEAN_COPY = [
    "Search every customer call, support ticket and deal from one place.",
    "We started Signal Desk after losing a renewal nobody saw coming. The warning signs were in three different tools.",
    "Pricing starts at $29 per seat per month. No setup fee, and you can cancel from the billing page.",
    "Ship it. Test it. Ship again.",
    "Connect Gong, Zendesk and HubSpot. Most teams are done in about ten minutes.",
    "Our team of four supports 60 customers across two time zones.",
  ];

  it.each(CLEAN_COPY)("finds nothing in: %s", (copy) => {
    expect(scanForTells(copy)).toEqual([]);
  });

  it("does not treat short multi-word sentences as an adjective stack", () => {
    expect(idsFor("Ship it. Test it. Ship again.")).not.toContain("tricolon");
  });

  it("does not flag a bare number without a social-proof noun", () => {
    expect(idsFor("Founded in 2019 and profitable since 2022.")).not.toContain(
      "unsourced-number",
    );
  });

  it("does not flag a single em dash", () => {
    expect(
      idsFor("We built this for revenue teams — the ones drowning in tabs."),
    ).not.toContain("em-dash-density");
  });

  it("does not flag dashes in long prose that stays under the ratio", () => {
    const text =
      "We built this for revenue teams — the ones drowning in tabs. " +
      "It connects to the tools you already pay for. " +
      "Setup takes about ten minutes. " +
      "You can cancel whenever you like.";
    expect(idsFor(text)).not.toContain("em-dash-density");
  });
});

describe("scanLabelForTells", () => {
  it("flags a button whose label does not say what happens", () => {
    const matches = scanLabelForTells("Get Started");
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      id: "vague-cta",
      title: "The button doesn't say what happens",
      excerpt: "Get Started",
    });
  });

  it("normalizes casing, spacing and trailing affordances", () => {
    expect(scanLabelForTells("  learn   more  ")).toHaveLength(1);
    expect(scanLabelForTells("Learn more →")).toHaveLength(1);
  });

  it("leaves a label that says what happens alone", () => {
    expect(scanLabelForTells("Start free — no card needed")).toEqual([]);
    expect(scanLabelForTells("Book a 20-minute demo")).toEqual([]);
  });

  // The same words inside a sentence are ordinary English; only a whole label
  // is the tell, which is why prose goes through scanForTells instead.
  it("is not applied to prose containing the same words", () => {
    expect(
      idsFor("You can learn more about pricing on our docs site."),
    ).not.toContain("vague-cta");
  });
});

describe("summarizeTells", () => {
  it("counts matches by tell id", () => {
    const matches = scanForTells(
      "Supercharge and unlock your day. Faster. Smarter. Simpler.",
    );
    expect(summarizeTells(matches)).toEqual({
      "inflated-verb": 2,
      tricolon: 1,
    });
  });

  it("is empty for copy that reads fine", () => {
    expect(
      summarizeTells(scanForTells("Connect your tools in ten minutes.")),
    ).toEqual({});
  });
});

describe("tell catalogue", () => {
  it("gives every tell a plain-language title and a reason", () => {
    for (const tell of listTells()) {
      expect(tell.title.length).toBeGreaterThan(0);
      expect(tell.why.length).toBeGreaterThan(0);
      // Titles are rendered as finding headings, so they must not be slugs.
      expect(tell.title).not.toMatch(/[-_]/);
      expect(tell.title[0]).toBe(tell.title[0].toUpperCase());
    }
  });
});
