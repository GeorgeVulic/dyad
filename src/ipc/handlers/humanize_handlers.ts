import fs from "node:fs";
import { db } from "../../db";
import { apps, chats, messages } from "../../db/schema";
import { eq, and, like, desc } from "drizzle-orm";
import { createTypedHandler } from "./base";
import { humanizeContracts } from "../types/humanize";
import type { HumanizeFinding } from "../types/humanize";
import { DyadError, DyadErrorKind } from "@/errors/dyad_error";
import { getDyadAppPath } from "../../paths/paths";
import { safeJoin } from "../utils/path_utils";
import log from "electron-log";

const logger = log.scope("humanize_handlers");

const FINDING_TAG =
  /<dyad-humanize-finding\s+([^>]*)>([\s\S]*?)<\/dyad-humanize-finding>/g;

const ATTRIBUTE = /(\w+)="([^"]*)"/g;

const BODY_FIELD =
  /\*\*(What|Why it reads as AI|Your line|Suggested|Needs|Relevant Files)\*\*:\s*/gi;

const BODY_KEYS: Record<string, keyof HumanizeFinding> = {
  what: "what",
  "why it reads as ai": "why",
  "your line": "yourLine",
  suggested: "suggested",
  needs: "needs",
  "relevant files": "filePath",
};

const CONFIDENCES = new Set(["strong", "likely", "subtle"]);

/**
 * Pulls a usable path out of whatever the review wrote.
 *
 * The prompt asks for one `path:line`, but a review often says where the copy
 * is also rendered — "src/data/config.ts:13 (rendered in src/app/page.tsx:18
 * and src/app/layout.tsx:12)". That trailing note is commentary, and feeding
 * the whole string to the filesystem fails to open anything. The first
 * path-shaped token is the file the quoted line actually lives in.
 */
const FILE_REFERENCE = /([\w./@-]+\.[A-Za-z0-9]+)(?::\d+(?:-\d+)?)?/;

function cleanFilePath(raw: string): string {
  const cleaned = raw.replace(/`/g, "").trim();
  return FILE_REFERENCE.exec(cleaned)?.[1] ?? cleaned;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Matches a quoted line against source that wraps it.
 *
 * JSX holds copy across several indented lines, while a review quotes it as
 * the reader sees it — one sentence. Comparing the two literally fails on
 * most multi-line copy, so every run of whitespace matches any other.
 */
export function flexibleMatcher(line: string): RegExp {
  return new RegExp(
    line.trim().split(/\s+/).map(escapeRegex).join("\\s+"),
    "g",
  );
}

export function parseHumanizeFindings(content: string): HumanizeFinding[] {
  const findings: HumanizeFinding[] = [];

  for (const tag of content.matchAll(FINDING_TAG)) {
    const [, rawAttributes, body] = tag;

    const attributes: Record<string, string> = {};
    for (const attribute of rawAttributes.matchAll(ATTRIBUTE)) {
      attributes[attribute[1]] = attribute[2];
    }
    if (!attributes.title) continue;

    const finding: HumanizeFinding = { title: attributes.title.trim() };
    if (attributes.tell) finding.tell = attributes.tell;
    if (CONFIDENCES.has(attributes.confidence)) {
      finding.confidence =
        attributes.confidence as HumanizeFinding["confidence"];
    }

    const fields = [...body.matchAll(BODY_FIELD)];
    for (const [i, field] of fields.entries()) {
      const key = BODY_KEYS[field[1].toLowerCase()];
      if (!key || field.index === undefined) continue;

      const start = field.index + field[0].length;
      const end = fields[i + 1]?.index ?? body.length;
      const value = body.slice(start, end).trim();
      if (!value) continue;

      // `filePath` is the only field that is not prose.
      (finding[key] as string) =
        key === "filePath" ? cleanFilePath(value) : value;
    }

    findings.push(finding);
  }

  return findings;
}

export function registerHumanizeHandlers() {
  /**
   * The review message is the store.
   *
   * Findings are re-parsed from the most recent review in this app's chats
   * rather than written to a table of their own, which is how security
   * reviews already work: one copy of the truth, and reopening the panel
   * shows the last review instead of an empty page.
   */
  createTypedHandler(
    humanizeContracts.getLatestHumanizeReview,
    async (_, appId) => {
      if (!appId) {
        throw new DyadError("App ID is required", DyadErrorKind.Validation);
      }

      const result = await db
        .select({
          content: messages.content,
          createdAt: messages.createdAt,
          chatId: messages.chatId,
        })
        .from(messages)
        .innerJoin(chats, eq(messages.chatId, chats.id))
        .where(
          and(
            eq(chats.appId, appId),
            eq(messages.role, "assistant"),
            like(messages.content, "%<dyad-humanize-finding%"),
          ),
        )
        .orderBy(desc(messages.createdAt), desc(messages.id))
        .limit(1);

      if (result.length === 0) {
        logger.log(`No humanize review message found for app ${appId}`);
        throw new DyadError(
          "No humanize review found for this app",
          DyadErrorKind.NotFound,
        );
      }

      const message = result[0];
      const findings = parseHumanizeFindings(message.content);
      logger.log(
        `Humanize review for app ${appId}: chat ${message.chatId}, ${findings.length} finding(s)`,
      );

      if (findings.length === 0) {
        throw new DyadError(
          "No humanize review found for this app",
          DyadErrorKind.NotFound,
        );
      }

      return {
        findings,
        timestamp: message.createdAt.toISOString(),
        chatId: message.chatId,
      };
    },
  );

  /**
   * Applies one approved finding as a literal string replacement.
   *
   * No model is involved: the review already produced the exact before and
   * after, so re-deriving the edit would only add a chance to get it wrong.
   *
   * The replacement is refused unless the quoted line appears in the file
   * exactly once. A line that no longer matches means the copy moved on since
   * the review, and a line that appears twice means we cannot tell which one
   * was reviewed — editing either would be a guess at the user's expense.
   */
  createTypedHandler(
    humanizeContracts.applyHumanizeFinding,
    async (_, { appId, filePath, yourLine, suggested }) => {
      const app = await db.query.apps.findFirst({ where: eq(apps.id, appId) });
      if (!app) {
        throw new DyadError("App not found", DyadErrorKind.NotFound);
      }

      const fullPath = safeJoin(getDyadAppPath(app.path), filePath);

      let contents: string;
      try {
        contents = fs.readFileSync(fullPath, "utf8");
      } catch (err) {
        logger.warn(`Could not read ${filePath} to apply a finding: ${err}`);
        return { applied: false, reason: "unreadable" as const };
      }

      const matches = [...contents.matchAll(flexibleMatcher(yourLine))];

      if (matches.length > 1) {
        return { applied: false, reason: "ambiguous" as const };
      }

      if (matches.length === 0) {
        // Copy broken up by a <br /> or a nested <span> reads as one sentence
        // but is not one string. Replacing it would delete the markup between
        // the halves, so say what happened instead of reshaping the layout.
        const withoutTags = contents.replace(/<[^>]+>/g, " ");
        const reason = flexibleMatcher(yourLine).test(withoutTags)
          ? ("spans-markup" as const)
          : ("not-found" as const);
        return { applied: false, reason };
      }

      const [match] = matches;
      const updated =
        contents.slice(0, match.index) +
        suggested +
        contents.slice(match.index + match[0].length);

      fs.writeFileSync(fullPath, updated, "utf8");
      logger.log(`Applied a humanize finding in ${filePath}`);

      return { applied: true };
    },
  );
}
