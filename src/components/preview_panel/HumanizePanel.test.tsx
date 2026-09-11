import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { HumanizePanel } from "./HumanizePanel";
import { listAllTells } from "@/shared/ai_tells";

const mocks = vi.hoisted(() => ({
  streamMessage: vi.fn(),
  selectChat: vi.fn(),
  setIsChatPanelHidden: vi.fn(),
  invalidateQueries: vi.fn(),
  createChat: vi.fn(),
  showError: vi.fn(),
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

vi.mock("@/ipc/types", () => ({
  ipc: { chat: { createChat: mocks.createChat } },
}));

vi.mock("@/lib/toast", () => ({ showError: mocks.showError }));

describe("HumanizePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createChat.mockResolvedValue(42);
    mocks.streamMessage.mockResolvedValue(undefined);
  });

  it("starts a review in a new chat", async () => {
    render(<HumanizePanel />);

    fireEvent.click(screen.getByTestId("humanize-run-review"));

    await waitFor(() => {
      expect(mocks.createChat).toHaveBeenCalledWith(1);
    });

    expect(mocks.streamMessage).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "/humanize", chatId: 42, appId: 1 }),
    );
    // The findings land in the chat, so the review is useless behind a hidden
    // chat panel.
    expect(mocks.setIsChatPanelHidden).toHaveBeenCalledWith(false);
    expect(mocks.selectChat).toHaveBeenCalledWith({ chatId: 42, appId: 1 });
  });

  // The panel is where someone learns what the review can say, so a pattern
  // that can appear in a finding must be listed here. Reading the list from
  // the shared taxonomy is what keeps the two from drifting apart.
  it("lists every pattern a finding can report", () => {
    render(<HumanizePanel />);

    const tells = listAllTells();
    expect(tells.length).toBeGreaterThan(12);

    for (const tell of tells) {
      expect(screen.getByText(tell.title)).toBeTruthy();
    }
  });

  it("names the patterns in plain language, never as slugs", () => {
    render(<HumanizePanel />);

    for (const tell of listAllTells()) {
      expect(screen.queryByText(tell.id)).toBeNull();
    }
  });

  it("surfaces a failure instead of leaving the button spinning", async () => {
    mocks.createChat.mockRejectedValue(new Error("no app"));
    render(<HumanizePanel />);

    fireEvent.click(screen.getByTestId("humanize-run-review"));

    await waitFor(() => {
      expect(mocks.showError).toHaveBeenCalled();
    });
    expect(screen.getByTestId("humanize-run-review")).not.toHaveProperty(
      "disabled",
      true,
    );
  });
});
