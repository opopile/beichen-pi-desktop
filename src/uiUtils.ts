export function tokenSegmentWidth(value: number, total: number, minimumVisiblePercent = 1.2) {
  if (!Number.isFinite(value) || !Number.isFinite(total) || value <= 0 || total <= 0) return 0;
  return Math.max(minimumVisiblePercent, (value / total) * 100);
}

export function accumulateReportedTokens(current: number, next: number) {
  const safeCurrent = Number.isFinite(current) && current > 0 ? current : 0;
  const safeNext = Number.isFinite(next) && next > 0 ? next : 0;
  return safeCurrent + safeNext;
}

export function workspaceLabel(cwd: string) {
  if (!cwd) return "—";
  const withoutTrailingSeparators = cwd.replace(/[\\/]+$/, "");
  return withoutTrailingSeparators.split(/[\\/]/).filter(Boolean).at(-1) || cwd;
}

export function shouldSubmitComposer(input: {
  key: string;
  shiftKey: boolean;
  isComposing?: boolean;
  keyCode?: number;
}) {
  return input.key === "Enter" && !input.shiftKey && !input.isComposing && input.keyCode !== 229;
}

export function shouldResetBackendBeforeNewSession(input: {
  routeTier?: string;
  restorePending: boolean;
  isStreaming: boolean;
}) {
  return input.routeTier !== "full" || input.restorePending || input.isStreaming;
}

export function isTerminalBackendStatus(state: string) {
  return state === "stopped" || state === "error";
}

export function surfaceSwitchRestartPatch(surface: "chatgpt" | "codex") {
  return { surface, routeTier: "full" as const };
}

export function extensionDialogInitialValue(dialog: { value?: unknown; prefill?: unknown }) {
  return String(dialog.value ?? dialog.prefill ?? "");
}

export function isSilentProfileActive(surface: "chatgpt" | "codex", silent: boolean) {
  return surface === "codex" && silent;
}

export function shouldRestoreFullRouteBeforePrompt(input: {
  routeTier?: string;
  restorePending: boolean;
  isStreaming: boolean;
}) {
  return !input.isStreaming && (input.routeTier !== "full" || input.restorePending);
}

export function isNearScrollBottom(input: {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
}, threshold = 96) {
  return input.scrollHeight - input.scrollTop - input.clientHeight <= threshold;
}

export interface CustomApiPreset {
  presetId: string;
  name: string;
  api: "openai-completions";
  baseUrl: string;
  modelId: string;
  modelName: string;
}

export const CUSTOM_API_PRESETS: readonly CustomApiPreset[] = [
  {
    presetId: "baimeow-kimi-k3-max",
    name: "Baimeow 中转",
    api: "openai-completions",
    baseUrl: "https://api.baimeow.icu/v1",
    modelId: "kimi-k3-max",
    modelName: "Kimi K3 Max",
  },
];

export function remainingCustomApiPresets(
  presets: readonly CustomApiPreset[],
  entries: ReadonlyArray<{ baseUrl: string; modelId: string }>,
) {
  return presets.filter(
    (preset) => !entries.some((entry) => entry.baseUrl === preset.baseUrl && entry.modelId === preset.modelId),
  );
}
