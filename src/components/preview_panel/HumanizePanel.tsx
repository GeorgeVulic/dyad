import { useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { useQueryClient } from "@tanstack/react-query";
import { PenLine, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { isChatPanelHiddenAtom } from "@/atoms/viewAtoms";
import { useStreamChat } from "@/hooks/useStreamChat";
import { useSelectChat } from "@/hooks/useSelectChat";
import { ipc } from "@/ipc/types";
import { showError } from "@/lib/toast";
import { queryKeys } from "@/lib/queryKeys";
import { listAllTells } from "@/shared/ai_tells";

/**
 * Entry point for a humanize review.
 *
 * Findings stream into the chat as cards rather than collecting here, so this
 * panel does two jobs: it makes the feature discoverable, and it names the
 * patterns the review looks for. The pattern list is read from the shared
 * taxonomy, so what a user reads here is what a finding can report.
 */
export function HumanizePanel() {
  const selectedAppId = useAtomValue(selectedAppIdAtom);
  const setIsChatPanelHidden = useSetAtom(isChatPanelHiddenAtom);
  const { streamMessage } = useStreamChat({ hasChatId: false });
  const { selectChat } = useSelectChat();
  const queryClient = useQueryClient();
  const [isRunning, setIsRunning] = useState(false);

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
        onSettled: () => setIsRunning(false),
      });
    } catch (err) {
      showError(`Failed to run humanize review: ${err}`);
      setIsRunning(false);
    }
  };

  if (!selectedAppId) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        Select an app to review its copy.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-4 pt-0 space-y-5">
        <div className="rounded-xl border border-border/60 bg-(--background-lightest) p-4">
          <div className="flex items-start gap-3">
            <div className="flex items-center justify-center size-8 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400 shrink-0">
              <PenLine size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-foreground">
                Check your copy before you publish
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Reads the words on your pages and points out the ones that sound
                like they came from a language model. It reports what it finds
                and changes nothing — you decide what to act on.
              </p>
            </div>
          </div>

          <div className="mt-4">
            <Button
              onClick={handleRunReview}
              disabled={isRunning}
              className="gap-2"
              data-testid="humanize-run-review"
            >
              {isRunning ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Reading your copy…
                </>
              ) : (
                <>
                  <PenLine size={16} />
                  Run review
                </>
              )}
            </Button>
            {isRunning && (
              <p className="mt-2 text-xs text-muted-foreground">
                Findings appear in the chat on the left as they come in.
              </p>
            )}
          </div>
        </div>

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
                <details className="group">
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
