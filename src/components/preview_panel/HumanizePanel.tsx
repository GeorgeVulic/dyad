import { useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { useQueryClient } from "@tanstack/react-query";
import { PenLine, Loader2, Check, RotateCw, FileWarning } from "lucide-react";

import { Button } from "@/components/ui/button";
import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { isChatPanelHiddenAtom } from "@/atoms/viewAtoms";
import { useStreamChat } from "@/hooks/useStreamChat";
import { useSelectChat } from "@/hooks/useSelectChat";
import { useHumanizeReview } from "@/hooks/useHumanizeReview";
import { ipc } from "@/ipc/types";
import type { HumanizeFinding } from "@/ipc/types/humanize";
import { showError, showSuccess } from "@/lib/toast";
import { queryKeys } from "@/lib/queryKeys";
import { listAllTells } from "@/shared/ai_tells";

/** Distinguishes findings within a review without relying on array position. */
function findingKey(finding: HumanizeFinding, index: number): string {
  return `${index}:${finding.title}:${finding.yourLine ?? ""}`;
}

const FAILURE_MESSAGE: Record<string, string> = {
  "not-found":
    "That line isn't in the file any more — the copy changed since the review. Run it again to pick up the current text.",
  ambiguous:
    "That line appears more than once in the file, so there's no way to tell which one was reviewed. Edit it by hand.",
  unreadable: "That file couldn't be opened.",
};

function FindingCard({
  finding,
  state,
  onApprove,
}: {
  finding: HumanizeFinding;
  state: "idle" | "applying" | "applied";
  onApprove: () => void;
}) {
  const canApply = Boolean(
    finding.suggested && finding.yourLine && finding.filePath,
  );

  return (
    <div className="rounded-xl border border-border/60 bg-(--background-lightest) p-3">
      <div className="flex items-start gap-2">
        <span className="text-sm font-medium text-foreground flex-1 min-w-0">
          {finding.title}
        </span>
        {finding.confidence && (
          <span className="text-[11px] text-muted-foreground shrink-0 mt-0.5">
            {finding.confidence}
          </span>
        )}
      </div>

      {finding.yourLine && (
        <blockquote className="mt-2 border-l-2 border-violet-400/70 pl-2.5 text-sm text-foreground/90 italic">
          {finding.yourLine}
        </blockquote>
      )}

      {finding.why && (
        <p className="mt-2 text-xs text-muted-foreground">{finding.why}</p>
      )}

      {finding.suggested && (
        <div className="mt-2.5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            Suggested
          </div>
          <p className="text-sm text-foreground rounded-md bg-violet-500/5 ring-1 ring-inset ring-violet-500/20 px-2.5 py-1.5">
            {finding.suggested}
          </p>
        </div>
      )}

      {finding.needs && (
        <div className="mt-2.5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            Needs from you
          </div>
          <p className="text-sm text-foreground rounded-md bg-amber-500/5 ring-1 ring-inset ring-amber-500/25 px-2.5 py-1.5">
            {finding.needs}
          </p>
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        {state === "applied" ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <Check size={14} />
            Applied
          </span>
        ) : canApply ? (
          <Button
            size="sm"
            onClick={onApprove}
            disabled={state === "applying"}
            data-testid="humanize-approve"
          >
            {state === "applying" ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Applying…
              </>
            ) : (
              "Approve"
            )}
          </Button>
        ) : (
          // A finding that asks for a figure has nothing to apply, and one
          // without a file path cannot be located. Saying so beats a button
          // that does nothing.
          <span className="text-xs text-muted-foreground">
            {finding.needs ? "Needs your input" : "Edit this one by hand"}
          </span>
        )}

        {finding.filePath && (
          <span className="ml-auto text-[11px] text-muted-foreground font-mono truncate">
            {finding.filePath}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Where a humanize review is started, read, and acted on.
 *
 * Findings also render in the chat, but the chat is a transcript: it cannot
 * offer an action that changes a file. Approving happens here.
 */
export function HumanizePanel() {
  const selectedAppId = useAtomValue(selectedAppIdAtom);
  const setIsChatPanelHidden = useSetAtom(isChatPanelHiddenAtom);
  const { streamMessage } = useStreamChat({ hasChatId: false });
  const { selectChat } = useSelectChat();
  const queryClient = useQueryClient();
  const { data, isLoading, refetch } = useHumanizeReview(selectedAppId);

  const [isRunning, setIsRunning] = useState(false);
  const [applied, setApplied] = useState<
    Record<string, "applying" | "applied">
  >({});

  const handleRunReview = async () => {
    if (!selectedAppId) {
      showError("No app selected");
      return;
    }

    try {
      setIsRunning(true);
      const chatId = await ipc.chat.createChat(selectedAppId);

      setIsChatPanelHidden(false);
      selectChat({ chatId, appId: selectedAppId });
      queryClient.invalidateQueries({ queryKey: queryKeys.chats.all });

      await streamMessage({
        prompt: "/humanize",
        chatId,
        appId: selectedAppId,
        onSettled: () => {
          setApplied({});
          refetch();
          setIsRunning(false);
        },
      });
    } catch (err) {
      showError(`Failed to run humanize review: ${err}`);
      setIsRunning(false);
    }
  };

  const handleApprove = async (finding: HumanizeFinding, key: string) => {
    if (!selectedAppId || !finding.filePath) return;

    setApplied((prev) => ({ ...prev, [key]: "applying" }));
    try {
      const result = await ipc.humanize.applyHumanizeFinding({
        appId: selectedAppId,
        filePath: finding.filePath,
        yourLine: finding.yourLine!,
        suggested: finding.suggested!,
      });

      if (result.applied) {
        setApplied((prev) => ({ ...prev, [key]: "applied" }));
        showSuccess("Copy updated");
        return;
      }

      setApplied((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      showError(
        FAILURE_MESSAGE[result.reason ?? ""] ?? "That change couldn't be made.",
      );
    } catch (err) {
      setApplied((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      showError(`Failed to apply the change: ${err}`);
    }
  };

  if (!selectedAppId) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        Select an app to review its copy.
      </div>
    );
  }

  const findings = data?.findings ?? [];
  const hasReview = findings.length > 0;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-4 pt-0 space-y-4">
        <div className="rounded-xl border border-border/60 bg-(--background-lightest) p-4">
          <div className="flex items-start gap-3">
            <div className="flex items-center justify-center size-8 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400 shrink-0">
              <PenLine size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-foreground">
                {hasReview
                  ? `${findings.length} ${findings.length === 1 ? "line" : "lines"} worth a second look`
                  : "Check your copy before you publish"}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {hasReview
                  ? "Nothing changes until you approve it. Approving rewrites that line in the file."
                  : "Reads the words on your pages and points out the ones that sound like they came from a language model."}
              </p>
            </div>
          </div>

          <div className="mt-4">
            <Button
              onClick={handleRunReview}
              disabled={isRunning}
              variant={hasReview ? "outline" : "default"}
              className="gap-2"
              data-testid="humanize-run-review"
            >
              {isRunning ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Reading your copy…
                </>
              ) : hasReview ? (
                <>
                  <RotateCw size={16} />
                  Review again
                </>
              ) : (
                <>
                  <PenLine size={16} />
                  Run review
                </>
              )}
            </Button>
          </div>
        </div>

        {isLoading ? null : hasReview ? (
          <div className="space-y-2.5" data-testid="humanize-findings">
            {findings.map((finding, index) => {
              const key = findingKey(finding, index);
              return (
                <FindingCard
                  key={key}
                  finding={finding}
                  state={applied[key] ?? "idle"}
                  onApprove={() => handleApprove(finding, key)}
                />
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border/60 p-4 text-center">
            <FileWarning
              size={18}
              className="mx-auto text-muted-foreground mb-2"
            />
            <p className="text-xs text-muted-foreground">
              No review yet. Findings appear here once one has run.
            </p>
          </div>
        )}

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            What it looks for
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Each finding names one of these. Writing that is specific and says
            something real is left alone.
          </p>

          <ul className="mt-3 space-y-1.5">
            {listAllTells().map((tell) => (
              <li
                key={tell.id}
                className="rounded-lg border border-border/50 px-3 py-2"
              >
                <details>
                  <summary className="cursor-pointer list-none text-sm text-foreground marker:content-none">
                    {tell.title}
                  </summary>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {tell.why}
                  </p>
                </details>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
