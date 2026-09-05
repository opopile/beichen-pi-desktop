import assert from "node:assert/strict";
import test from "node:test";

import {
  accumulateReportedTokens,
  extensionDialogInitialValue,
  isNearScrollBottom,
  isSilentProfileActive,
  isTerminalBackendStatus,
  shouldResetBackendBeforeNewSession,
  shouldRestoreFullRouteBeforePrompt,
  shouldSubmitComposer,
  surfaceSwitchRestartPatch,
  tokenSegmentWidth,
  workspaceLabel,
} from "../src/uiUtils.ts";

test("reported output tokens accumulate across a multi-tool agent run", () => {
  assert.equal(accumulateReportedTokens(0, 12), 12);
  assert.equal(accumulateReportedTokens(12, 8), 20);
  assert.equal(accumulateReportedTokens(20, Number.NaN), 20);
});

test("zero token categories render no fake segment", () => {
  assert.equal(tokenSegmentWidth(0, 100), 0);
  assert.equal(tokenSegmentWidth(-2, 100), 0);
  assert.equal(tokenSegmentWidth(1, 1000), 1.2);
  assert.equal(tokenSegmentWidth(50, 100), 50);
});

test("workspace labels handle Windows, UNC, and root paths", () => {
  assert.equal(workspaceLabel("C:\\"), "C:");
  assert.equal(workspaceLabel("C:\\Work\\Pi\\"), "Pi");
  assert.equal(workspaceLabel("\\\\server\\share\\"), "share");
  assert.equal(workspaceLabel("/"), "/");
});

test("composer Enter respects IME composition and Shift+Enter", () => {
  assert.equal(shouldSubmitComposer({ key: "Enter", shiftKey: false }), true);
  assert.equal(shouldSubmitComposer({ key: "Enter", shiftKey: true }), false);
  assert.equal(shouldSubmitComposer({ key: "Enter", shiftKey: false, isComposing: true }), false);
  assert.equal(shouldSubmitComposer({ key: "Enter", shiftKey: false, keyCode: 229 }), false);
});

test("new sessions recover a light or interrupted backend before clearing history", () => {
  assert.equal(shouldResetBackendBeforeNewSession({ routeTier: "full", restorePending: false, isStreaming: false }), false);
  assert.equal(shouldResetBackendBeforeNewSession({ routeTier: "light", restorePending: false, isStreaming: false }), true);
  assert.equal(shouldResetBackendBeforeNewSession({ routeTier: "full", restorePending: true, isStreaming: false }), true);
  assert.equal(shouldResetBackendBeforeNewSession({ routeTier: "full", restorePending: false, isStreaming: true }), true);
});

test("only terminal backend states end an interrupted frontend run", () => {
  assert.equal(isTerminalBackendStatus("stopped"), true);
  assert.equal(isTerminalBackendStatus("error"), true);
  assert.equal(isTerminalBackendStatus("starting"), false);
  assert.equal(isTerminalBackendStatus("ready"), false);
});

test("surface switches preserve the selected performance profile", () => {
  assert.deepEqual(surfaceSwitchRestartPatch("chatgpt"), { surface: "chatgpt", routeTier: "full" });
  assert.deepEqual(surfaceSwitchRestartPatch("codex"), { surface: "codex", routeTier: "full" });
  assert.equal("profile" in surfaceSwitchRestartPatch("chatgpt"), false);
  assert.equal(isSilentProfileActive("chatgpt", true), false);
  assert.equal(isSilentProfileActive("codex", true), true);
});

test("extension editors use Pi's prefill while preserving an explicit value", () => {
  assert.equal(extensionDialogInitialValue({ prefill: "from Pi" }), "from Pi");
  assert.equal(extensionDialogInitialValue({ value: "", prefill: "fallback" }), "");
  assert.equal(extensionDialogInitialValue({ value: 42 }), "42");
});

test("an idle prompt cannot continue on a light route that still needs recovery", () => {
  assert.equal(shouldRestoreFullRouteBeforePrompt({ routeTier: "full", restorePending: false, isStreaming: false }), false);
  assert.equal(shouldRestoreFullRouteBeforePrompt({ routeTier: "light", restorePending: false, isStreaming: false }), true);
  assert.equal(shouldRestoreFullRouteBeforePrompt({ routeTier: "full", restorePending: true, isStreaming: false }), true);
  assert.equal(shouldRestoreFullRouteBeforePrompt({ routeTier: "light", restorePending: true, isStreaming: true }), false);
});

test("autoscroll follows output only while the viewport remains near the bottom", () => {
  assert.equal(isNearScrollBottom({ scrollHeight: 1000, scrollTop: 400, clientHeight: 400 }), false);
  assert.equal(isNearScrollBottom({ scrollHeight: 1000, scrollTop: 520, clientHeight: 400 }), true);
});

test("custom API presets hide once an entry with the same endpoint and model exists", async () => {
  const { CUSTOM_API_PRESETS, remainingCustomApiPresets } = await import("../src/uiUtils.ts");
  const [preset] = CUSTOM_API_PRESETS;
  assert.deepEqual(remainingCustomApiPresets(CUSTOM_API_PRESETS, []), CUSTOM_API_PRESETS);
  assert.deepEqual(
    remainingCustomApiPresets(CUSTOM_API_PRESETS, [{ baseUrl: "https://other.example/v1", modelId: "x" }]),
    CUSTOM_API_PRESETS,
  );
  assert.deepEqual(
    remainingCustomApiPresets(CUSTOM_API_PRESETS, [
      { baseUrl: "https://other.example/v1", modelId: "x" },
      { baseUrl: preset.baseUrl, modelId: preset.modelId },
    ]),
    [],
  );
});
