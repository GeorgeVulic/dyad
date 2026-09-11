import { z } from "zod";
import { defineContract, createClient } from "../contracts/core";

// =============================================================================
// Humanize Schemas
// =============================================================================

/**
 * One finding from a humanize review, as parsed out of the review message.
 *
 * `suggested` and `needs` are mutually exclusive. A finding that depends on a
 * fact nobody has — a real metric behind an invented percentage — asks for it
 * in `needs` instead of offering a replacement, and cannot be applied.
 */
export const HumanizeFindingSchema = z.object({
  /** Plain-language pattern name, e.g. "A benefit that fits any product". */
  title: z.string(),
  /** Taxonomy slug. Internal; the UI shows `title`. */
  tell: z.string().optional(),
  confidence: z.enum(["strong", "likely", "subtle"]).optional(),
  what: z.string().optional(),
  why: z.string().optional(),
  /** The exact copy as it appears in the file today. */
  yourLine: z.string().optional(),
  suggested: z.string().optional(),
  needs: z.string().optional(),
  filePath: z.string().optional(),
});

export type HumanizeFinding = z.infer<typeof HumanizeFindingSchema>;

export const HumanizeReviewResultSchema = z.object({
  findings: z.array(HumanizeFindingSchema),
  timestamp: z.string(),
  chatId: z.number(),
});

export type HumanizeReviewResult = z.infer<typeof HumanizeReviewResultSchema>;

export const ApplyHumanizeFindingInputSchema = z.object({
  appId: z.number(),
  filePath: z.string(),
  /** Replaced verbatim. Must still match the file or the edit is refused. */
  yourLine: z.string().min(1),
  suggested: z.string().min(1),
});

export type ApplyHumanizeFindingInput = z.infer<
  typeof ApplyHumanizeFindingInputSchema
>;

/**
 * Why an edit did not happen, so the panel can say something true rather than
 * failing silently.
 *
 * `not-found` is the one that matters: the quoted line no longer matches the
 * file, because the copy changed since the review or the model requoted it.
 * Applying a near-match would silently edit the wrong words.
 */
export const ApplyHumanizeFindingResultSchema = z.object({
  applied: z.boolean(),
  reason: z
    .enum(["not-found", "ambiguous", "unreadable", "spans-markup"])
    .optional(),
});

export type ApplyHumanizeFindingResult = z.infer<
  typeof ApplyHumanizeFindingResultSchema
>;

// =============================================================================
// Humanize Contracts
// =============================================================================

export const humanizeContracts = {
  getLatestHumanizeReview: defineContract({
    channel: "get-latest-humanize-review",
    input: z.number(), // appId
    output: HumanizeReviewResultSchema,
  }),
  applyHumanizeFinding: defineContract({
    channel: "apply-humanize-finding",
    input: ApplyHumanizeFindingInputSchema,
    output: ApplyHumanizeFindingResultSchema,
  }),
} as const;

// =============================================================================
// Humanize Client
// =============================================================================

export const humanizeClient = createClient(humanizeContracts);
