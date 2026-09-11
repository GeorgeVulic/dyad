import { atom } from "jotai";

export const selectedAppIdAtom = atom<number | null>(null);
export type PreviewMode =
  | "preview"
  | "code"
  | "problems"
  | "configure"
  | "publish"
  | "security"
  | "humanize"
  | "tests"
  | "plan";

export const previewModeAtom = atom<PreviewMode>("preview");
