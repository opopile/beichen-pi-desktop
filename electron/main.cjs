"use strict";

const { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } = require("electron");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { PROFILES, buildSystemPrompt, getProfile } = require("./prompts.cjs");
const {
  CUSTOM_PROVIDER_PREFIX,
  envNameForProvider,
  mergeManagedProviders,
  normalizeCustomApiInput,
} = require("./custom-api.cjs");
const { isPathInside, pathsEqual } = require("./runtime-utils.cjs");
const { isSameDocumentNavigation, safeExternalUrl } = require("./security.cjs");

app.commandLine.appendSwitch("disable-background-timer-throttling");
app.setAppUserModelId("com.beichen.pi");

for (const stream of [process.stdout, process.stderr]) {
  stream?.on?.("error", (error) => {
    if (error?.code !== "EPIPE") {
      try {
        fs.appendFileSync(path.join(os.tmpdir(), "beichen-pi-stream-error.log"), `${error?.stack || error}\n`);
      } catch {
        // Avoid surfacing a secondary diagnostics failure.
      }
    }
  });
}

const ROOT_DIR = path.resolve(__dirname, "..");
const ICON_PATH = path.join(ROOT_DIR, "output", "北辰标志_极简漩涡聚焦版_v10.png");
const PI_AGENT_DIR = process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), ".pi", "agent");
const windows = new Map();
const pendingAuthPrompts = new Map();
const pendingBackendStops = new Set();
let modelRuntimePromise;
let appShutdownStarted = false;
const activeCustomApiEnvNames = new Set();
const SECURITY_NOTICE_VERSION = 1;

function openExternalSafely(rawUrl, sender) {
  const url = safeExternalUrl(rawUrl);
  if (!url) return false;
  void shell.openExternal(url).catch((error) => {
    if (sender && !sender.isDestroyed()) {
      sender.send("auth:event", {
        event: { type: "info", message: `无法打开外部链接：${error instanceof Error ? error.message : String(error)}` },
      });
    }
  });
  return true;
}

function rejectAuthPromptsForSender(senderId, reason = "窗口已关闭") {
  for (const [id, pending] of pendingAuthPrompts.entries()) {
    if (pending.senderId !== senderId) continue;
    pendingAuthPrompts.delete(id);
    pending.reject(new Error(reason));
  }
}

function trackBackendStop(record) {
  const pending = Promise.resolve().then(async () => {
    const restart = record.backendRestartPromise;
    if (record.backend) await record.backend.stop();
    if (restart) {
      try {
        await restart;
      } catch {
        // A failed restart still leaves the record ready for authoritative stop.
      }
    }
    if (record.backend) await record.backend.stop();
  });
  pendingBackendStops.add(pending);
  pending.then(
    () => pendingBackendStops.delete(pending),
    () => pendingBackendStops.delete(pending),
  );
  return pending;
}

function unpackedPath(inputPath) {
  if (!app.isPackaged) return inputPath;
  return inputPath.replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`);
}

function appSettingsPath() {
  return path.join(app.getPath("userData"), "beichen-settings.json");
}

function readJson(filePath, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeAppSettings(updater) {
  const filePath = appSettingsPath();
  const current = readJson(filePath, {});
  const next = typeof updater === "function" ? updater(current) : updater;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  return next;
}

function customApiEntries(settings = readJson(appSettingsPath(), {})) {
  return Array.isArray(settings.customApis)
    ? settings.customApis.filter((entry) => entry && typeof entry.providerId === "string" && entry.providerId.startsWith(CUSTOM_PROVIDER_PREFIX))
    : [];
}

function publicCustomApi(entry) {
  return {
    providerId: entry.providerId,
    name: entry.name,
    baseUrl: entry.baseUrl,
    api: entry.api,
    modelId: entry.modelId,
    modelName: entry.modelName,
    contextWindow: entry.contextWindow,
    maxTokens: entry.maxTokens,
    reasoning: Boolean(entry.reasoning),
    imageInput: Boolean(entry.imageInput),
    extendedThinking: Boolean(entry.extendedThinking),
    thinkingFormat: entry.thinkingFormat || "auto",
    supportsDeveloperRole: Boolean(entry.supportsDeveloperRole),
    authHeader: Boolean(entry.authHeader),
    useApiKey: entry.useApiKey !== false,
    hasApiKey: Boolean(entry.encryptedApiKey),
    updatedAt: entry.updatedAt,
  };
}

function encryptCustomApiKey(value) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Windows 系统加密当前不可用，无法安全保存 API Key");
  }
  return safeStorage.encryptString(value).toString("base64");
}

function decryptCustomApiKey(entry) {
  if (entry.useApiKey === false) return "beichen-local";
  if (!entry.encryptedApiKey || !safeStorage.isEncryptionAvailable()) return "";
  try {
    return safeStorage.decryptString(Buffer.from(entry.encryptedApiKey, "base64"));
  } catch {
    return "";
  }
}

function readModelsConfig() {
  const filePath = path.join(PI_AGENT_DIR, "models.json");
  if (!fs.existsSync(filePath)) return {};
  try {
    const value = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("root must be an object");
    return value;
  } catch (error) {
    throw new Error(`Pi models.json 无法解析，已停止写入以保护原配置：${error instanceof Error ? error.message : String(error)}`);
  }
}

function syncCustomModelsFile(settings = readJson(appSettingsPath(), {})) {
  const entries = customApiEntries(settings);
  const managedProviderIds = Array.isArray(settings.managedCustomProviderIds) ? settings.managedCustomProviderIds : [];
  const filePath = path.join(PI_AGENT_DIR, "models.json");
  if (!entries.length && !managedProviderIds.length && !fs.existsSync(filePath)) return entries;
  const next = mergeManagedProviders(readModelsConfig(), entries, managedProviderIds);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  return entries;
}

function applyCustomApiEnvironment(settings = readJson(appSettingsPath(), {})) {
  for (const envName of activeCustomApiEnvNames) delete process.env[envName];
  activeCustomApiEnvNames.clear();
  for (const entry of customApiEntries(settings)) {
    const envName = envNameForProvider(entry.providerId);
    const key = decryptCustomApiKey(entry);
    if (!key) continue;
    process.env[envName] = key;
    activeCustomApiEnvNames.add(envName);
  }
}

function getPiDefaults() {
  const piSettings = readJson(path.join(PI_AGENT_DIR, "settings.json"), {});
  return {
    provider: typeof piSettings.defaultProvider === "string" ? piSettings.defaultProvider : "google",
    modelId: typeof piSettings.defaultModel === "string" ? piSettings.defaultModel : undefined,
  };
}

function visibleProfileId(profileId) {
  const profile = getProfile(profileId);
  return profile.hidden ? "codex" : profile.id;
}

function resolvePiCli() {
  if (app.isPackaged) {
    return path.join(
      process.resourcesPath,
      "app.asar.unpacked",
      "node_modules",
      "@earendil-works",
      "pi-coding-agent",
      "dist",
      "bundle",
      "cli.js",
    );
  }
  return path.join(ROOT_DIR, "node_modules", "@earendil-works", "pi-coding-agent", "dist", "bundle", "cli.js");
}

function resolveContextExtension() {
  return unpackedPath(path.join(ROOT_DIR, "resources", "pi-extensions", "context-modes.ts"));
}

function resolveNodeRuntime() {
  return app.isPackaged ? path.join(process.resourcesPath, "runtime", "node.exe") : process.execPath;
}

function getModelRuntime() {
  if (!modelRuntimePromise) {
    applyCustomApiEnvironment();
    modelRuntimePromise = import("@earendil-works/pi-coding-agent").then(({ ModelRuntime }) =>
      ModelRuntime.create({ allowModelNetwork: false }),
    );
  }
  return modelRuntimePromise;
}

class PiBackend {
  constructor(ownerWindow, config) {
    this.ownerWindow = ownerWindow;
    this.config = config;
    this.child = null;
    this.stdoutBuffer = "";
    this.stderrTail = [];
    this.pending = new Map();
    this.sequence = 0;
    this.readySignalSent = false;
    this.stopPromise = null;
  }

  emit(channel, payload) {
    if (!this.ownerWindow.isDestroyed()) {
      this.ownerWindow.webContents.send(channel, payload);
    }
  }

  buildArgs() {
    const profile = getProfile(this.config.profile);
    const lightRoute = this.config.routeTier === "light";
    const args = ["--mode", "rpc", "--approve"];

    if (this.config.provider) args.push("--provider", this.config.provider);
    if (this.config.modelId) args.push("--model", this.config.modelId);
    args.push("--thinking", this.config.thinkingLevel || profile.recommendedThinking);
    if (this.config.sessionPath) args.push("--session", this.config.sessionPath);

    args.push("--system-prompt", buildSystemPrompt(this.config.surface, this.config.profile, this.config.routeTier));

    if (lightRoute) {
      args.push("--no-tools", "--no-skills", "--no-extensions", "--no-prompt-templates", "--no-context-files");
    } else if (this.config.surface === "chatgpt") {
      args.push("--no-tools");
    } else {
      args.push("--tools", "read,powershell,edit,write,grep,find,ls");
      args.push("--extension", resolveContextExtension());
    }

    return args;
  }

  start() {
    if (this.child) return;
    if (this.stopPromise) throw new Error("Pi 引擎正在停止");

    // A PiBackend instance can be reused after an unexpected process exit.  All
    // process-scoped state must therefore be reset before every spawn.
    this.readySignalSent = false;
    this.stdoutBuffer = "";
    this.stderrTail = [];
    applyCustomApiEnvironment();
    const cliPath = resolvePiCli();
    const profile = getProfile(this.config.profile);
    const env = {
      ...process.env,
      BEICHEN_CONTEXT_MODE: profile.contextMode,
      FORCE_COLOR: "0",
    };
    if (!app.isPackaged) env.ELECTRON_RUN_AS_NODE = "1";

    this.emit("backend:status", { state: "starting", message: "正在启动 Pi 引擎" });
    let child;
    try {
      child = spawn(resolveNodeRuntime(), [cliPath, ...this.buildArgs()], {
        cwd: this.config.cwd,
        env,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (error) {
      this.emit("backend:status", {
        state: "error",
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
    this.child = child;

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk) => {
      if (this.child === child) this.consumeStdout(chunk);
    });
    child.stderr.on("data", (chunk) => {
      if (this.child !== child) return;
      const lines = String(chunk)
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      this.stderrTail.push(...lines);
      this.stderrTail = this.stderrTail.slice(-24);
    });

    let finalized = false;
    const handleProcessError = (error) => {
      if (finalized || this.child !== child) return;
      finalized = true;
      this.child = null;
      this.emit("backend:status", { state: "error", message: error.message });
      this.rejectPending(error);
      if (child.exitCode === null && child.signalCode === null) {
        try {
          child.kill("SIGKILL");
        } catch {
          // The process may have already exited after closing its input pipe.
        }
      }
    };

    // Without an error listener, an EPIPE from a crashed child can terminate the
    // Electron main process before the child-process exit event is delivered.
    child.stdin.on("error", handleProcessError);
    child.once("error", handleProcessError);

    child.once("exit", (code, signal) => {
      if (finalized) return;
      finalized = true;
      const active = this.child === child;
      const details = this.stderrTail.at(-1) || `Pi 已退出（${code ?? signal ?? "unknown"}）`;
      if (!active) return;
      this.child = null;
      this.emit("backend:status", { state: "stopped", message: details });
      this.rejectPending(new Error(details));
    });
  }

  consumeStdout(chunk) {
    this.stdoutBuffer += chunk;
    let newlineIndex;
    while ((newlineIndex = this.stdoutBuffer.indexOf("\n")) >= 0) {
      const raw = this.stdoutBuffer.slice(0, newlineIndex).replace(/\r$/, "");
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);
      if (!raw.trim()) continue;

      let message;
      try {
        message = JSON.parse(raw);
      } catch {
        this.stderrTail.push(`无法解析 Pi 输出：${raw.slice(0, 180)}`);
        continue;
      }

      if (!this.readySignalSent) {
        this.readySignalSent = true;
        this.emit("backend:status", { state: "ready", message: "Pi 引擎已就绪" });
      }

      if (message.type === "response" && message.id && this.pending.has(message.id)) {
        const pending = this.pending.get(message.id);
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.success) pending.resolve(message.data ?? null);
        else pending.reject(new Error(message.error || `${message.command || "command"} failed`));
        continue;
      }

      this.emit("pi:event", message);
    }
  }

  command(payload, timeoutMs) {
    this.start();
    const child = this.child;
    const id = payload.id || `desktop-${Date.now()}-${++this.sequence}`;
    const command = { ...payload, id };
    const effectiveTimeout =
      timeoutMs || (payload.type === "compact" || payload.type === "export_html" ? 10 * 60_000 : 120_000);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${payload.type} 超时`));
      }, effectiveTimeout);
      this.pending.set(id, { resolve, reject, timer });

      try {
        child.stdin.write(`${JSON.stringify(command)}\n`, (error) => {
          if (!error || !this.pending.has(id)) return;
          clearTimeout(timer);
          this.pending.delete(id);
          reject(error);
        });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  raw(payload) {
    this.start();
    const child = this.child;
    return new Promise((resolve, reject) => {
      try {
        child.stdin.write(`${JSON.stringify(payload)}\n`, (error) => {
          if (error) reject(error);
          else resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  rejectPending(error) {
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer);
      reject(error);
    }
    this.pending.clear();
  }

  async stop() {
    if (this.stopPromise) return this.stopPromise;
    if (!this.child) return;
    const child = this.child;
    this.child = null;
    this.rejectPending(new Error("Pi 引擎正在重启"));

    const stopPromise = new Promise((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null) {
        resolve();
        return;
      }

      let timer;
      const finish = () => {
        clearTimeout(timer);
        child.removeListener("exit", finish);
        child.removeListener("close", finish);
        resolve();
      };
      child.once("exit", finish);
      // A process that failed to spawn emits "error" and then "close", but no
      // "exit". Listening for both covers that terminal state without resolving
      // merely because kill() was requested.
      child.once("close", finish);

      timer = setTimeout(() => {
        if (child.exitCode !== null || child.signalCode !== null) {
          finish();
          return;
        }
        try {
          child.kill("SIGKILL");
        } catch {
          // Process already closed.
        }
      }, 1500);

      try {
        child.stdin.end();
      } catch {
        // Process already closed.
      }
    });

    this.stopPromise = stopPromise;
    try {
      await stopPromise;
    } finally {
      if (this.stopPromise === stopPromise) this.stopPromise = null;
    }
  }
}

function createInitialConfig(overrides = {}) {
  const appSettings = readJson(appSettingsPath(), {});
  const piDefaults = getPiDefaults();
  const stored = appSettings.defaults || {};
  // createInitialConfig is only called from createWindow after app.whenReady(),
  // so Electron's platform-aware Documents path is available here.
  const documentsCwd = app.getPath("documents");
  const requestedCwd = overrides.cwd || stored.cwd || documentsCwd;
  let cwd = documentsCwd;
  if (typeof requestedCwd === "string" && requestedCwd.trim()) {
    try {
      if (fs.statSync(requestedCwd).isDirectory()) cwd = requestedCwd;
    } catch {
      // Missing or inaccessible saved workspaces fall back to Documents.
    }
  }
  const profile = visibleProfileId(overrides.profile || stored.profile || "codex");

  return {
    cwd,
    surface: overrides.surface || stored.surface || "codex",
    profile,
    routeTier: overrides.routeTier || "full",
    provider: overrides.provider || stored.provider || piDefaults.provider,
    modelId: overrides.modelId || stored.modelId || piDefaults.modelId,
    thinkingLevel: overrides.thinkingLevel || stored.thinkingLevel || getProfile(profile).recommendedThinking,
    sessionPath: overrides.sessionPath,
  };
}

function createWindow(overrides = {}) {
  const config = createInitialConfig(overrides);
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 980,
    minHeight: 660,
    frame: false,
    backgroundColor: "#050505",
    title: "北辰 Pi",
    icon: ICON_PATH,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const webContentsId = win.webContents.id;
  const record = { window: win, config, backend: null, backendRestartPromise: null, closed: false };
  windows.set(webContentsId, record);

  const allowedRendererPermissions = new Set(["clipboard-sanitized-write"]);
  win.webContents.session.setPermissionCheckHandler((_webContents, permission) =>
    allowedRendererPermissions.has(permission));
  win.webContents.session.setPermissionRequestHandler((_webContents, permission, callback) =>
    callback(allowedRendererPermissions.has(permission)));

  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafely(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    const currentUrl = win.webContents.getURL();
    if (currentUrl && isSameDocumentNavigation(currentUrl, url)) return;
    event.preventDefault();
    openExternalSafely(url);
  });

  win.once("ready-to-show", () => win.show());
  win.on("closed", () => {
    rejectAuthPromptsForSender(webContentsId);
    const current = windows.get(webContentsId);
    if (current) current.closed = true;
    if (current?.backend || current?.backendRestartPromise) void trackBackendStop(current);
    windows.delete(webContentsId);
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(ROOT_DIR, "dist", "index.html"));
  }

  const captureArg = process.argv.find((arg) => arg.startsWith("--capture-ui="));
  const smokeArg = process.argv.find((arg) => arg.startsWith("--smoke-output="));
  const controlsSmokeArg = process.argv.find((arg) => arg.startsWith("--smoke-controls-output="));
  const customApiSmokeArg = process.argv.find((arg) => arg.startsWith("--smoke-custom-api-output="));
  const fixesSmokeArg = process.argv.find((arg) => arg.startsWith("--smoke-fixes-output="));
  const contextBenchmarkArg = process.argv.find((arg) => arg.startsWith("--benchmark-context-output="));
  const liveThinkingSmokeArg = process.argv.find((arg) => arg.startsWith("--smoke-live-thinking-output="));
  if (liveThinkingSmokeArg) {
    const liveThinkingOutputPath = liveThinkingSmokeArg.slice("--smoke-live-thinking-output=".length);
    win.webContents.once("did-finish-load", () => {
      setTimeout(async () => {
        const settingsFile = appSettingsPath();
        const settingsExisted = fs.existsSync(settingsFile);
        const settingsSnapshot = settingsExisted ? fs.readFileSync(settingsFile) : null;
        const original = { ...record.config };
        const report = { success: false, profile: "ghost" };
        let sessionFile;
        try {
          await restartBackend(record, {
            cwd: original.cwd,
            surface: "codex",
            profile: "ghost",
            routeTier: "full",
            provider: original.provider,
            modelId: original.modelId,
            thinkingLevel: "max",
            sessionPath: undefined,
          });
          const backend = ensureBackend(record);
          await backend.command({
            type: "prompt",
            message: "这是实时 thinking 界面验证，不要调用任何工具。请在内部详细比较四种分布式一致性协议在双区域故障、网络分区、写入延迟和恢复复杂度方面的差异，完成充分推理后最终只输出一行推荐。",
          });
          const deadline = Date.now() + 3 * 60_000;
          let observation;
          while (Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, 350));
            observation = await win.webContents.executeJavaScript(`(() => {
              const panel = document.querySelector('.thinking-only-message.live .thinking-content');
              const liveBadge = document.querySelector('.thinking-only-message.live .reasoning-live-badge');
              return {
                thinkingChars: panel?.innerText?.length || 0,
                liveBadge: liveBadge?.textContent?.trim() || '',
                thinkingOnly: Boolean(document.querySelector('.thinking-only-message.live')),
                toolTimelineVisible: Boolean(document.querySelector('.tool-timeline')),
              };
            })()`);
            if (observation?.thinkingChars >= 120 && observation?.liveBadge) break;
            const state = await backend.command({ type: "get_state" });
            if (!state?.isStreaming) break;
          }
          const image = await win.webContents.capturePage();
          fs.mkdirSync(path.dirname(liveThinkingOutputPath), { recursive: true });
          fs.writeFileSync(liveThinkingOutputPath, image.toPNG());
          const stateDuringCapture = await backend.command({ type: "get_state" });
          report.observation = observation;
          report.stateDuringCapture = { isStreaming: stateDuringCapture?.isStreaming, thinkingLevel: stateDuringCapture?.thinkingLevel };
          report.success = Boolean(
            observation?.thinkingChars >= 120 &&
            observation?.liveBadge &&
            observation?.thinkingOnly &&
            !observation?.toolTimelineVisible &&
            stateDuringCapture?.isStreaming
          );
          if (stateDuringCapture?.isStreaming) await backend.command({ type: "abort" });
          const settleDeadline = Date.now() + 30_000;
          while (Date.now() < settleDeadline) {
            const state = await backend.command({ type: "get_state" });
            if (!state?.isStreaming) {
              sessionFile = state?.sessionFile;
              break;
            }
            await new Promise((resolve) => setTimeout(resolve, 250));
          }
        } catch (error) {
          report.error = error instanceof Error ? error.message : String(error);
        } finally {
          if (record.backend) {
            await record.backend.stop();
            record.backend = null;
          }
          if (sessionFile) {
            const sessionsRoot = path.join(PI_AGENT_DIR, "sessions");
            const safe = isPathInside(sessionsRoot, sessionFile);
            try {
              if (safe && fs.existsSync(sessionFile)) fs.unlinkSync(sessionFile);
              report.sessionCleanup = { safe, removed: safe && !fs.existsSync(sessionFile) };
              if (!report.sessionCleanup.removed) report.success = false;
            } catch (error) {
              report.sessionCleanup = { safe, removed: false, error: error instanceof Error ? error.message : String(error) };
              report.success = false;
            }
          } else {
            report.sessionCleanup = { safe: false, removed: false, error: "Session file was unavailable after live capture" };
            report.success = false;
          }
          try {
            if (settingsExisted && settingsSnapshot) fs.writeFileSync(settingsFile, settingsSnapshot);
            else if (fs.existsSync(settingsFile)) fs.unlinkSync(settingsFile);
            report.settingsRestored = true;
          } catch (error) {
            report.settingsRestored = false;
            report.settingsRestoreError = error instanceof Error ? error.message : String(error);
            report.success = false;
          }
          fs.writeFileSync(`${liveThinkingOutputPath}.json`, `${JSON.stringify(report, null, 2)}\n`, "utf8");
          app.exit(report.success ? 0 : 1);
        }
      }, 1800);
    });
  } else if (contextBenchmarkArg) {
    const benchmarkOutputPath = contextBenchmarkArg.slice("--benchmark-context-output=".length);
    win.webContents.once("did-finish-load", () => {
      setTimeout(async () => {
        const settingsFile = appSettingsPath();
        const settingsExisted = fs.existsSync(settingsFile);
        const settingsSnapshot = settingsExisted ? fs.readFileSync(settingsFile) : null;
        const original = { ...record.config };
        const generatedSessionFiles = [];
        const report = {
          success: false,
          model: { provider: original.provider, id: original.modelId },
          requestedThinkingLevel: "max",
          modes: [],
        };
        const requestedProfilesArg = process.argv.find((arg) => arg.startsWith("--benchmark-context-profiles="));
        const allowedProfiles = ["codex", "ultra", "quantum", "ghost"];
        const requestedProfiles = requestedProfilesArg
          ?.slice("--benchmark-context-profiles=".length)
          .split(",")
          .map((profile) => profile.trim())
          .filter((profile) => allowedProfiles.includes(profile));
        const profiles = requestedProfiles?.length ? [...new Set(requestedProfiles)] : allowedProfiles;
        const prompts = [
          `这是上下文占用基准的第 1 轮，禁止调用任何工具或读取文件。请在内部充分推理：为六个服务 A-F 设计两区域部署。约束：A 与 B 不得同区；C 必须与 A 同区；D 依赖 B 和 C；E 只能在区域二但故障时要由区域一接管；F 必须靠近 D；区域一容量 11，区域二容量 10；A-F 容量分别为 3、4、2、3、2、3；跨区依赖每条成本 5，同区成本 1；还要满足任一区域故障后核心链 A/C/D/F 中至少三个服务可在剩余区域以降级容量运行。比较可行方案并找出最低成本稳健方案。最终只输出一行：T1:<部署>|<成本>|<故障结论>。`,
          `这是同一基准的第 2 轮，禁止调用工具。沿用上一轮状态并充分推理：现在区域二容量下降 2，B 的容量需求增加 1，新增约束是 D 与 F 在正常状态必须同区，但故障恢复时允许拆分；迁移一个服务成本 4，跨区依赖成本仍为 5。判断应保留原方案、局部迁移还是重新布局，并验证两种单区故障。最终只输出一行：T2:<策略>|<迁移集合>|<新成本>|<是否满足>。`,
          `这是同一基准的第 3 轮，禁止调用工具。继续沿用前两轮结论并充分推理：加入三档流量低/中/高，概率 0.25/0.5/0.25；高流量时 A、B、D 各增加容量 1；每单位预留容量成本 2，故障时每个未恢复核心服务罚分 20。比较至少三个候选布局的期望成本、最坏情况和迁移代价，不能只看平均值。最终只输出一行：T3:<首选布局>|<期望成本>|<最坏成本>|<关键理由>。`,
          `这是同一基准的第 4 轮，禁止调用工具。基于前三轮完整状态做最终压力复核：区域一发生故障的概率调整为 0.08，区域二为 0.12，同时要求正常状态跨区依赖不超过两条、任一故障下核心链恢复时间不超过 8 分钟；A/C 恢复各 2 分钟，B/D/F 各 3 分钟，可并行两项。检查前一轮首选是否仍最优，必要时修正，并给出唯一最终方案。最终只输出一行：T4:<最终布局>|<正常跨区数>|<最坏恢复时间>|<总评>。`,
        ];

        const sumUsage = (messages) => messages
          .filter((message) => message?.role === "assistant" && message.usage)
          .reduce((totals, message) => {
            for (const key of ["input", "output", "reasoning", "cacheRead", "cacheWrite", "totalTokens"]) {
              totals[key] += Number(message.usage?.[key] || 0);
            }
            return totals;
          }, { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 });

        const runTurn = async (backend, prompt, turnNumber) => {
          const beforeMessages = await backend.command({ type: "get_messages" });
          const beforeCount = beforeMessages?.messages?.length || 0;
          await backend.command({ type: "prompt", message: prompt });
          const deadline = Date.now() + 5 * 60_000;
          let newMessages = [];
          let finalState;
          while (Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, 600));
            const [state, messageData] = await Promise.all([
              backend.command({ type: "get_state" }),
              backend.command({ type: "get_messages" }),
            ]);
            newMessages = (messageData?.messages || []).slice(beforeCount);
            finalState = state;
            if (!state?.isStreaming && newMessages.some((message) => message.role === "assistant")) break;
          }
          if (!newMessages.some((message) => message.role === "assistant")) {
            throw new Error(`第 ${turnNumber} 轮等待模型完成超时`);
          }
          const assistants = newMessages.filter((message) => message.role === "assistant");
          const failed = assistants.find((message) => message.stopReason === "error");
          if (failed) throw new Error(`第 ${turnNumber} 轮模型错误：${failed.errorMessage || "unknown"}`);
          const stats = await backend.command({ type: "get_session_stats" });
          const thinkingChars = assistants.reduce((sum, message) => sum + (
            Array.isArray(message.content)
              ? message.content.filter((block) => block.type === "thinking").reduce((blockSum, block) => blockSum + String(block.thinking || "").length, 0)
              : 0
          ), 0);
          const finalText = [...assistants].reverse().flatMap((message) =>
            Array.isArray(message.content)
              ? message.content.filter((block) => block.type === "text").map((block) => block.text || "")
              : [String(message.content || "")]
          ).find((text) => text.trim()) || "";
          const allAssistantText = assistants.flatMap((message) =>
            Array.isArray(message.content)
              ? message.content.filter((block) => block.type === "text").map((block) => String(block.text || ""))
              : [String(message.content || "")]
          ).join("\n");
          return {
            turn: turnNumber,
            context: stats?.contextUsage || null,
            usage: sumUsage(assistants),
            thinkingChars,
            assistantMessages: assistants.length,
            finalText: finalText.trim().slice(0, 300),
            internalMarkerLeak: /<\/?(?:reasoning_digest|reasoning_removed)(?:\s[^>]*)?>/i.test(allAssistantText),
            state: { sessionId: finalState?.sessionId, thinkingLevel: finalState?.thinkingLevel },
          };
        };

        try {
          for (const profile of profiles) {
            await restartBackend(record, {
              cwd: original.cwd,
              surface: "codex",
              profile,
              routeTier: "full",
              provider: original.provider,
              modelId: original.modelId,
              thinkingLevel: "max",
              sessionPath: undefined,
            });
            const backend = ensureBackend(record);
            const state = await backend.command({ type: "get_state" });
            const modeResult = {
              profile,
              model: state?.model ? { provider: state.model.provider, id: state.model.id } : null,
              effectiveThinkingLevel: state?.thinkingLevel,
              turns: [],
            };
            for (let index = 0; index < prompts.length; index += 1) {
              modeResult.turns.push(await runTurn(backend, prompts[index], index + 1));
            }
            const finalState = await backend.command({ type: "get_state" });
            const finalStats = await backend.command({ type: "get_session_stats" });
            modeResult.finalContext = finalStats?.contextUsage || null;
            modeResult.sessionTotals = finalStats?.tokens || null;
            report.modes.push(modeResult);
            if (finalState?.sessionFile) generatedSessionFiles.push(finalState.sessionFile);
            await backend.stop();
            record.backend = null;
          }
          report.success = report.modes.length === profiles.length && report.modes.every((mode) =>
            mode.turns.length === prompts.length && mode.turns.every((turn) => turn.context?.tokens != null && !turn.internalMarkerLeak));
        } catch (error) {
          report.error = error instanceof Error ? error.message : String(error);
        } finally {
          if (record.backend) {
            await record.backend.stop();
            record.backend = null;
          }
          const sessionsRoot = path.join(PI_AGENT_DIR, "sessions");
          report.sessionCleanup = generatedSessionFiles.map((sessionFile) => {
            const safe = isPathInside(sessionsRoot, sessionFile);
            try {
              if (safe && fs.existsSync(sessionFile)) fs.unlinkSync(sessionFile);
              return { file: path.basename(sessionFile), safe, removed: safe && !fs.existsSync(sessionFile) };
            } catch (error) {
              report.success = false;
              return { file: path.basename(sessionFile), safe, removed: false, error: error instanceof Error ? error.message : String(error) };
            }
          });
          if (report.sessionCleanup.length !== profiles.length || report.sessionCleanup.some((entry) => !entry.safe || !entry.removed)) {
            report.success = false;
          }
          try {
            if (settingsExisted && settingsSnapshot) {
              fs.writeFileSync(settingsFile, settingsSnapshot);
            } else if (fs.existsSync(settingsFile)) {
              fs.unlinkSync(settingsFile);
            }
            report.settingsRestored = true;
          } catch (error) {
            report.settingsRestored = false;
            report.settingsRestoreError = error instanceof Error ? error.message : String(error);
            report.success = false;
          }
          fs.mkdirSync(path.dirname(benchmarkOutputPath), { recursive: true });
          fs.writeFileSync(benchmarkOutputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
          app.exit(report.success ? 0 : 1);
        }
      }, 1800);
    });
  } else if (fixesSmokeArg) {
    const fixesOutputPath = fixesSmokeArg.slice("--smoke-fixes-output=".length);
    win.webContents.once("did-finish-load", () => {
      setTimeout(async () => {
        const originalOpenExternal = shell.openExternal;
        const openedExternalUrls = [];
        const report = { success: false };
        try {
          shell.openExternal = async (url) => {
            openedExternalUrls.push(url);
          };
          const windowsBefore = BrowserWindow.getAllWindows().length;
          await win.webContents.executeJavaScript(`
            for (const url of [
              "https://example.com/docs",
              "mailto:test@example.com",
              "file:///C:/Windows/System32/calc.exe",
              "javascript:globalThis.__unsafeLinkExecuted = true",
              "data:text/html,unsafe"
            ]) {
              const anchor = document.createElement("a");
              anchor.href = url;
              anchor.target = "_blank";
              anchor.rel = "noopener noreferrer";
              anchor.click();
            }
          `);
          await new Promise((resolve) => setTimeout(resolve, 250));
          const windowsAfter = BrowserWindow.getAllWindows().length;
          const unsafeExecuted = await win.webContents.executeJavaScript("Boolean(globalThis.__unsafeLinkExecuted)");

          let authPromptRejected = false;
          const authSmokeId = crypto.randomUUID();
          pendingAuthPrompts.set(authSmokeId, {
            senderId: webContentsId,
            resolve() {},
            reject() { authPromptRejected = true; },
          });
          rejectAuthPromptsForSender(webContentsId, "smoke cleanup");

          Object.assign(report, {
            success:
              windowsAfter === windowsBefore &&
              !unsafeExecuted &&
              openedExternalUrls.length === 2 &&
              openedExternalUrls.includes("https://example.com/docs") &&
              openedExternalUrls.includes("mailto:test@example.com") &&
              authPromptRejected &&
              !pendingAuthPrompts.has(authSmokeId),
            windowsBefore,
            windowsAfter,
            unsafeExecuted,
            openedExternalUrls,
            authPromptRejected,
            authPromptRemoved: !pendingAuthPrompts.has(authSmokeId),
          });
        } catch (error) {
          report.error = error instanceof Error ? error.message : String(error);
        } finally {
          shell.openExternal = originalOpenExternal;
          fs.mkdirSync(path.dirname(fixesOutputPath), { recursive: true });
          fs.writeFileSync(fixesOutputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
          if (record.backend) await record.backend.stop();
          app.exit(report.success ? 0 : 1);
        }
      }, 1200);
    });
  } else if (customApiSmokeArg) {
    const customApiOutputPath = customApiSmokeArg.slice("--smoke-custom-api-output=".length);
    const customApiBaseArg = process.argv.find((arg) => arg.startsWith("--smoke-custom-api-base="));
    const customApiPromptArg = process.argv.find((arg) => arg.startsWith("--smoke-custom-api-prompt="));
    const customApiExpectedArg = process.argv.find((arg) => arg.startsWith("--smoke-custom-api-expected="));
    win.webContents.once("did-finish-load", () => {
      setTimeout(async () => {
        const settingsFile = appSettingsPath();
        const modelsFile = path.join(PI_AGENT_DIR, "models.json");
        const settingsExisted = fs.existsSync(settingsFile);
        const modelsExisted = fs.existsSync(modelsFile);
        const settingsSnapshot = settingsExisted ? fs.readFileSync(settingsFile) : null;
        const modelsSnapshot = modelsExisted ? fs.readFileSync(modelsFile) : null;
        const secret = `beichen-smoke-${crypto.randomUUID()}`;
        const report = { success: false };
        try {
          const saved = await saveCustomApi(record, {
            name: "Beichen Custom API Smoke",
            baseUrl: customApiBaseArg?.slice("--smoke-custom-api-base=".length) || "http://127.0.0.1:65534/v1",
            api: "openai-completions",
            apiKey: secret,
            modelId: "beichen-smoke-model",
            modelName: "Beichen Smoke Model",
            contextWindow: 32768,
            maxTokens: 4096,
            reasoning: true,
            imageInput: false,
            extendedThinking: true,
            thinkingFormat: "openai",
            supportsDeveloperRole: false,
            authHeader: false,
            useApiKey: true,
          });
          const backend = ensureBackend(record);
          const [state, models] = await Promise.all([
            backend.command({ type: "get_state" }),
            backend.command({ type: "get_available_models" }),
          ]);
          const settingsText = fs.readFileSync(settingsFile, "utf8");
          const modelsText = fs.readFileSync(modelsFile, "utf8");
          const registered = (models?.models || []).some((model) =>
            model.provider === saved.providerId && model.id === saved.modelId);
          const encryptedAtRest = !settingsText.includes(secret) && settingsText.includes("encryptedApiKey");
          const modelsUseEnvironment = !modelsText.includes(secret) && modelsText.includes(envNameForProvider(saved.providerId));
          const publicShapeIsSafe = saved.customApis.every((entry) => !("apiKey" in entry) && !("encryptedApiKey" in entry));
          let promptVerified = true;
          let assistantText;
          if (customApiPromptArg) {
            const beforeMessages = await backend.command({ type: "get_messages" });
            const beforeAssistantCount = (beforeMessages?.messages || []).filter((message) => message.role === "assistant").length;
            await backend.command({ type: "prompt", message: customApiPromptArg.slice("--smoke-custom-api-prompt=".length) });
            const deadline = Date.now() + 45_000;
            while (Date.now() < deadline) {
              await new Promise((resolve) => setTimeout(resolve, 300));
              const [currentState, currentMessages] = await Promise.all([
                backend.command({ type: "get_state" }),
                backend.command({ type: "get_messages" }),
              ]);
              const assistants = (currentMessages?.messages || []).filter((message) => message.role === "assistant");
              if (!currentState?.isStreaming && assistants.length > beforeAssistantCount) {
                const lastAssistant = assistants.at(-1);
                assistantText = Array.isArray(lastAssistant?.content)
                  ? lastAssistant.content.filter((block) => block.type === "text").map((block) => block.text || "").join("")
                  : String(lastAssistant?.content || "");
                break;
              }
            }
            const expected = customApiExpectedArg?.slice("--smoke-custom-api-expected=".length);
            promptVerified = Boolean(assistantText) && (!expected || assistantText.includes(expected));
          }
          const deleted = await deleteCustomApi(record, saved.providerId);
          const removedFromPublicList = !deleted.customApis.some((entry) => entry.providerId === saved.providerId);
          Object.assign(report, {
            success:
              registered &&
              state?.model?.provider === saved.providerId &&
              state?.model?.id === saved.modelId &&
              encryptedAtRest &&
              modelsUseEnvironment &&
              publicShapeIsSafe &&
              promptVerified &&
              removedFromPublicList,
            providerId: saved.providerId,
            modelId: saved.modelId,
            registered,
            activeModel: state?.model ? { provider: state.model.provider, id: state.model.id } : null,
            encryptedAtRest,
            modelsUseEnvironment,
            publicShapeIsSafe,
            promptVerified,
            assistantText,
            removedFromPublicList,
          });
        } catch (error) {
          report.error = error instanceof Error ? error.message : String(error);
        } finally {
          if (record.backend) await record.backend.stop();
          try {
            if (settingsExisted && settingsSnapshot) {
              fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
              fs.writeFileSync(settingsFile, settingsSnapshot);
            } else if (fs.existsSync(settingsFile)) {
              fs.unlinkSync(settingsFile);
            }
            if (modelsExisted && modelsSnapshot) {
              fs.mkdirSync(path.dirname(modelsFile), { recursive: true });
              fs.writeFileSync(modelsFile, modelsSnapshot);
            } else if (fs.existsSync(modelsFile)) {
              fs.unlinkSync(modelsFile);
            }
            applyCustomApiEnvironment(readJson(settingsFile, {}));
            modelRuntimePromise = undefined;
            report.originalFilesRestored = true;
          } catch (restoreError) {
            report.originalFilesRestored = false;
            report.restoreError = restoreError instanceof Error ? restoreError.message : String(restoreError);
            report.success = false;
          }
          fs.mkdirSync(path.dirname(customApiOutputPath), { recursive: true });
          fs.writeFileSync(customApiOutputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
          app.exit(report.success ? 0 : 1);
        }
      }, 1800);
    });
  } else if (controlsSmokeArg) {
    const controlsOutputPath = controlsSmokeArg.slice("--smoke-controls-output=".length);
    win.webContents.once("did-finish-load", () => {
      setTimeout(async () => {
        const original = { ...record.config, routeTier: "full" };
        const report = { success: false };
        let generatedSessionDir;
        let generatedSessionFile;
        try {
          let backend = ensureBackend(record);
          let before = await backend.command({ type: "get_state" });
          if (!before?.sessionFile || !fs.existsSync(before.sessionFile)) {
            const sessionId = before?.sessionId || crypto.randomUUID();
            const sessionsRoot = path.join(PI_AGENT_DIR, "sessions");
            fs.mkdirSync(sessionsRoot, { recursive: true });
            if (before?.sessionFile && isPathInside(sessionsRoot, before.sessionFile)) {
              generatedSessionFile = before.sessionFile;
              fs.mkdirSync(path.dirname(generatedSessionFile), { recursive: true });
            } else {
              generatedSessionDir = fs.mkdtempSync(path.join(sessionsRoot, "beichen-pi-session-smoke-"));
              generatedSessionFile = path.join(generatedSessionDir, `${new Date().toISOString().replace(/[:.]/g, "-")}_${sessionId}.jsonl`);
            }
            fs.writeFileSync(generatedSessionFile, `${JSON.stringify({
              type: "session",
              version: 3,
              id: sessionId,
              timestamp: new Date().toISOString(),
              cwd: record.config.cwd,
            })}\n`, "utf8");
            await restartBackend(record, { sessionPath: generatedSessionFile, routeTier: "full" });
            backend = ensureBackend(record);
            before = await backend.command({ type: "get_state" });
          }
          const available = await backend.command({ type: "get_available_thinking_levels" });
          const levels = available?.levels || ["off"];
          const requested = ["low", "medium", "off", "high", "xhigh", "max", "minimal"]
            .find((level) => levels.includes(level) && level !== before?.thinkingLevel) || before?.thinkingLevel || "off";
          const modelSwitch = before?.model
            ? await setRuntimeModel(record, before.model.provider, before.model.id)
            : null;
          const thinkingSwitch = await setRuntimeThinking(record, requested);
          const afterDirectSwitch = await backend.command({ type: "get_state" });
          const sameCwdVariant = process.platform === "win32"
            ? record.config.cwd.replace(/^([a-zA-Z]):/, (_match, drive) => `${drive === drive.toLowerCase() ? drive.toUpperCase() : drive.toLowerCase()}:`)
            : path.join(record.config.cwd, ".");
          const sessionFileBeforeSameCwdRestart = (await backend.command({ type: "get_state" }))?.sessionFile;
          await restartBackend(record, { cwd: sameCwdVariant, routeTier: "full" });
          backend = ensureBackend(record);
          const afterSameCwdRestart = await backend.command({ type: "get_state" });
          const sameCwdSessionPreserved = Boolean(before?.sessionId) && afterSameCwdRestart?.sessionId === before.sessionId;
          const alternateProfile = record.config.profile === "quantum" ? "ghost" : "quantum";
          await restartBackend(record, { profile: alternateProfile, routeTier: "full" });
          backend = ensureBackend(record);
          const afterProfileSwitch = await backend.command({ type: "get_state" });
          await restartBackend(record, { routeTier: "light" });
          backend = ensureBackend(record);
          const afterLightRouteSwitch = await backend.command({ type: "get_state" });
          Object.assign(report, {
            success:
              thinkingSwitch.level === requested &&
              afterDirectSwitch?.thinkingLevel === requested &&
              sameCwdSessionPreserved &&
              afterProfileSwitch?.thinkingLevel === requested &&
              afterLightRouteSwitch?.thinkingLevel === requested,
            before: {
              provider: before?.model?.provider,
              modelId: before?.model?.id,
              thinkingLevel: before?.thinkingLevel,
            },
            availableLevels: levels,
            requested,
            modelSwitch,
            thinkingSwitch,
            afterDirectSwitch: afterDirectSwitch?.thinkingLevel,
            sameCwdVariant,
            sameCwdSessionPreserved,
            sessionIdBefore: before?.sessionId,
            sessionFileBeforeSameCwdRestart,
            configuredSessionPathAfterSameCwdRestart: record.config.sessionPath,
            sessionIdAfterSameCwdRestart: afterSameCwdRestart?.sessionId,
            sessionFileAfterSameCwdRestart: afterSameCwdRestart?.sessionFile,
            exercisedProfile: alternateProfile,
            afterProfileSwitch: afterProfileSwitch?.thinkingLevel,
            afterLightRouteSwitch: afterLightRouteSwitch?.thinkingLevel,
          });
        } catch (error) {
          report.error = error instanceof Error ? error.message : String(error);
        } finally {
          try {
            await restartBackend(record, {
              cwd: original.cwd,
              surface: original.surface,
              profile: original.profile,
              routeTier: "full",
              provider: original.provider,
              modelId: original.modelId,
              thinkingLevel: original.thinkingLevel,
              sessionPath: original.sessionPath,
            });
            const restored = await ensureBackend(record).command({ type: "get_state" });
            report.restoredThinkingLevel = restored?.thinkingLevel;
          } catch (restoreError) {
            report.restoreError = restoreError instanceof Error ? restoreError.message : String(restoreError);
            report.success = false;
          }
          if (record.backend) await record.backend.stop();
          if (generatedSessionFile) {
            const sessionsRoot = path.join(PI_AGENT_DIR, "sessions");
            if (!isPathInside(sessionsRoot, generatedSessionFile) || (generatedSessionDir && !isPathInside(sessionsRoot, generatedSessionDir))) {
              report.generatedSessionCleanupError = "Generated session path escaped the Pi sessions directory";
              report.success = false;
            } else {
              try {
                if (fs.existsSync(generatedSessionFile)) fs.unlinkSync(generatedSessionFile);
                if (generatedSessionDir && fs.existsSync(generatedSessionDir)) fs.rmdirSync(generatedSessionDir);
                report.generatedSessionCleaned = !fs.existsSync(generatedSessionFile) && (!generatedSessionDir || !fs.existsSync(generatedSessionDir));
              } catch (cleanupError) {
                report.generatedSessionCleaned = false;
                report.generatedSessionCleanupError = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
                report.success = false;
              }
            }
          }
          fs.mkdirSync(path.dirname(controlsOutputPath), { recursive: true });
          fs.writeFileSync(controlsOutputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
          app.exit(report.success ? 0 : 1);
        }
      }, 1800);
    });
  } else if (smokeArg) {
    const smokeOutputPath = smokeArg.slice("--smoke-output=".length);
    const autoRouteSmoke = process.argv.includes("--smoke-auto-route");
    win.webContents.once("did-finish-load", () => {
      setTimeout(async () => {
        let backend = ensureBackend(record);
        try {
          const before = await backend.command({ type: "get_state" });
          const beforeMessages = await backend.command({ type: "get_messages" });
          const beforeAssistantCount = (beforeMessages?.messages || []).filter((message) => message.role === "assistant").length;
          await backend.command({ type: "prompt", message: autoRouteSmoke ? "你好" : "只回复：北辰 Pi RPC 正常" });
          const deadline = Date.now() + 180_000;
          let settledMessages;
          while (Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, 700));
            const [state, currentMessages] = await Promise.all([
              backend.command({ type: "get_state" }),
              backend.command({ type: "get_messages" }),
            ]);
            const assistantCount = (currentMessages?.messages || []).filter((message) => message.role === "assistant").length;
            if (
              !state?.isStreaming &&
              assistantCount > beforeAssistantCount &&
              (state?.messageCount || 0) > (before?.messageCount || 0)
            ) {
              settledMessages = currentMessages.messages;
              break;
            }
          }
          if (!settledMessages) throw new Error("等待助手最终回复超时");
          const lastAssistant = [...settledMessages].reverse().find((message) => message.role === "assistant");
          const last = Array.isArray(lastAssistant?.content)
            ? lastAssistant.content.filter((block) => block.type === "text").map((block) => block.text || "").join("")
            : String(lastAssistant?.content || "");
          let restored;
          if (autoRouteSmoke) {
            await restartBackend(record, { routeTier: "full" });
            backend = ensureBackend(record);
            const [restoredState, restoredCommands, restoredMessages] = await Promise.all([
              backend.command({ type: "get_state" }),
              backend.command({ type: "get_commands" }),
              backend.command({ type: "get_messages" }),
            ]);
            restored = {
              routeTier: record.config.routeTier,
              thinkingLevel: restoredState?.thinkingLevel,
              commandCount: restoredCommands?.commands?.length || 0,
              messageCount: restoredMessages?.messages?.length || 0,
            };
          }
          await new Promise((resolve) => setTimeout(resolve, 900));
          const image = await win.webContents.capturePage();
          fs.mkdirSync(path.dirname(smokeOutputPath), { recursive: true });
          fs.writeFileSync(smokeOutputPath, image.toPNG());
          fs.writeFileSync(
            `${smokeOutputPath}.json`,
            `${JSON.stringify({
              success: lastAssistant?.stopReason !== "error",
              lastAssistantText: last,
              error: lastAssistant?.stopReason === "error" ? lastAssistant.errorMessage : undefined,
              provider: lastAssistant?.provider,
              model: lastAssistant?.model,
              usage: lastAssistant?.usage,
              autoRouteSmoke,
              restored,
            }, null, 2)}\n`,
            "utf8",
          );
          console.log(`[beichen-smoke] ${JSON.stringify(last)}`);
        } catch (error) {
          fs.writeFileSync(
            `${smokeOutputPath}.json`,
            `${JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }, null, 2)}\n`,
            "utf8",
          );
          console.error("[beichen-smoke]", error);
        } finally {
          await backend.stop();
          app.exit(0);
        }
      }, 2200);
    });
  } else if (captureArg) {
    const capturePath = captureArg.slice("--capture-ui=".length);
    const captureLayoutReportArg = process.argv.find((arg) => arg.startsWith("--capture-layout-report="));
    win.webContents.once("did-finish-load", () => {
      setTimeout(async () => {
        try {
          if (process.argv.includes("--capture-scroll-bottom")) {
            await win.webContents.executeJavaScript(
              `document.querySelector('.settings-content')?.scrollTo({ top: document.querySelector('.settings-content')?.scrollHeight || 0, behavior: 'instant' })`,
            );
            await new Promise((resolve) => setTimeout(resolve, 250));
          }
          const captureTopContext = process.argv.includes("--capture-top-context");
          win.webContents.sendInputEvent({
            type: "mouseMove",
            x: captureTopContext ? 440 : 1320,
            y: captureTopContext ? 68 : 720,
            movementX: 0,
            movementY: 0,
          });
          await new Promise((resolve) => setTimeout(resolve, 180));
          const image = await win.webContents.capturePage();
          fs.mkdirSync(path.dirname(capturePath), { recursive: true });
          fs.writeFileSync(capturePath, image.toPNG());
          if (captureLayoutReportArg) {
            const reportPath = captureLayoutReportArg.slice("--capture-layout-report=".length);
            const layout = await win.webContents.executeJavaScript(`(() => {
              const rect = (selector) => {
                const value = document.querySelector(selector)?.getBoundingClientRect();
                return value ? { x: value.x, y: value.y, width: value.width, height: value.height, right: value.right } : null;
              };
              const search = document.querySelector('.sidebar-search');
              const input = document.querySelector('.sidebar-search input');
              const searchStyle = search ? getComputedStyle(search) : null;
              const inputStyle = input ? getComputedStyle(input) : null;
              return {
                viewport: { width: innerWidth, height: innerHeight },
                sidebarCollapsed: document.querySelector('.app-shell')?.classList.contains('sidebar-collapsed') || false,
                sidebar: rect('.sidebar'),
                workspace: rect('.workspace'),
                transcript: rect('.transcript-inner'),
                composer: rect('.composer'),
                search: rect('.sidebar-search'),
                searchStyle: searchStyle ? { backgroundColor: searchStyle.backgroundColor, borderColor: searchStyle.borderColor, color: searchStyle.color } : null,
                inputStyle: inputStyle ? { backgroundColor: inputStyle.backgroundColor, color: inputStyle.color, boxShadow: inputStyle.boxShadow } : null,
              };
            })()`);
            fs.mkdirSync(path.dirname(reportPath), { recursive: true });
            fs.writeFileSync(reportPath, `${JSON.stringify(layout, null, 2)}\n`, "utf8");
          }
        } finally {
          if (record.backend) await record.backend.stop();
          app.exit(0);
        }
      }, 5000);
    });
  }

  return win;
}

function recordForEvent(event) {
  const record = windows.get(event.sender.id);
  if (!record) throw new Error("窗口状态不存在");
  return record;
}

function ensureBackend(record) {
  if (record.closed || record.window?.isDestroyed?.()) throw new Error("窗口已关闭");
  if (appShutdownStarted) throw new Error("应用正在退出");
  if (!record.backend) {
    const backend = new PiBackend(record.window, record.config);
    backend.start();
    record.backend = backend;
  }
  return record.backend;
}

async function performBackendRestart(record, patch) {
  patch = {
    ...patch,
    ...(patch.profile ? { profile: visibleProfileId(patch.profile) } : {}),
  };
  let sessionPath = record.config.sessionPath;
  let thinkingLevel = patch.thinkingLevel || record.config.thinkingLevel;
  const cwdChanged = Boolean(patch.cwd) && !pathsEqual(patch.cwd, record.config.cwd);
  if (record.backend) {
    try {
      const state = await record.backend.command({ type: "get_state" }, 15_000);
      if (!cwdChanged) sessionPath = state?.sessionFile || sessionPath;
      thinkingLevel = patch.thinkingLevel || state?.thinkingLevel || thinkingLevel;
    } catch {
      // Resume the previously known session when state retrieval is unavailable.
    }
  }

  if (record.backend) await record.backend.stop();
  if (record.closed || record.window?.isDestroyed?.()) throw new Error("窗口已关闭");
  if (appShutdownStarted) throw new Error("应用正在退出");
  const nextConfig = {
    ...record.config,
    ...patch,
    thinkingLevel,
    sessionPath: cwdChanged
      ? undefined
      : Object.prototype.hasOwnProperty.call(patch, "sessionPath") ? patch.sessionPath : sessionPath,
  };
  const nextBackend = new PiBackend(record.window, nextConfig);
  nextBackend.start();
  record.config = nextConfig;
  record.backend = nextBackend;

  writeAppSettings((current) => ({
    ...current,
    defaults: {
      ...(current.defaults || {}),
      cwd: record.config.cwd,
      surface: record.config.surface,
      profile: record.config.profile,
      provider: record.config.provider,
      modelId: record.config.modelId,
      thinkingLevel: record.config.thinkingLevel,
    },
  }));

  return { ...record.config, sessionPath: undefined };
}

function restartBackend(record, patch) {
  const requestedPatch = patch && typeof patch === "object" && !Array.isArray(patch) ? { ...patch } : {};
  const previous = record.backendRestartPromise || Promise.resolve();
  const operation = previous
    .catch(() => undefined)
    .then(() => {
      if (record.closed || record.window?.isDestroyed?.()) throw new Error("窗口已关闭");
      if (appShutdownStarted) throw new Error("应用正在退出");
      return performBackendRestart(record, requestedPatch);
    });
  record.backendRestartPromise = operation;
  return operation.finally(() => {
    if (record.backendRestartPromise === operation) record.backendRestartPromise = null;
  });
}

function persistRuntimeSelection(record) {
  writeAppSettings((current) => ({
    ...current,
    defaults: {
      ...(current.defaults || {}),
      provider: record.config.provider,
      modelId: record.config.modelId,
      thinkingLevel: record.config.thinkingLevel,
    },
  }));
}

async function setRuntimeModel(record, provider, modelId) {
  if (typeof provider !== "string" || !provider || typeof modelId !== "string" || !modelId) {
    throw new Error("模型参数无效");
  }
  const backend = ensureBackend(record);
  await backend.command({ type: "set_model", provider, modelId });
  const [state, available] = await Promise.all([
    backend.command({ type: "get_state" }),
    backend.command({ type: "get_available_thinking_levels" }),
  ]);
  record.config.provider = state?.model?.provider || provider;
  record.config.modelId = state?.model?.id || modelId;
  record.config.thinkingLevel = state?.thinkingLevel || "off";
  persistRuntimeSelection(record);
  return { model: state?.model || null, thinkingLevel: record.config.thinkingLevel, levels: available?.levels || ["off"] };
}

async function setRuntimeThinking(record, level) {
  if (typeof level !== "string" || !level) throw new Error("思考强度无效");
  const backend = ensureBackend(record);
  await backend.command({ type: "set_thinking_level", level });
  const [state, available] = await Promise.all([
    backend.command({ type: "get_state" }),
    backend.command({ type: "get_available_thinking_levels" }),
  ]);
  record.config.thinkingLevel = state?.thinkingLevel || "off";
  persistRuntimeSelection(record);
  return { level: record.config.thinkingLevel, levels: available?.levels || ["off"] };
}

async function restartWindowsForRegistryChange(targetRecord, patchForRecord) {
  const ordered = [...windows.values()].sort((left, right) => {
    if (left === targetRecord) return 1;
    if (right === targetRecord) return -1;
    return 0;
  });
  for (const currentRecord of ordered) {
    if (currentRecord.closed || currentRecord.window?.isDestroyed?.()) continue;
    await restartBackend(currentRecord, patchForRecord(currentRecord));
  }
}

async function saveCustomApi(record, input) {
  const currentSettings = readJson(appSettingsPath(), {});
  const entries = customApiEntries(currentSettings);
  const requestedProviderId = typeof input?.providerId === "string" ? input.providerId : undefined;
  const existing = requestedProviderId ? entries.find((entry) => entry.providerId === requestedProviderId) : undefined;
  if (requestedProviderId && !existing) throw new Error("找不到要编辑的自定义 API");

  const providerId = existing?.providerId || `${CUSTOM_PROVIDER_PREFIX}${crypto.randomUUID().slice(0, 12)}`;
  const normalized = normalizeCustomApiInput(input, { providerId });
  let encryptedApiKey = existing?.encryptedApiKey || "";
  if (normalized.useApiKey) {
    if (normalized.apiKey) encryptedApiKey = encryptCustomApiKey(normalized.apiKey);
    if (!encryptedApiKey) throw new Error("请填写 API Key；本地无密钥服务请关闭“使用 API Key”");
  } else {
    encryptedApiKey = "";
  }

  const piDefaults = getPiDefaults();
  const currentProviderIsCustom = entries.some((entry) => entry.providerId === record.config.provider);
  const fallbackProvider = existing?.fallbackProvider || (currentProviderIsCustom ? piDefaults.provider : record.config.provider) || piDefaults.provider;
  const fallbackModelId = existing?.fallbackModelId || (currentProviderIsCustom ? piDefaults.modelId : record.config.modelId) || piDefaults.modelId;
  const { apiKey: _discardedApiKey, ...safeConfig } = normalized;
  const savedEntry = {
    ...safeConfig,
    providerId,
    encryptedApiKey,
    fallbackProvider,
    fallbackModelId,
    createdAt: existing?.createdAt || Date.now(),
    updatedAt: Date.now(),
  };
  const nextEntries = existing
    ? entries.map((entry) => (entry.providerId === providerId ? savedEntry : entry))
    : [...entries, savedEntry];
  const nextSettings = writeAppSettings((current) => ({
    ...current,
    customApis: nextEntries,
    managedCustomProviderIds: [...new Set([
      ...(Array.isArray(current.managedCustomProviderIds) ? current.managedCustomProviderIds : []),
      providerId,
    ])],
  }));

  syncCustomModelsFile(nextSettings);
  applyCustomApiEnvironment(nextSettings);
  modelRuntimePromise = undefined;
  await restartWindowsForRegistryChange(record, (currentRecord) =>
    currentRecord === record || currentRecord.config.provider === providerId
      ? { provider: providerId, modelId: savedEntry.modelId, routeTier: "full" }
      : { routeTier: "full" });

  return {
    providerId,
    modelId: savedEntry.modelId,
    config: { ...record.config, sessionPath: undefined },
    customApis: nextEntries.map(publicCustomApi),
  };
}

async function deleteCustomApi(record, providerId) {
  if (typeof providerId !== "string" || !providerId.startsWith(CUSTOM_PROVIDER_PREFIX)) {
    throw new Error("自定义 API 标识无效");
  }
  const currentSettings = readJson(appSettingsPath(), {});
  const entries = customApiEntries(currentSettings);
  const removed = entries.find((entry) => entry.providerId === providerId);
  if (!removed) throw new Error("自定义 API 已不存在");
  const nextEntries = entries.filter((entry) => entry.providerId !== providerId);
  const nextSettings = writeAppSettings((current) => ({ ...current, customApis: nextEntries }));

  syncCustomModelsFile(nextSettings);
  applyCustomApiEnvironment(nextSettings);
  modelRuntimePromise = undefined;
  const piDefaults = getPiDefaults();
  const fallbackProvider = removed.fallbackProvider || piDefaults.provider;
  const fallbackModelId = removed.fallbackModelId || piDefaults.modelId;
  await restartWindowsForRegistryChange(record, (currentRecord) =>
    currentRecord.config.provider === providerId
      ? { provider: fallbackProvider, modelId: fallbackModelId, routeTier: "full" }
      : { routeTier: "full" });

  return {
    config: { ...record.config, sessionPath: undefined },
    customApis: nextEntries.map(publicCustomApi),
  };
}

function extractUserText(message) {
  if (!message || message.role !== "user") return "";
  if (typeof message.content === "string") return message.content;
  if (!Array.isArray(message.content)) return "";
  return message.content
    .filter((part) => part?.type === "text")
    .map((part) => part.text || "")
    .join(" ")
    .trim();
}

function collectFilesRecursive(root, suffix, limit = 160) {
  if (!fs.existsSync(root)) return [];
  const found = [];
  const stack = [root];
  while (stack.length && found.length < limit) {
    const dir = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(fullPath);
      else if (entry.isFile() && entry.name.endsWith(suffix)) found.push(fullPath);
      if (found.length >= limit) break;
    }
  }
  return found;
}

function listSessions() {
  return collectFilesRecursive(path.join(PI_AGENT_DIR, "sessions"), ".jsonl")
    .map((filePath) => {
      try {
        const stat = fs.statSync(filePath);
        const head = fs.readFileSync(filePath, "utf8").slice(0, 180_000);
        const entries = head
          .split("\n")
          .filter(Boolean)
          .slice(0, 160)
          .map((line) => {
            try {
              return JSON.parse(line);
            } catch {
              return null;
            }
          })
          .filter(Boolean);
        const header = entries.find((entry) => entry.type === "session") || {};
        const firstUser = entries.find((entry) => entry.type === "message" && entry.message?.role === "user");
        const title =
          header.name ||
          extractUserText(firstUser?.message).replace(/\s+/g, " ").slice(0, 56) ||
          path.basename(filePath, ".jsonl");
        return {
          path: filePath,
          id: header.id || path.basename(filePath, ".jsonl"),
          title,
          cwd: header.cwd || "",
          updatedAt: stat.mtimeMs,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 80);
}

async function listProviders() {
  const runtime = await getModelRuntime();
  const providers = runtime.getProviders();
  return Promise.all(
    providers.map(async (provider) => {
      let auth;
      try {
        auth = await runtime.checkAuth(provider.id, { signal: AbortSignal.timeout(2500) });
      } catch {
        auth = undefined;
      }
      return {
        id: provider.id,
        name: provider.name,
        ready: Boolean(auth),
        authSource: auth?.source,
        apiKey: provider.auth?.apiKey
          ? { name: provider.auth.apiKey.name || "API Key", canLogin: Boolean(provider.auth.apiKey.login) }
          : null,
        oauth: provider.auth?.oauth
          ? {
              name: provider.auth.oauth.name || "OAuth",
              loginLabel: provider.auth.oauth.loginLabel || "连接订阅",
              isSubscription: Boolean(provider.auth.oauth.isSubscription),
            }
          : null,
        modelCount: runtime.getModels(provider.id).length,
      };
    }),
  );
}

async function modelsForProvider(providerId) {
  const runtime = await getModelRuntime();
  return runtime.getModels(providerId).map((model) => ({
    id: model.id,
    provider: model.provider,
    name: model.name || model.id,
    reasoning: Boolean(model.reasoning),
    input: model.input || [],
    contextWindow: model.contextWindow,
    maxTokens: model.maxTokens,
  }));
}

async function beginAuthFlow(record, providerId, type) {
  const runtime = await getModelRuntime();
  const controller = new AbortController();
  const sender = record.window.webContents;

  const credential = await runtime.login(providerId, type, {
    signal: controller.signal,
    prompt(prompt) {
      const id = crypto.randomUUID();
      return new Promise((resolve, reject) => {
        const onAbort = () => {
          pendingAuthPrompts.delete(id);
          reject(new Error("登录已取消"));
        };
        controller.signal.addEventListener("abort", onAbort, { once: true });
        pendingAuthPrompts.set(id, {
          senderId: sender.id,
          resolve(value) {
            controller.signal.removeEventListener("abort", onAbort);
            resolve(value);
          },
          reject(error) {
            controller.signal.removeEventListener("abort", onAbort);
            reject(error);
          },
        });
        sender.send("auth:prompt", { id, providerId, prompt });
      });
    },
    notify(authEvent) {
      sender.send("auth:event", { providerId, event: authEvent });
      if (authEvent.type === "auth_url" && authEvent.url) {
        if (!openExternalSafely(authEvent.url, sender)) {
          sender.send("auth:event", {
            providerId,
            event: { type: "info", message: "已阻止不安全的授权链接" },
          });
        }
      }
    },
  });

  modelRuntimePromise = undefined;
  return { providerId, type: credential.type };
}

ipcMain.handle("app:bootstrap", async (event) => {
  const record = recordForEvent(event);
  ensureBackend(record);
  const settings = readJson(appSettingsPath(), {});
  const visualThemeArg = process.argv.find((arg) => arg.startsWith("--capture-theme="));
  const localeArg = process.argv.find((arg) => arg.startsWith("--capture-locale="));
  const settingsTabArg = process.argv.find((arg) => arg.startsWith("--capture-settings="));
  const automatedUiRun = process.argv.some((arg) =>
    arg.startsWith("--capture-") || arg.startsWith("--smoke-") || arg.startsWith("--benchmark-"));
  return {
    appVersion: app.getVersion(),
    config: { ...record.config, sessionPath: undefined },
    profiles: Object.values(PROFILES).filter((profile) => !profile.hidden),
    customApis: customApiEntries(settings).map(publicCustomApi),
    securityNoticeAccepted: process.argv.includes("--capture-security-notice")
      ? false
      : automatedUiRun || settings.securityNoticeAcceptedVersion === SECURITY_NOTICE_VERSION,
    starSeen: settings.starSeenVersion === app.getVersion(),
    platform: process.platform,
    visualThemeOverride: visualThemeArg?.slice("--capture-theme=".length),
    localeOverride: localeArg?.slice("--capture-locale=".length),
    settingsTabOverride: settingsTabArg?.slice("--capture-settings=".length),
    tokenPanelOverride: process.argv.includes("--capture-token-panel"),
    customApiFormOverride: process.argv.includes("--capture-custom-api-form"),
    modelControlOverride: process.argv.includes("--capture-model-control"),
    modelControlSubmenuOverride: process.argv.find((arg) => arg.startsWith("--capture-model-submenu="))
      ?.slice("--capture-model-submenu=".length),
    sidebarCollapsedOverride: process.argv.includes("--capture-sidebar-collapsed"),
    searchOpenOverride: process.argv.includes("--capture-search-open"),
  };
});

ipcMain.handle("pi:command", async (event, payload) => {
  const record = recordForEvent(event);
  return ensureBackend(record).command(payload);
});

ipcMain.handle("pi:raw", async (event, payload) => {
  const record = recordForEvent(event);
  await ensureBackend(record).raw(payload);
  return true;
});

ipcMain.handle("backend:restart", async (event, patch) => restartBackend(recordForEvent(event), patch || {}));
ipcMain.handle("backend:set-model", async (event, provider, modelId) =>
  setRuntimeModel(recordForEvent(event), provider, modelId));
ipcMain.handle("backend:set-thinking", async (event, level) =>
  setRuntimeThinking(recordForEvent(event), level));

ipcMain.handle("custom-api:list", () => customApiEntries().map(publicCustomApi));
ipcMain.handle("custom-api:save", (event, input) => saveCustomApi(recordForEvent(event), input));
ipcMain.handle("custom-api:delete", (event, providerId) => deleteCustomApi(recordForEvent(event), providerId));

ipcMain.handle("sessions:list", () => listSessions());
ipcMain.handle("sessions:switch", async (event, sessionPath) => {
  if (typeof sessionPath !== "string" || !sessionPath.trim()) {
    throw new Error("会话路径无效");
  }
  const record = recordForEvent(event);
  const data = await ensureBackend(record).command({ type: "switch_session", sessionPath });
  if (!data?.cancelled) record.config.sessionPath = sessionPath;
  return data;
});

ipcMain.handle("auth:list-providers", () => listProviders());
ipcMain.handle("auth:list-models", (_event, providerId) => modelsForProvider(providerId));
ipcMain.handle("auth:login", (event, providerId, type) => beginAuthFlow(recordForEvent(event), providerId, type));
ipcMain.handle("auth:logout", async (_event, providerId) => {
  const runtime = await getModelRuntime();
  await runtime.logout(providerId);
  modelRuntimePromise = undefined;
  return true;
});

ipcMain.handle("auth:reply", (event, id, value) => {
  const pending = pendingAuthPrompts.get(id);
  if (!pending || pending.senderId !== event.sender.id) return false;
  pendingAuthPrompts.delete(id);
  pending.resolve(String(value ?? ""));
  return true;
});
ipcMain.handle("auth:cancel", (event, id) => {
  const pending = pendingAuthPrompts.get(id);
  if (!pending || pending.senderId !== event.sender.id) return false;
  pendingAuthPrompts.delete(id);
  pending.reject(new Error("用户取消登录"));
  return true;
});

ipcMain.handle("dialog:pick-directory", async (event) => {
  const record = recordForEvent(event);
  const result = await dialog.showOpenDialog(record.window, {
    title: "选择 Codex 工作目录",
    defaultPath: record.config.cwd,
    properties: ["openDirectory", "createDirectory"],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle("plugins:open-root", async () => {
  fs.mkdirSync(PI_AGENT_DIR, { recursive: true });
  return shell.openPath(PI_AGENT_DIR);
});

ipcMain.handle("shell:show-item", (_event, filePath) => {
  if (typeof filePath !== "string" || !path.isAbsolute(filePath)) return false;
  shell.showItemInFolder(filePath);
  return true;
});

ipcMain.handle("app:mark-star", () => {
  writeAppSettings((current) => ({ ...current, starSeenVersion: app.getVersion() }));
  return true;
});
ipcMain.handle("app:accept-security-notice", () => {
  writeAppSettings((current) => ({ ...current, securityNoticeAcceptedVersion: SECURITY_NOTICE_VERSION }));
  return true;
});

ipcMain.handle("window:new", (event) => {
  const record = recordForEvent(event);
  const win = createWindow({ ...record.config, routeTier: "full", sessionPath: undefined });
  return win.webContents.id;
});
ipcMain.handle("window:minimize", (event) => recordForEvent(event).window.minimize());
ipcMain.handle("window:toggle-maximize", (event) => {
  const win = recordForEvent(event).window;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
  return win.isMaximized();
});
ipcMain.handle("window:close", (event) => recordForEvent(event).window.close());

app.whenReady().then(() => {
  try {
    const settings = readJson(appSettingsPath(), {});
    syncCustomModelsFile(settings);
    applyCustomApiEnvironment(settings);
  } catch (error) {
    try {
      fs.appendFileSync(path.join(os.tmpdir(), "beichen-pi-custom-api.log"), `${error?.stack || error}\n`);
    } catch {
      // Startup should continue even if diagnostics cannot be written.
    }
  }
  const smokeModelArg = process.argv.find((arg) => arg.startsWith("--smoke-model="));
  const autoRouteSmoke = process.argv.includes("--smoke-auto-route");
  const captureSessionArg = process.argv.find((arg) => arg.startsWith("--capture-session="));
  const captureCwdArg = process.argv.find((arg) => arg.startsWith("--capture-cwd="));
  const captureProfileArg = process.argv.find((arg) => arg.startsWith("--capture-profile="));
  const overrides = {
    sessionPath: captureSessionArg?.slice("--capture-session=".length),
    cwd: captureCwdArg?.slice("--capture-cwd=".length),
    profile: captureProfileArg?.slice("--capture-profile=".length),
  };
  if (smokeModelArg) {
    const modelSpec = smokeModelArg.slice("--smoke-model=".length);
    const separator = modelSpec.indexOf("/");
    createWindow({
      ...overrides,
      provider: separator > 0 ? modelSpec.slice(0, separator) : undefined,
      modelId: separator > 0 ? modelSpec.slice(separator + 1) : modelSpec,
      profile: autoRouteSmoke ? "ultra" : "codex",
      routeTier: autoRouteSmoke ? "light" : "full",
    });
  } else {
    createWindow(overrides);
  }
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

let backendShutdownPromise = null;
let allowQuitAfterBackendStop = false;
app.on("before-quit", (event) => {
  if (allowQuitAfterBackendStop) return;
  event.preventDefault();
  if (backendShutdownPromise) return;
  appShutdownStarted = true;

  const stops = [...pendingBackendStops];
  for (const record of windows.values()) {
    if (record.backend || record.backendRestartPromise) stops.push(trackBackendStop(record));
  }

  backendShutdownPromise = Promise.allSettled(stops).then(() => {
    allowQuitAfterBackendStop = true;
    app.quit();
  });
});
