import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const mainPath = path.resolve("electron/main.cjs");
const mainSource = fs.readFileSync(mainPath, "utf8");
const requireFromMain = createRequire(pathToFileURL(mainPath));

class FakeStream extends EventEmitter {
  constructor(writeImpl) {
    super();
    this.writeImpl = writeImpl;
    this.ended = false;
    this.encoding = undefined;
  }

  setEncoding(encoding) {
    this.encoding = encoding;
  }

  write(value, callback) {
    if (this.writeImpl) return this.writeImpl(value, callback);
    callback?.(null);
    return true;
  }

  end() {
    this.ended = true;
  }
}

function fakeChild(options = {}) {
  const child = new EventEmitter();
  child.stdin = new FakeStream(options.write);
  child.stdout = new FakeStream();
  child.stderr = new FakeStream();
  child.exitCode = null;
  child.signalCode = null;
  child.killSignals = [];
  child.kill = (signal) => {
    child.killSignals.push(signal);
    return true;
  };
  return child;
}

function rpcChild(state = {}) {
  let child;
  child = fakeChild({
    write(value, callback) {
      callback?.(null);
      const command = JSON.parse(value);
      queueMicrotask(() => {
        child.stdout.emit("data", `${JSON.stringify({
          type: "response",
          id: command.id,
          command: command.type,
          success: true,
          data: state,
        })}\n`);
      });
      return true;
    },
  });
  child.stdin.end = () => {
    child.stdin.ended = true;
    queueMicrotask(() => {
      child.exitCode = 0;
      child.emit("exit", 0, null);
    });
  };
  return child;
}

function manualTimers() {
  let sequence = 0;
  const pending = new Map();
  return {
    setTimeout(callback, delay) {
      const id = ++sequence;
      pending.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) {
      pending.delete(id);
    },
    runDelay(delay) {
      const matches = [...pending.entries()].filter(([, timer]) => timer.delay === delay);
      for (const [id, timer] of matches) {
        pending.delete(id);
        timer.callback();
      }
      return matches.length;
    },
  };
}

function loadMain({ children = [], timers } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "beichen-main-test-"));
  const documents = path.join(root, "Documents");
  const userData = path.join(root, "UserData");
  const agentDir = path.join(root, "PiAgent");
  const installDirectory = path.join(root, "InstallDirectory");
  for (const directory of [documents, userData, agentDir, installDirectory]) {
    fs.mkdirSync(directory, { recursive: true });
  }

  const handlers = new Map();
  const spawned = [];
  const app = Object.assign(new EventEmitter(), {
    commandLine: { appendSwitch() {} },
    exit() {},
    getPath(name) {
      if (name === "documents") return documents;
      if (name === "userData") return userData;
      throw new Error(`unexpected app path: ${name}`);
    },
    getVersion() {
      return "test";
    },
    isPackaged: false,
    quit() {},
    setAppUserModelId() {},
    // Deliberately never resolve: unit tests exercise exported internals and IPC
    // handlers without creating a real BrowserWindow.
    whenReady() {
      return new Promise(() => {});
    },
  });

  const electron = {
    app,
    BrowserWindow: class {
      static getAllWindows() {
        return [];
      }
    },
    dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      },
    },
    safeStorage: {
      decryptString() {
        return "";
      },
      encryptString(value) {
        return Buffer.from(value);
      },
      isEncryptionAvailable() {
        return false;
      },
    },
    shell: {
      openExternal: async () => {},
      openPath: async () => "",
      showItemInFolder() {},
    },
  };

  const spawn = (...args) => {
    const child = children[spawned.length];
    if (!child) throw new Error("test did not provide a child process");
    spawned.push({ args, child });
    return child;
  };
  const mockRequire = (specifier) => {
    if (specifier === "electron") return electron;
    if (specifier === "node:child_process") return { spawn };
    return requireFromMain(specifier);
  };

  const fakeProcess = {
    argv: [],
    cwd: () => installDirectory,
    env: { PI_CODING_AGENT_DIR: agentDir },
    execPath: process.execPath,
    platform: process.platform,
    resourcesPath: root,
    stderr: new EventEmitter(),
    stdout: new EventEmitter(),
  };
  const context = vm.createContext({
    AbortController,
    AbortSignal,
    Buffer,
    Promise,
    clearTimeout: timers?.clearTimeout.bind(timers) ?? clearTimeout,
    console,
    process: fakeProcess,
    setTimeout: timers?.setTimeout.bind(timers) ?? setTimeout,
  });
  const instrumentedSource = `${mainSource}\nmodule.exports.__test = { PiBackend, createInitialConfig, restartBackend, windows };`;
  const wrapper = vm.runInContext(
    `(function (exports, require, module, __filename, __dirname) { ${instrumentedSource}\n})`,
    context,
    { filename: mainPath },
  );
  const module = { exports: {} };
  wrapper(module.exports, mockRequire, module, mainPath, path.dirname(mainPath));

  return {
    ...module.exports.__test,
    app,
    documents,
    handlers,
    root,
    spawned,
  };
}

function backendConfig(cwd) {
  return {
    cwd,
    profile: "codex",
    routeTier: "full",
    surface: "codex",
    thinkingLevel: "medium",
  };
}

function backendOwner(events) {
  return {
    isDestroyed: () => false,
    webContents: {
      send(channel, payload) {
        events.push({ channel, payload });
      },
    },
  };
}

test("one PiBackend instance emits ready again after an unexpected exit", (t) => {
  const first = fakeChild();
  const second = fakeChild();
  const harness = loadMain({ children: [first, second] });
  t.after(() => fs.rmSync(harness.root, { recursive: true, force: true }));
  const events = [];
  const backend = new harness.PiBackend(backendOwner(events), backendConfig(harness.documents));

  backend.start();
  first.stdout.emit("data", '{"type":"first"}\n');
  first.exitCode = 1;
  first.emit("exit", 1, null);

  backend.start();
  second.stdout.emit("data", '{"type":"second"}\n');

  const states = events
    .filter((event) => event.channel === "backend:status")
    .map((event) => event.payload.state);
  assert.deepEqual(states, ["starting", "ready", "stopped", "starting", "ready"]);
  assert.equal(harness.spawned.length, 2);
});

test("a synchronous spawn failure reports error and does not commit restart config", async (t) => {
  const harness = loadMain();
  t.after(() => fs.rmSync(harness.root, { recursive: true, force: true }));
  const events = [];
  const config = backendConfig(harness.documents);
  const owner = backendOwner(events);
  const backend = new harness.PiBackend(owner, config);

  assert.throws(() => backend.start(), /test did not provide a child process/);
  assert.deepEqual(events
    .filter((event) => event.channel === "backend:status")
    .map((event) => event.payload.state), ["starting", "error"]);

  const record = { window: owner, config, backend: null, backendRestartPromise: null };
  await assert.rejects(harness.restartBackend(record, { routeTier: "light" }), /test did not provide a child process/);
  assert.equal(record.config, config);
  assert.equal(record.config.routeTier, "full");
  assert.equal(record.backend, null);
});

test("a restarted PiBackend discards partial stdout and stderr from the old process", (t) => {
  const first = fakeChild();
  const second = fakeChild();
  const harness = loadMain({ children: [first, second] });
  t.after(() => fs.rmSync(harness.root, { recursive: true, force: true }));
  const events = [];
  const backend = new harness.PiBackend(backendOwner(events), backendConfig(harness.documents));

  backend.start();
  first.stdout.emit("data", '{"type":"stale"');
  first.stderr.emit("data", "old stderr\n");
  assert.notEqual(backend.stdoutBuffer, "");
  assert.deepEqual([...backend.stderrTail], ["old stderr"]);
  first.exitCode = 9;
  first.emit("exit", 9, null);

  backend.start();
  assert.equal(backend.stdoutBuffer, "");
  assert.deepEqual([...backend.stderrTail], []);
  // A late chunk from the exited process must not contaminate the replacement.
  first.stdout.emit("data", '{"type":"late-stale"}\n');
  first.stderr.emit("data", "late old stderr\n");
  second.stdout.emit("data", '{"type":"fresh","value":42}\n');

  const piEvents = events.filter((event) => event.channel === "pi:event");
  assert.equal(piEvents.length, 1);
  assert.equal(piEvents[0].payload.type, "fresh");
  assert.equal(piEvents[0].payload.value, 42);
  assert.deepEqual([...backend.stderrTail], []);
});

test("stop remains pending after SIGKILL until the child reports a terminal event", async (t) => {
  const timers = manualTimers();
  const child = fakeChild();
  const harness = loadMain({ children: [child], timers });
  t.after(() => fs.rmSync(harness.root, { recursive: true, force: true }));
  const backend = new harness.PiBackend(backendOwner([]), backendConfig(harness.documents));
  backend.start();

  let settled = false;
  const stopping = backend.stop().then(() => {
    settled = true;
  });
  await Promise.resolve();
  assert.equal(child.stdin.ended, true);
  assert.equal(settled, false);

  assert.equal(timers.runDelay(1500), 1);
  await Promise.resolve();
  assert.deepEqual(child.killSignals, ["SIGKILL"]);
  assert.equal(settled, false);

  child.signalCode = "SIGKILL";
  child.emit("exit", null, "SIGKILL");
  await stopping;
  assert.equal(settled, true);
});

test("pi:raw reports asynchronous stdin write failures to the renderer", async (t) => {
  const writeError = new Error("EPIPE while writing");
  const child = fakeChild({
    write(_value, callback) {
      if (callback) queueMicrotask(() => callback(writeError));
      return false;
    },
  });
  const harness = loadMain({ children: [child] });
  t.after(() => fs.rmSync(harness.root, { recursive: true, force: true }));
  const backend = new harness.PiBackend(backendOwner([]), backendConfig(harness.documents));
  const senderId = 41;
  harness.windows.set(senderId, { backend, config: backendConfig(harness.documents) });
  const raw = harness.handlers.get("pi:raw");

  await assert.rejects(raw({ sender: { id: senderId } }, { type: "abort" }), /EPIPE while writing/);
});

test("the first-run cwd defaults to Electron's Documents directory", (t) => {
  const harness = loadMain();
  t.after(() => fs.rmSync(harness.root, { recursive: true, force: true }));

  const config = harness.createInitialConfig();
  assert.equal(config.cwd, harness.documents);
});

test("sessions:switch rejects non-string paths before invoking the backend", async (t) => {
  const harness = loadMain();
  t.after(() => fs.rmSync(harness.root, { recursive: true, force: true }));
  const calls = [];
  const senderId = 73;
  harness.windows.set(senderId, {
    backend: {
      command(payload) {
        calls.push(payload);
        return Promise.resolve({ cancelled: false });
      },
    },
    config: {},
  });
  const switchSession = harness.handlers.get("sessions:switch");

  await assert.rejects(switchSession({ sender: { id: senderId } }, { path: "not-a-string" }), /会话路径无效/);
  await assert.rejects(switchSession({ sender: { id: senderId } }, "   "), /会话路径无效/);
  assert.equal(calls.length, 0);
});

test("before-quit waits for backend shutdown before allowing the final quit", async (t) => {
  const harness = loadMain();
  t.after(() => fs.rmSync(harness.root, { recursive: true, force: true }));
  let releaseStop;
  let stopPromise;
  let stopCalls = 0;
  let quitCalls = 0;
  harness.app.quit = () => {
    quitCalls += 1;
  };
  harness.windows.set(91, {
    backend: {
      stop() {
        if (stopPromise) return stopPromise;
        stopCalls += 1;
        stopPromise = new Promise((resolve) => {
          releaseStop = resolve;
        });
        return stopPromise;
      },
    },
  });

  let prevented = 0;
  const quitEvent = { preventDefault: () => { prevented += 1; } };
  harness.app.emit("before-quit", quitEvent);
  await Promise.resolve();
  assert.equal(prevented, 1);
  assert.equal(stopCalls, 1);
  assert.equal(quitCalls, 0);

  releaseStop();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(quitCalls, 1);

  harness.app.emit("before-quit", quitEvent);
  assert.equal(prevented, 1, "the guarded final quit must not be prevented again");
});

test("concurrent backend restarts are serialized and stop every replaced child", async (t) => {
  const first = rpcChild({ sessionFile: "session.jsonl", thinkingLevel: "medium" });
  const second = rpcChild({ sessionFile: "session.jsonl", thinkingLevel: "medium" });
  const third = rpcChild({ sessionFile: "session.jsonl", thinkingLevel: "medium" });
  const harness = loadMain({ children: [first, second, third] });
  t.after(() => fs.rmSync(harness.root, { recursive: true, force: true }));
  const record = {
    window: backendOwner([]),
    config: backendConfig(harness.documents),
    backend: null,
    backendRestartPromise: null,
  };
  record.backend = new harness.PiBackend(record.window, record.config);
  record.backend.start();

  const firstRestart = harness.restartBackend(record, { surface: "chatgpt" });
  const secondRestart = harness.restartBackend(record, { surface: "codex" });
  await Promise.all([firstRestart, secondRestart]);

  assert.equal(harness.spawned.length, 3);
  assert.equal(first.stdin.ended, true);
  assert.equal(second.stdin.ended, true, "the intermediate child must not become orphaned");
  assert.equal(third.stdin.ended, false);
  assert.equal(record.config.surface, "codex");
  await record.backend.stop();
});

test("shutdown blocks an in-flight restart from spawning a replacement child", async (t) => {
  let pendingCommand;
  let first;
  first = fakeChild({
    write(value, callback) {
      callback?.(null);
      pendingCommand = JSON.parse(value);
      return true;
    },
  });
  first.stdin.end = () => {
    first.stdin.ended = true;
    queueMicrotask(() => {
      first.exitCode = 0;
      first.emit("exit", 0, null);
    });
  };
  const unexpectedReplacement = rpcChild();
  const harness = loadMain({ children: [first, unexpectedReplacement] });
  t.after(() => fs.rmSync(harness.root, { recursive: true, force: true }));
  let quitCalls = 0;
  harness.app.quit = () => {
    quitCalls += 1;
  };
  const record = {
    window: backendOwner([]),
    config: backendConfig(harness.documents),
    backend: null,
    backendRestartPromise: null,
  };
  record.backend = new harness.PiBackend(record.window, record.config);
  record.backend.start();
  harness.windows.set(101, record);

  const restarting = harness.restartBackend(record, { surface: "chatgpt" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(pendingCommand.type, "get_state");
  harness.app.emit("before-quit", { preventDefault() {} });
  first.stdout.emit("data", `${JSON.stringify({
    type: "response",
    id: pendingCommand.id,
    command: pendingCommand.type,
    success: true,
    data: { thinkingLevel: "medium" },
  })}\n`);

  await assert.rejects(restarting, /应用正在退出/);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.spawned.length, 1);
  assert.equal(first.stdin.ended, true);
  assert.equal(unexpectedReplacement.stdin.ended, false);
  assert.equal(quitCalls, 1);
});

test("closing a window blocks its delayed restart from spawning an orphan", async (t) => {
  let pendingCommand;
  let first;
  first = fakeChild({
    write(value, callback) {
      callback?.(null);
      pendingCommand = JSON.parse(value);
      return true;
    },
  });
  first.stdin.end = () => {
    first.stdin.ended = true;
    queueMicrotask(() => {
      first.exitCode = 0;
      first.emit("exit", 0, null);
    });
  };
  const unexpectedReplacement = rpcChild();
  const harness = loadMain({ children: [first, unexpectedReplacement] });
  t.after(() => fs.rmSync(harness.root, { recursive: true, force: true }));
  let destroyed = false;
  const owner = backendOwner([]);
  owner.isDestroyed = () => destroyed;
  const record = {
    window: owner,
    config: backendConfig(harness.documents),
    backend: null,
    backendRestartPromise: null,
    closed: false,
  };
  record.backend = new harness.PiBackend(record.window, record.config);
  record.backend.start();

  const restarting = harness.restartBackend(record, { surface: "chatgpt" });
  await new Promise((resolve) => setImmediate(resolve));
  record.closed = true;
  destroyed = true;
  first.stdout.emit("data", `${JSON.stringify({
    type: "response",
    id: pendingCommand.id,
    command: pendingCommand.type,
    success: true,
    data: { thinkingLevel: "medium" },
  })}\n`);

  await assert.rejects(restarting, /窗口已关闭/);
  assert.equal(harness.spawned.length, 1);
  assert.equal(first.stdin.ended, true);
  assert.equal(unexpectedReplacement.stdin.ended, false);
});

test("renderer commands cannot restart Pi after shutdown begins", async (t) => {
  const unexpectedChild = rpcChild();
  const harness = loadMain({ children: [unexpectedChild] });
  t.after(() => fs.rmSync(harness.root, { recursive: true, force: true }));
  const senderId = 111;
  harness.windows.set(senderId, {
    window: backendOwner([]),
    config: backendConfig(harness.documents),
    backend: null,
    backendRestartPromise: null,
  });
  harness.app.emit("before-quit", { preventDefault() {} });

  const command = harness.handlers.get("pi:command");
  await assert.rejects(command({ sender: { id: senderId } }, { type: "get_state" }), /应用正在退出/);
  assert.equal(harness.spawned.length, 0);
  assert.equal(unexpectedChild.stdin.ended, false);
});
