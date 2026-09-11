import { useQuery } from "@tanstack/react-query";
import { ipc } from "@/ipc/types";
import { queryKeys } from "@/lib/queryKeys";
import { DyadError, DyadErrorKind } from "@/errors/dyad_error";

export function useHumanizeReview(appId: number | null) {
  return useQuery({
    queryKey: queryKeys.humanizeReview.byApp({ appId }),
    queryFn: async () => {
      if (!appId) {
        throw new DyadError("App ID is required", DyadErrorKind.Validation);
      }
      return ipc.humanize.getLatestHumanizeReview(appId);
    },
    enabled: appId !== null,
    retry: false,
    meta: {
      // An app with no review yet is the normal first state, not an error.
      showErrorToast: false,
    },
  });
}
