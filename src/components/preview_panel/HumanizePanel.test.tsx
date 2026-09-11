import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { HumanizePanel } from "./HumanizePanel";
import { listAllTells } from "@/shared/ai_tells";

const mocks = vi.hoisted(() => ({
  streamMessage: vi.fn(),
  selectChat: vi.fn(),
  setIsChatPanelHidden: vi.fn(),
  invalidateQueries: vi.fn(),
  createChat: vi.fn(),
  applyHumanizeFinding: vi.fn(),
  refetch: vi.fn(),
  showError: vi.fn(),
  showSuccess: vi.fn(),
  review: {
    data: undefined as unknown,
  },
}));

vi.mock("jotai", () => ({
  atom: (initialValue: unknown) => ({ initialValue }),
  useAtomValue: () => 1,
  useSetAtom: () => mocks.setIsChatPanelHidden,
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));

vi.mock("@/hooks/useStreamChat", () => ({
  useStreamChat: () => ({ streamMessage: mocks.streamMessage }),
}));

vi.mock("@/hooks/useSelectChat", () => ({
  useSelectChat: () => ({ selectChat: mocks.selectChat }),
}));

vi.mock("@/hooks/useHumanizeReview", () => ({
  useHumanizeReview: () => ({
    data: mocks.review.data,
    isLoading: false,
    refetch: mocks.refetch,
  }),
}));

vi.mock("@/ipc/types", () => ({
  ipc: {
    chat: { createChat: mocks.createChat },
    humanize: { applyHumanizeFinding: mocks.applyHumanizeFinding },
  },
}));

vi.mock("@/lib/toast", () => ({
  showError: mocks.showError,
  showSuccess: mocks.showSuccess,
}));

const APPLIABLE = {
  title: "A benefit that fits any product",
  tell: "benefit-padding",
  confidence: "strong" as const,
  why: "It fails the portability test.",
  yourLine: "I design & build delightful products.",
  suggested: "I design & build design systems for fintech teams.",
  filePath: "src/data/config.ts",
};

const NEEDS_INPUT = {
  title: "A number with no source",
  tell: "unsourced-number",
  yourLine: "Cutting design-to-ship time by 40%.",
  needs: "The real measurement, or the line goes.",
  filePath: "src/data/config.ts",
};

function withReview(findings: unknown[]) {
  mocks.review.data = {
    findings,
    timestamp: "2026-09-11T00:00:00.000Z",
    chatId: 7,
  };
}

describe("HumanizePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.review.data = undefined;
    mocks.createChat.mockResolvedValue(42);
    mocks.streamMessage.mockResolvedValue(undefined);
    mocks.applyHumanizeFinding.mockResolvedValue({ applied: true });
  });

  it("starts a review in a new chat", async () => {
    render(<HumanizePanel />);

    fireEvent.click(screen.getByTestId("humanize-run-review"));

    await waitFor(() => expect(mocks.createChat).toHaveBeenCalledWith(1));
    expect(mocks.streamMessage).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "/humanize", chatId: 42, appId: 1 }),
    );
    expect(mocks.setIsChatPanelHidden).toHaveBeenCalledWith(false);
  });

  // Leaving the tab and coming back must not look like the review never
  // happened. The findings are re-read from the stored review.
  it("shows the findings from the last review without rerunning it", () => {
    withReview([APPLIABLE]);
    render(<HumanizePanel />);

    // Scoped to the findings list: a finding's title is deliberately the same
    // string as its entry in the taxonomy below, so it appears twice.
    const found = within(screen.getByTestId("humanize-findings"));
    expect(found.getByText(APPLIABLE.title)).toBeTruthy();
    expect(found.getByText(APPLIABLE.yourLine)).toBeTruthy();
    expect(found.getByText(APPLIABLE.suggested)).toBeTruthy();
    // The primary action becomes rerunning, not running for the first time.
    expect(screen.getByText("Review again")).toBeTruthy();
    expect(mocks.streamMessage).not.toHaveBeenCalled();
  });

  it("writes the change to the file when a finding is approved", async () => {
    withReview([APPLIABLE]);
    render(<HumanizePanel />);

    fireEvent.click(screen.getByTestId("humanize-approve"));

    await waitFor(() =>
      expect(mocks.applyHumanizeFinding).toHaveBeenCalledWith({
        appId: 1,
        filePath: APPLIABLE.filePath,
        yourLine: APPLIABLE.yourLine,
        suggested: APPLIABLE.suggested,
      }),
    );
    expect(await screen.findByText("Applied")).toBeTruthy();
  });

  // A refused edit must say why. Silently leaving the button idle would read
  // as the click not registering.
  it("explains a refused edit instead of failing quietly", async () => {
    withReview([APPLIABLE]);
    mocks.applyHumanizeFinding.mockResolvedValue({
      applied: false,
      reason: "not-found",
    });
    render(<HumanizePanel />);

    fireEvent.click(screen.getByTestId("humanize-approve"));

    await waitFor(() => expect(mocks.showError).toHaveBeenCalled());
    expect(String(mocks.showError.mock.calls[0][0])).toContain(
      "isn't in the file any more",
    );
    expect(screen.queryByText("Applied")).toBeNull();
  });

  // Applying a finding that asks for a real figure would mean inventing one.
  it("offers no approve button when the fix needs a fact we do not have", () => {
    withReview([NEEDS_INPUT]);
    render(<HumanizePanel />);

    expect(screen.getByText(NEEDS_INPUT.needs)).toBeTruthy();
    expect(screen.queryByTestId("humanize-approve")).toBeNull();
    expect(screen.getByText("Needs your input")).toBeTruthy();
  });

  it("lists every pattern a finding can report", () => {
    render(<HumanizePanel />);

    const tells = listAllTells();
    expect(tells.length).toBeGreaterThan(12);
    for (const tell of tells) {
      expect(screen.getByText(tell.title)).toBeTruthy();
    }
  });

  it("surfaces a failure instead of leaving the button spinning", async () => {
    mocks.createChat.mockRejectedValue(new Error("no app"));
    render(<HumanizePanel />);

    fireEvent.click(screen.getByTestId("humanize-run-review"));

    await waitFor(() => expect(mocks.showError).toHaveBeenCalled());
  });
});
