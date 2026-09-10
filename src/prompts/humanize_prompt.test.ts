import { describe, expect, it } from "vitest";

import { listTells } from "../shared/ai_tells";
import { HUMANIZE_REVIEW_SYSTEM_PROMPT } from "./humanize_prompt";

describe("HUMANIZE_REVIEW_SYSTEM_PROMPT", () => {
  // The scanner pre-flags matches and the model reports them. If the two drift,
  // the same tell surfaces under two different headings depending on which
  // found it, which is exactly the split vocabulary this feature avoids.
  it("names every scanner tell with the identical user-facing title", () => {
    for (const tell of listTells()) {
      expect(
        HUMANIZE_REVIEW_SYSTEM_PROMPT,
        `prompt is missing the title for "${tell.id}"`,
      ).toContain(tell.title);
    }
  });

  it("gives every scanner tell its slug so findings can be traced back", () => {
    for (const tell of listTells()) {
      expect(
        HUMANIZE_REVIEW_SYSTEM_PROMPT,
        `prompt is missing the slug for "${tell.id}"`,
      ).toContain(`\`${tell.id}\``);
    }
  });

  it("covers the tells no pattern can catch", () => {
    for (const slug of [
      "importance-puffery",
      "weasel-attribution",
      "profound-kicker",
      "benefit-padding",
      "stacked-abstraction",
      "robotic-rhythm",
      "symmetrical-grid",
    ]) {
      expect(HUMANIZE_REVIEW_SYSTEM_PROMPT).toContain(`\`${slug}\``);
    }
  });

  it("forbids inventing evidence and routes those findings to Needs", () => {
    expect(HUMANIZE_REVIEW_SYSTEM_PROMPT).toContain("# Never invent");
    expect(HUMANIZE_REVIEW_SYSTEM_PROMPT).toMatch(
      /Never write a testimonial, customer name, company name, or quote/,
    );
    expect(HUMANIZE_REVIEW_SYSTEM_PROMPT).toMatch(
      /Never write a statistic, user count, funding figure, or percentage/,
    );
    expect(HUMANIZE_REVIEW_SYSTEM_PROMPT).toContain(
      "**Needs** in place of **Suggested**",
    );
  });

  // Rewriting copy that already reads well is a worse outcome than missing a
  // tell, so the instruction has to survive prompt edits.
  it("protects copy that already reads well", () => {
    expect(HUMANIZE_REVIEW_SYSTEM_PROMPT).toContain("# What never to change");
    expect(HUMANIZE_REVIEW_SYSTEM_PROMPT).toMatch(
      /Leave strong human sentences alone/,
    );
    expect(HUMANIZE_REVIEW_SYSTEM_PROMPT).toMatch(
      /voice rules, they win over every guideline here/,
    );
  });

  it("reviews without editing, and scopes itself to copy a visitor sees", () => {
    expect(HUMANIZE_REVIEW_SYSTEM_PROMPT).toMatch(
      /Report findings and stop\. Do not edit any file during a review/,
    );
    expect(HUMANIZE_REVIEW_SYSTEM_PROMPT).toMatch(/Skip .*aria-label/);
  });

  it("declares the finding tag and its required fields", () => {
    expect(HUMANIZE_REVIEW_SYSTEM_PROMPT).toContain("<dyad-humanize-finding");
    expect(HUMANIZE_REVIEW_SYSTEM_PROMPT).toContain("</dyad-humanize-finding>");
    for (const field of [
      "**What**",
      "**Why it reads as AI**",
      "**Your line**",
      "**Relevant Files**",
    ]) {
      expect(HUMANIZE_REVIEW_SYSTEM_PROMPT).toContain(field);
    }
  });

  it("defines each confidence level it asks the model to emit", () => {
    for (const level of ["**strong**", "**likely**", "**subtle**"]) {
      expect(HUMANIZE_REVIEW_SYSTEM_PROMPT).toContain(level);
    }
  });

  // Slugs are for fixtures and telemetry. A user reading a finding heading
  // should never meet one.
  it("keeps slugs out of the example finding's body", () => {
    const afterHeading =
      HUMANIZE_REVIEW_SYSTEM_PROMPT.split("# Example:")[1] ?? "";
    const block = afterHeading.slice(
      afterHeading.indexOf("<dyad-humanize-finding"),
      afterHeading.indexOf("</dyad-humanize-finding>"),
    );
    // Everything after the opening tag — the slug belongs in `tell=`, not here.
    const body = block.slice(block.indexOf(">") + 1);

    expect(body).not.toContain("tricolon");
    expect(block).toContain('title="Three adjectives, no substance"');
    expect(block).toContain('tell="tricolon"');
  });
});
