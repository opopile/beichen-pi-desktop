import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  AppWindow,
  ArrowUp,
  Bot,
  BookOpen,
  BrainCircuit,
  Check,
  ChevronDown,
  ChevronRight,
  CircleStop,
  Command,
  Copy,
  Cpu,
  ExternalLink,
  EyeOff,
  FileCode2,
  FlaskConical,
  Folder,
  FolderOpen,
  Gauge,
  Ghost,
  Image as ImageIcon,
  KeyRound,
  LogOut,
  Maximize2,
  MessageSquare,
  Mic,
  Minimize2,
  Orbit,
  Palette,
  PanelLeft,
  Paperclip,
  Pencil,
  Plus,
  Puzzle,
  RefreshCw,
  Search,
  Server,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Square,
  SquarePen,
  SquareTerminal,
  Trash2,
  User,
  X,
  Zap,
} from "lucide-react";
import logoUrl from "../output/北辰标志_极简漩涡聚焦版_v10.png";
import { shouldUseLightRoute } from "./autoRouter";
import { applyAssistantStreamEvent } from "./liveMessage";
import { textFromContent } from "./messageUtils";
import { buildConversationEntries, reasoningDispositionForMessage, thinkingBlocksFromContent } from "./reasoningView";
import { accumulateReportedTokens, CUSTOM_API_PRESETS, extensionDialogInitialValue, isNearScrollBottom, isSilentProfileActive, isTerminalBackendStatus, remainingCustomApiPresets, shouldResetBackendBeforeNewSession, shouldRestoreFullRouteBeforePrompt, shouldSubmitComposer, surfaceSwitchRestartPatch, tokenSegmentWidth, workspaceLabel, type CustomApiPreset } from "./uiUtils";
import type {
  AgentMessage,
  Attachment,
  AuthPromptRequest,
  BootstrapData,
  ContentBlock,
  CustomApiInfo,
  CustomApiInput,
  ExtensionDialog,
  ModelInfo,
  PerformanceProfile,
  PiCommandInfo,
  ProfileId,
  ProviderInfo,
  SessionInfo,
  SurfaceMode,
  ToolRun,
  VisualTheme,
  Locale,
  MessageUsage,
  SessionStats,
  WindowConfig,
} from "./types";

const THINKING_ORDER = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
const MAX_ATTACHMENTS = 4;

const PROFILE_ICONS: Record<ProfileId, typeof BrainCircuit> = {
  codex: BrainCircuit,
  benchmark: FlaskConical,
  efficiency: Zap,
  ultra: Sparkles,
  quantum: Orbit,
  ghost: Ghost,
};

const UI = {
  zh: {
    settings: "设置",
    general: "通用",
    models: "模型与接入",
    plugins: "插件与技能",
    performance: "性能模式",
    guide: "使用说明",
    guideTitle: "模式与功能使用说明",
    guideIntro: "这里说明每种工作模式和性能模式的真实行为、适用范围与权衡。所有模式都向用户实时展示模型返回的完整 thinking；右侧大括号会标出模型后续上下文实际采用的压缩摘要或删除状态。",
    modeComparison: "模式快速对比",
    detailedModes: "逐项详细说明",
    suitableFor: "适合",
    notSuitableFor: "不适合",
    actualBehavior: "实际行为",
    tradeoffs: "代价与权衡",
    switchAdvice: "切换建议",
    newTask: "新任务",
    searchTasks: "搜索任务",
    perfLab: "性能实验室",
    workspace: "工作区",
    tasks: "任务",
    newWindow: "新窗口",
    chooseModel: "选择模型",
    modelSelector: "模型",
    thinkingStrength: "思考强度",
    freeThinking: "自由选择思考强度",
    ask: "询问北辰 Pi",
    workIn: "中工作",
    attach: "添加图片",
    attachmentLimit: "最多可添加 4 张图片；超出的图片未添加。",
    attachmentReadError: "部分图片读取失败，未能添加。",
    voice: "语音输入（即将推出）",
    stop: "停止",
    contextReady: "上下文就绪",
    compacting: "正在压缩上下文",
    context: "上下文",
    tokenRate: "token 速率",
    justNow: "刚刚",
    minutesAgo: "分钟前",
    hoursAgo: "小时前",
    chatEmpty: "有什么可以帮忙的？",
    codexEmpty: "你想构建什么？",
    chatEmptySub: "自然对话、分析与创作；需要修改项目时可切换到 Codex。",
    codexEmptySub: "描述目标，北辰 Pi 会在当前工作区中直接执行。",
    suggestionChat1: "解释一个复杂概念",
    suggestionChat2: "帮我完善这段文字",
    suggestionChat3: "分析一个方案的利弊",
    suggestionCode1: "扫描项目并给出改进建议",
    suggestionCode2: "实现一个完整功能并运行测试",
    suggestionCode3: "定位当前错误并修复",
    workspaceWindows: "工作目录与窗口",
    workspaceWindowsDesc: "每个窗口拥有独立的 Pi 进程、模型、推理强度和会话状态。",
    currentWorkspace: "当前工作目录",
    change: "更改",
    independentWindow: "新建独立窗口",
    independentWindowDesc: "允许不同项目同时使用不同模型",
    uiEngine: "界面引擎",
    connected: "已连接",
    appearance: "外观",
    appearanceTab: "外观与风格",
    appearanceDesc: "极简 Codex、水墨与原赛博科技版可即时切换。",
    appearanceTitle: "选择界面风格",
    appearanceHelp: "选择后立即生效，并在下次启动时保持。所有风格只改变视觉，不影响模型、提示词、会话或性能模式。",
    themeCodex: "极简 Codex",
    themeInk: "水墨",
    themeCyber: "赛博科技",
    themeWuxia: "武林剑客",
    themeNekomimi: "温柔猫娘",
    themeCream: "奶油治愈",
    themeMidnight: "星夜玻璃",
    descCodex: "克制、扁平，接近 Codex 桌面端",
    descInk: "宣纸、墨晕与留白",
    descCyber: "紫色辉光与科技质感",
    descWuxia: "暗夜江湖、远山与剑客",
    descNekomimi: "柔粉暖光与温柔猫耳少女",
    descCream: "奶油暖色、自然低疲劳",
    descMidnight: "深蓝星夜与轻玻璃质感",
    modelAccess: "模型与接入",
    modelAccessDesc: "可使用 API Key，也可通过 Pi OAuth 登录会员订阅。凭据不会进入聊天记录。",
    customApiTitle: "自定义 API",
    customApiDesc: "接入 OpenAI、Anthropic、Google 兼容接口或本地模型服务。密钥由 Windows 系统加密保存。",
    addCustomApi: "添加自定义 API",
    editCustomApi: "编辑接入",
    customApiEmpty: "还没有自定义 API。可接入中转站、Ollama、LM Studio、vLLM 或企业代理。",
    customApiName: "接入名称",
    apiBaseUrl: "API 基础地址",
    apiProtocol: "接口协议",
    apiKey: "API Key",
    noApiKey: "本地服务无需密钥",
    modelId: "模型 ID",
    modelName: "显示名称",
    reasoningModel: "支持思考 / reasoning",
    imageSupport: "支持图片输入",
    extendedThinking: "支持 Extra High 与 Max",
    thinkingProtocol: "思考参数格式",
    developerRole: "支持 developer role",
    authHeader: "强制 Authorization: Bearer",
    saveAndApply: "保存并应用到当前窗口",
    encryptedKey: "Windows 加密密钥",
    keylessApi: "无密钥本地服务",
    customApiSaved: "自定义 API 已保存并应用",
    customApiDeleted: "自定义 API 已删除",
    customApiPreset: "快速接入",
    customApiPresetHint: "预设已填好地址与模型，填入 API Key 保存即可使用。",
    advancedCompatibility: "模型能力与兼容性",
    subscription: "会员订阅",
    provider: "服务商",
    modelCount: "个模型",
    noProvider: "当前没有支持此接入方式的服务商。",
    notConnected: "尚未连接",
    localCredential: "凭据仅保存在本机",
    disconnect: "断开",
    connectSubscription: "连接订阅",
    configureApi: "配置 API Key",
    windowModel: "当前窗口模型",
    applyWindow: "应用到当前窗口",
    pluginTitle: "插件、技能与提示模板",
    pluginDesc: "内容直接来自当前 Pi 运行时；点击即可插入对应斜杠命令。",
    openPiRoot: "打开 Pi 资源目录",
    noPlugins: "尚未发现插件命令。把扩展或技能放入 Pi 资源目录后重启窗口即可。",
    perfTitle: "Codex 性能模式",
    perfDesc: "性能模式只改变执行、反馈和回合完成后的上下文策略；当前回合始终按你选择的模型与思考强度完整运行。",
    ghostBoundary: "Ghost Payload 的真实边界",
    ghostBoundaryDesc: "只在回合完成后剔除其思考块；当前思考、工具链签名、最终结果及 Pi 原生自动压缩都完整保留。",
    cancel: "取消",
    confirm: "确认",
    continue: "继续",
    pluginRequest: "插件请求",
    silentWorking: "正在静默执行",
    style: "主题",
    language: "语言",
    tokenDashboard: "Token 完整仪表",
    contextUsed: "上下文已用",
    contextLimit: "上下文上限",
    contextRemaining: "上下文剩余",
    sessionTokens: "会话累计 Token",
    latestResponse: "最近一次模型回复",
    currentRun: "当前运行",
    inputTokens: "输入",
    outputTokens: "输出",
    cacheReadTokens: "缓存读取",
    cacheWriteTokens: "缓存写入",
    cacheWrite1hTokens: "1 小时缓存写入",
    reasoningTokens: "推理 Token",
    totalTokens: "总 Token",
    maxOutputTokens: "模型最大输出",
    cacheHitRate: "缓存命中率",
    tokenCost: "累计费用",
    latestCost: "本次费用",
    activity: "消息与工具",
    userMessages: "用户消息",
    assistantMessages: "助手消息",
    toolCalls: "工具调用",
    toolResults: "工具结果",
    totalMessages: "消息总数",
    elapsed: "已运行",
    dataSource: "数据来源",
    providerReported: "服务商实际返回",
    locallyEstimated: "流式本地估算",
    unavailable: "不可用",
    tokensShort: "tokens",
    sessionId: "会话 ID",
    compactionStatus: "上下文压缩",
    active: "进行中",
    idle: "空闲",
    autoEnabled: "自动启用",
    reportedReasoningNote: "仅在服务商返回 reasoning 明细时显示；输出 Token 已包含推理 Token。",
    contextEstimateNote: "上下文为 Pi 用于压缩判断的当前估算；压缩后需等待下一次回复刷新。",
    costNote: "费用来自服务商模型目录与 usage；订阅方案可能不提供货币费用。",
    sessionTotalsNote: "会话累计包含助手消息、工具内模型调用、上下文压缩和分支摘要，因此可能大于当前可见消息之和。",
  },
  en: {
    settings: "Settings",
    general: "General",
    models: "Models & access",
    plugins: "Plugins & skills",
    performance: "Performance",
    guide: "User guide",
    guideTitle: "Modes and feature guide",
    guideIntro: "This page explains every work and performance mode. All modes stream the complete provider-returned thinking to the user; a right brace shows the compressed digest or deletion state actually used in future model context.",
    modeComparison: "Quick comparison",
    detailedModes: "Detailed mode guide",
    suitableFor: "Best for",
    notSuitableFor: "Avoid for",
    actualBehavior: "Actual behavior",
    tradeoffs: "Cost and tradeoffs",
    switchAdvice: "When to switch",
    newTask: "New thread",
    searchTasks: "Search threads",
    perfLab: "Performance lab",
    workspace: "Workspace",
    tasks: "Threads",
    newWindow: "New window",
    chooseModel: "Choose model",
    modelSelector: "Model",
    thinkingStrength: "Thinking",
    freeThinking: "User-selected thinking",
    ask: "Ask Beichen Pi",
    workIn: "Work in",
    attach: "Attach image",
    attachmentLimit: "You can attach up to 4 images; extra images were not added.",
    attachmentReadError: "Some images could not be read and were not added.",
    voice: "Voice input (coming soon)",
    stop: "Stop",
    contextReady: "Context ready",
    compacting: "Compacting context",
    context: "Context",
    tokenRate: "Token rate",
    justNow: "Just now",
    minutesAgo: "m ago",
    hoursAgo: "h ago",
    chatEmpty: "How can I help?",
    codexEmpty: "What do you want to build?",
    chatEmptySub: "Chat, analyze, and create. Switch to Codex whenever the project needs changes.",
    codexEmptySub: "Describe the outcome and Beichen Pi will work directly in this workspace.",
    suggestionChat1: "Explain a complex idea",
    suggestionChat2: "Improve this draft",
    suggestionChat3: "Compare the tradeoffs",
    suggestionCode1: "Review this project and suggest improvements",
    suggestionCode2: "Implement a complete feature and test it",
    suggestionCode3: "Find and fix the current error",
    workspaceWindows: "Workspace & windows",
    workspaceWindowsDesc: "Every window has its own Pi process, model, reasoning level, and session state.",
    currentWorkspace: "Current workspace",
    change: "Change",
    independentWindow: "Open an independent window",
    independentWindowDesc: "Use different models for different projects",
    uiEngine: "Interface engine",
    connected: "Connected",
    appearance: "Appearance",
    appearanceTab: "Appearance & themes",
    appearanceDesc: "Switch instantly between Minimal Codex, Ink Wash, and the original Cyber Tech theme.",
    appearanceTitle: "Choose an interface theme",
    appearanceHelp: "Changes apply instantly and persist across launches. Themes only affect visuals—not models, prompts, sessions, or performance modes.",
    themeCodex: "Minimal Codex",
    themeInk: "Ink Wash",
    themeCyber: "Cyber Tech",
    themeWuxia: "Wuxia Swordsman",
    themeNekomimi: "Gentle Catgirl",
    themeCream: "Creamy Cozy",
    themeMidnight: "Midnight Glass",
    descCodex: "Restrained and flat, close to Codex desktop",
    descInk: "Rice paper, ink bloom, and negative space",
    descCyber: "Violet glow and futuristic texture",
    descWuxia: "Moonlit jianghu, mountains, and a swordsman",
    descNekomimi: "Soft blush light and a gentle cat-eared heroine",
    descCream: "Warm cream, nature, and low visual fatigue",
    descMidnight: "Deep-blue night and subtle glass arcs",
    modelAccess: "Models & access",
    modelAccessDesc: "Use an API key or connect a subscription through Pi OAuth. Credentials never enter chat history.",
    customApiTitle: "Custom API",
    customApiDesc: "Connect OpenAI-, Anthropic-, or Google-compatible endpoints and local model servers. Keys are encrypted by Windows.",
    addCustomApi: "Add custom API",
    editCustomApi: "Edit connection",
    customApiEmpty: "No custom API yet. Connect a gateway, Ollama, LM Studio, vLLM, or a corporate proxy.",
    customApiName: "Connection name",
    apiBaseUrl: "API base URL",
    apiProtocol: "API protocol",
    apiKey: "API key",
    noApiKey: "Local server needs no key",
    modelId: "Model ID",
    modelName: "Display name",
    reasoningModel: "Reasoning model",
    imageSupport: "Image input",
    extendedThinking: "Extra High and Max",
    thinkingProtocol: "Thinking format",
    developerRole: "Developer role support",
    authHeader: "Force Authorization: Bearer",
    saveAndApply: "Save and apply to this window",
    encryptedKey: "Windows-encrypted key",
    keylessApi: "Keyless local server",
    customApiSaved: "Custom API saved and applied",
    customApiDeleted: "Custom API deleted",
    customApiPreset: "Quick setup",
    customApiPresetHint: "The preset fills in the endpoint and model — just add your API key and save.",
    advancedCompatibility: "Model capabilities & compatibility",
    subscription: "Subscription",
    provider: "Provider",
    modelCount: "models",
    noProvider: "No provider supports this access method.",
    notConnected: "Not connected",
    localCredential: "Credentials stay on this device",
    disconnect: "Disconnect",
    connectSubscription: "Connect subscription",
    configureApi: "Configure API key",
    windowModel: "Model for this window",
    applyWindow: "Apply to this window",
    pluginTitle: "Plugins, skills & prompt templates",
    pluginDesc: "Loaded from the active Pi runtime. Click an entry to insert its slash command.",
    openPiRoot: "Open Pi resources",
    noPlugins: "No plugin commands found. Add extensions or skills to the Pi resources folder and restart.",
    perfTitle: "Codex performance modes",
    perfDesc: "Performance modes change execution, feedback, and post-turn context handling; the current turn always runs fully at the user-selected model and thinking level.",
    ghostBoundary: "Ghost Payload boundary",
    ghostBoundaryDesc: "Removes reasoning only after a turn completes, while preserving current reasoning, active tool signatures, final evidence, and Pi-native auto-compaction.",
    cancel: "Cancel",
    confirm: "Confirm",
    continue: "Continue",
    pluginRequest: "Plugin request",
    silentWorking: "Working silently",
    style: "Theme",
    language: "Language",
    tokenDashboard: "Complete token telemetry",
    contextUsed: "Context used",
    contextLimit: "Context limit",
    contextRemaining: "Context remaining",
    sessionTokens: "Session token totals",
    latestResponse: "Latest model response",
    currentRun: "Current run",
    inputTokens: "Input",
    outputTokens: "Output",
    cacheReadTokens: "Cache read",
    cacheWriteTokens: "Cache write",
    cacheWrite1hTokens: "1-hour cache write",
    reasoningTokens: "Reasoning tokens",
    totalTokens: "Total tokens",
    maxOutputTokens: "Model max output",
    cacheHitRate: "Cache hit rate",
    tokenCost: "Accumulated cost",
    latestCost: "Response cost",
    activity: "Messages & tools",
    userMessages: "User messages",
    assistantMessages: "Assistant messages",
    toolCalls: "Tool calls",
    toolResults: "Tool results",
    totalMessages: "Total messages",
    elapsed: "Elapsed",
    dataSource: "Data source",
    providerReported: "Provider reported",
    locallyEstimated: "Locally estimated while streaming",
    unavailable: "Unavailable",
    tokensShort: "tokens",
    sessionId: "Session ID",
    compactionStatus: "Context compaction",
    active: "Active",
    idle: "Idle",
    autoEnabled: "Auto enabled",
    reportedReasoningNote: "Shown only when the provider reports a reasoning breakdown; output tokens already include reasoning tokens.",
    contextEstimateNote: "Context is Pi's current estimate used for compaction. It refreshes after the next response following compaction.",
    costNote: "Cost comes from provider model metadata and usage. Subscription plans may not expose monetary cost.",
    sessionTotalsNote: "Session totals include assistant messages, model work reported by tools, compaction, and branch summaries, so they may exceed visible-message totals.",
  },
} as const;

type UIKey = keyof typeof UI.zh;
type Translate = (key: UIKey) => string;

function profileSubtitle(id: ProfileId, locale: Locale) {
  const subtitles: Record<ProfileId, [string, string]> = {
    codex: ["精简 Pi Codex", "Compact Pi Codex"],
    benchmark: ["极致跑分与严苛验证", "Maximum benchmark performance"],
    efficiency: ["低延迟高吞吐", "Low latency and high throughput"],
    ultra: ["精简静默执行", "Compact silent execution"],
    quantum: ["回合后思考压缩", "Post-turn reasoning compression"],
    ghost: ["回合后思考剔除", "Post-turn reasoning removal"],
  };
  return subtitles[id][locale === "zh" ? 0 : 1];
}

interface ModeGuideEntry {
  id: string;
  name: string;
  category: string;
  summary: string;
  facts: Array<[string, string]>;
  behavior: string[];
  suitable: string[];
  avoid: string[];
  tradeoffs: string[];
  switchAdvice: string;
}

const MODE_GUIDE: Record<Locale, ModeGuideEntry[]> = {
  zh: [
    {
      id: "chatgpt",
      name: "ChatGPT",
      category: "工作模式",
      summary: "面向问答、写作、解释和方案讨论的通用对话模式。它保留模型推理能力，但主动关闭 Pi 的内置文件修改工具，避免普通对话误触项目。",
      facts: [["思考强度", "自由选择"], ["中间过程", "可见"], ["工具", "关闭内置工具"], ["项目写入", "不会主动修改"]],
      behavior: [
        "启动独立的通用对话提示词，不向模型暴露 read、PowerShell、edit、write、grep、find、ls 等内置项目工具。",
        "仍然保留当前会话、模型、图片输入和 Markdown 渲染；切回 Codex 后可以继续同一段对话。",
        "输入框下方可以随时切换模型和该模型支持的思考强度；切换工作模式不会重置选择。",
        "模型返回 thinking 时会实时完整展示；工作模式只改变工具和上下文行为，不再隐藏用户侧思考视图。",
        "不会因为界面叫 ChatGPT 就自动获得 ChatGPT 网页版的专有工具、记忆或订阅能力，实际能力由当前 Pi 服务商和模型决定。",
      ],
      suitable: ["需求澄清、头脑风暴和技术解释", "文案、总结、翻译和结构化分析", "在改代码前讨论架构、边界和验收标准"],
      avoid: ["需要读取仓库真实文件的审查", "需要执行命令、改代码或运行测试的任务", "需要插件依赖项目文件或 Codex 工具上下文的工作"],
      tradeoffs: ["安全、干净、低副作用，但无法真正完成文件级交付", "复杂开发问题只能给建议，不能验证磁盘上的实际结果"],
      switchAdvice: "当回复开始出现“你可以运行”“建议修改某文件”但没有实际执行时，切换到 Codex。",
    },
    {
      id: "codex",
      name: "CODEX",
      category: "标准性能模式",
      summary: "把精简后的 Pi 核心提示词、工具、技能、扩展和会话能力包装成 Codex 式桌面代理，是日常项目工作的默认档。",
      facts: [["核心提示词", "精简 Pi 契约"], ["中间过程", "稀疏可见"], ["工具", "完整启用"], ["Pi 默认压缩", "保持启用"]],
      behavior: [
        "加载当前工作目录、项目说明、技能、扩展和 read/PowerShell/edit/write/grep/find/ls 工具。",
        "基础系统提示只保留目标、工具策略、安全边界、验证和最终交付要求，减少每次请求的固定上下文。",
        "只显示稀疏且有用的里程碑、工具调用和结果，便于观察并在必要时停止。",
        "thinking 通过独立面板实时完整输出，默认展开且可以收起。",
        "性能档不会修改思考强度。输入框下方只列出当前模型真实支持的档位，并显示最终生效值。",
      ],
      suitable: ["绝大多数功能开发、修 bug 和重构", "需要边做边观察的测试与排错", "中等长度、多轮但不需要极限推理的项目任务"],
      avoid: ["只需要一句答案的低延迟请求", "希望完全静默直到结束的长任务", "以极限质量跑评测、允许显著增加延迟和成本的场景"],
      tradeoffs: ["进度透明，但中间文本会占用界面空间", "速度、推理 token 与费用主要由你选择的模型和思考强度决定"],
      switchAdvice: "不知道选哪档时先用 CODEX；只有出现明确的质量、速度或上下文问题再切换。",
    },
    {
      id: "benchmark",
      name: "BENCHMARK",
      category: "极致跑分模式",
      summary: "专门用于跑分、评测和极限性能验证。提示词围绕真实评分目标、可复现基线、测量瓶颈、边界样例和最终证据组织。",
      facts: [["目标", "跑分最大化"], ["过程反馈", "可见"], ["思考强度", "自由选择/建议 Max"], ["Pi 默认压缩", "保持启用"]],
      behavior: [
        "先识别评分规则和真实测量目标，再建立可复现基线、定位瓶颈并针对性优化。",
        "覆盖代表性样例、边界条件和反例，禁止通过破坏实际体验来刷虚假分数。",
        "跑分过程中完整 thinking 同样实时可见，便于检查模型是否真正完成推导。",
        "若追求质量上限可手动选择 Max；若需要严格控制变量，也可固定任意共同支持的档位做 A/B 对比。",
      ],
      suitable: ["模型/提示词 A-B 评测", "性能优化和基准测试", "需要完整证据链、边界测试和复现步骤的极限验证"],
      avoid: ["普通日常开发", "对首 token 延迟敏感的互动", "预算或调用配额严格受限的工作"],
      tradeoffs: ["基线、测量和严苛验证会增加工具调用与墙钟时间", "最高分策略不保证对所有模型和任务都有效，必须以真实指标判断"],
      switchAdvice: "只有任务目标就是跑分、评测、极限优化或严苛对比时使用；普通开发使用 CODEX。",
    },
    {
      id: "ultra",
      name: "ULTRA MAX",
      category: "精简静默模式",
      summary: "使用与 CODEX 相同的精简 Pi 提示词和完整能力，但执行时埋头工作，不输出进度、状态、工具摘要或推测性半成品。",
      facts: [["当前思考", "完整执行"], ["用户视图", "thinking 实时/进度隐藏"], ["最终输出", "结束后一次显示"], ["Pi 默认压缩", "保持启用"]],
      behavior: [
        "模型仍按手动档位完整思考、调用工具、修改文件和验证；静默绝不等于禁止或削弱思考。",
        "提示词要求模型省略进度叙述，界面隐藏中间进度文字和工具时间线，但完整 thinking 仍实时展示。",
        "任务完成后只显示该回合最终回答；减少的进度输出会降低输出 token 和后续上下文负担。",
        "它不处理历史 thinking；上下文仍由 Pi 原生自动压缩管理。",
      ],
      suitable: ["可以离开电脑等待的复杂实现", "希望避免进度文字干扰的长任务", "难度高且最终结果比互动速度更重要的任务"],
      avoid: ["需要实时观察并随时纠偏的操作", "可能触发需要人工确认的扩展工作流", "短问答或对延迟敏感的任务"],
      tradeoffs: ["界面最安静、叙述 token 更少，但可观察性最低；方向错误时更晚才能发现", "提升主要来自精简提示与取消反馈，不会凭空提高服务商的模型解码速度"],
      switchAdvice: "任务定义、权限边界和验收标准已经明确，并且你只关心最终交付时使用。",
    },
    {
      id: "quantum",
      name: "QUANTUM COLLAPSE",
      category: "回合后思考压缩模式",
      summary: "在 ULTRA MAX 基础上，当前回合先完整思考并产出结果；从下一次请求开始，才把已完成回合的 thinking 压缩成短摘要。",
      facts: [["当前回合思考", "完整保留"], ["用户视图", "完整 thinking + 压缩摘要"], ["额外模型调用", "没有"], ["Pi 默认压缩", "叠加保留"]],
      behavior: [
        "运行中与 ULTRA MAX 完全一致：按所选强度完整思考、正常使用工具、静默到最终结果。",
        "回合完成后，下一次构建模型上下文时才将该回合 thinking 本地提取为最多约 480 字符的 reasoning digest。",
        "用户始终看到原始完整 thinking；完成后右侧大括号标记“已压缩”，并显示模型下一轮实际看到的 digest。",
        "摘要优先保留开端、结论、根因、验证和下一步；最终回答、用户消息和工具证据保持原样。",
        "处理不产生额外模型调用，也不触发整段 compact；Pi 原生自动压缩继续独立运行。",
      ],
      suitable: ["持续数十轮的长期重构和大型功能", "thinking 很长但仍希望保留关键推理线索的会话", "希望减轻后续输入又不想完全删除旧思考的工作"],
      avoid: ["短会话", "必须逐字保留完整历史 thinking 的审计场景", "后续步骤高度依赖旧思考每个细节的研究任务"],
      tradeoffs: ["比 Ultra 上下文更轻、比 Ghost 保留更多推理线索", "本地提取摘要不可避免会丢失探索细节，但不会影响已经完成的当前回合"],
      switchAdvice: "长会话里 reasoning 开始占据大量上下文，但仍希望保留结论线索时使用。",
    },
    {
      id: "ghost",
      name: "GHOST PAYLOAD",
      category: "旧思考卸载模式",
      summary: "在 ULTRA MAX 基础上，当前回合照常完整思考并产出结果；从下一次请求开始，已完成回合的 thinking 直接不再进入模型上下文。",
      facts: [["当前回合思考", "完整保留"], ["用户视图", "完整 thinking + 删除标记"], ["最终/工具证据", "保留"], ["Pi 默认压缩", "叠加保留"]],
      behavior: [
        "运行中与 ULTRA MAX 完全一致，不会阻止、缩短或降低当前回合思考。",
        "只在下一次请求构建上下文时删除已完成回合的 thinking，不修改保存的会话文件。",
        "用户始终看到原始完整 thinking；完成后右侧大括号标记“已删除”，提醒模型下一轮不再携带它。",
        "当前工具循环的思考签名和调用保持原样，避免破坏服务商函数调用连续性。",
        "最终回答、用户消息、工具证据以及 Pi 原生自动压缩全部保留。",
        "它不能让服务商已经生成的 reasoning token 免费，也不能突破上下文、配额或计费规则。",
      ],
      suitable: ["多轮会话中旧思考很长但最终结论足够明确", "希望降低后续上下文输入载荷", "对最终证据和工具结果比探索过程更重视的任务"],
      avoid: ["后续步骤依赖很早的隐含推理线索", "研究型讨论需要保留完整思维演进", "误以为该模式可以免除已生成 token 费用的场景"],
      tradeoffs: ["输入上下文更轻，但可能失去旧回合中未写入最终答案的细微假设", "每个新回合仍会按当前手动档位生成新的推理 token"],
      switchAdvice: "圆环增长主要来自多轮 reasoning，而目标、决策和证据已经稳定时使用；发现模型忘记隐含前提时改用 Quantum 或 CODEX。",
    },
  ],
  en: [],
};

const EN_MODE_GUIDE_DETAILS: Record<string, Pick<ModeGuideEntry, "facts" | "behavior" | "suitable" | "avoid" | "tradeoffs" | "switchAdvice">> = {
  chatgpt: {
    facts: [["Thinking", "User selected"], ["Progress", "Visible"], ["Tools", "Built-in tools off"], ["Project writes", "No direct mutation"]],
    behavior: ["Uses a general conversation prompt without exposing Pi's read, shell, edit, write, grep, find, or ls tools.", "Keeps the selected model, session, image input, and Markdown rendering; the same conversation can continue after switching to Codex.", "Model and supported thinking level can be changed below the composer without changing work mode.", "Provider-returned thinking streams in full to the user in every mode.", "The label does not grant proprietary ChatGPT web features—the effective capabilities still come from the configured Pi provider and model."],
    suitable: ["Clarifying requirements and brainstorming", "Writing, summarization, translation, and explanation", "Discussing architecture and acceptance criteria before implementation"],
    avoid: ["Repository-grounded review", "Tasks that must run commands, change files, or verify builds", "Project plugins that depend on Codex tools"],
    tradeoffs: ["Clean and low-risk, but cannot finish file-level delivery", "Can recommend changes without being able to validate the real workspace"],
    switchAdvice: "Switch to Codex when the answer starts describing commands or file changes instead of performing them.",
  },
  codex: {
    facts: [["Core prompt", "Compact Pi contract"], ["Progress", "Sparse and visible"], ["Tools", "Full toolset"], ["Pi compaction", "Still enabled"]],
    behavior: ["Wraps Pi's workspace, project instructions, skills, extensions, and full file/shell toolset as a Codex-style desktop agent.", "Keeps the fixed system contract small: outcome, tools, safety boundaries, verification, and handoff.", "Shows only useful milestones and tool evidence while streaming complete thinking in a separate panel.", "The profile never changes thinking; the composer reports the current model's real supported levels."],
    suitable: ["Most feature work, bug fixes, and refactors", "Testing and debugging that benefits from visible progress", "Medium-length multi-turn project tasks"],
    avoid: ["One-line latency-sensitive answers", "Long jobs where only the final outcome matters", "Evaluation work that explicitly needs maximum exploration"],
    tradeoffs: ["Transparent but visually busier", "Latency, reasoning-token use, and cost primarily follow the selected model and thinking level"],
    switchAdvice: "Start here when uncertain; change modes only after identifying a concrete quality, speed, or context problem.",
  },
  benchmark: {
    facts: [["Goal", "Maximum real score"], ["Progress", "Visible"], ["Thinking", "User selected / Max advised"], ["Pi compaction", "Still enabled"]],
    behavior: ["Identifies the scoring target, establishes a reproducible baseline, measures the bottleneck, and optimizes it directly.", "Tests representative and adversarial cases without gaming a synthetic metric at the expense of real usability.", "Streams complete thinking so benchmark work can be audited.", "Choose Max manually for ceiling tests, or hold a commonly supported level constant for controlled A/B comparisons."],
    suitable: ["Model and prompt A/B evaluations", "Performance optimization and benchmarks", "Extreme validation requiring reproducible evidence"],
    avoid: ["Ordinary daily development", "Fast conversational iteration", "Work under strict token or quota limits"],
    tradeoffs: ["Baseline, measurement, and adversarial validation increase tool calls and wall time", "A highest-score strategy must still be judged by the actual metric"],
    switchAdvice: "Use only when the objective is benchmarking, scoring, extreme optimization, or controlled comparison; use Codex for normal work.",
  },
  ultra: {
    facts: [["Current reasoning", "Fully executed"], ["User view", "Live thinking / progress hidden"], ["Final output", "Shown once settled"], ["Pi compaction", "Still enabled"]],
    behavior: ["Uses the same compact Pi contract and full capabilities as Codex.", "The model reasons at the selected level, uses tools, edits, and validates normally; silence never disables or weakens thinking.", "The UI hides intermediate progress prose and tools but streams complete thinking, then shows only the turn's final answer.", "It does not alter stored reasoning; Pi-native auto-compaction remains responsible for ordinary history management."],
    suitable: ["Complex jobs that can run unattended", "Long tasks where progress narration is distracting", "Quality-first tasks with a clear specification"],
    avoid: ["Work requiring frequent intervention", "Approval-heavy extension flows", "Short or latency-sensitive questions"],
    tradeoffs: ["Less narration output and future context, but the least observability", "The gain comes from a compact prompt and no feedback; it cannot change the provider's raw decode speed"],
    switchAdvice: "Use only after the objective, authority boundaries, and acceptance criteria are explicit.",
  },
  quantum: {
    facts: [["Current-turn reasoning", "Fully preserved"], ["User view", "Full thinking + digest"], ["Extra model call", "None"], ["Pi compaction", "Still enabled"]],
    behavior: ["Runs like Ultra Max while streaming complete thinking to the user.", "Only when the next request is built does the harness replace completed thinking with a local extractive digest of roughly 480 characters or less.", "A right brace keeps the original full thinking visible beside the exact digest the model sees next.", "The digest favors beginnings, conclusions, root causes, validation, and next actions while retaining final answers and tool evidence unchanged.", "It never invokes whole-history compact; Pi-native auto-compaction continues independently on top."],
    suitable: ["Long-running refactors and large features", "Sessions with long reasoning where key clues should survive", "Reducing future input without deleting all prior reasoning"],
    avoid: ["Short sessions", "Audits requiring verbatim historical thinking", "Research that depends on every exploratory detail"],
    tradeoffs: ["Lighter than Ultra while retaining more reasoning clues than Ghost", "Extractive compression loses some detail but never changes the already completed turn"],
    switchAdvice: "Use when completed reasoning is consuming context but its conclusions should remain available.",
  },
  ghost: {
    facts: [["Current-turn reasoning", "Fully preserved"], ["User view", "Full thinking + deletion marker"], ["Final/tool evidence", "Preserved"], ["Pi compaction", "Still enabled"]],
    behavior: ["Runs like Ultra Max while streaming complete thinking to the user and never weakens current reasoning.", "Only when the next request is built does it remove thinking from completed turns; stored session history is unchanged.", "A right brace marks the original full thinking as deleted from future model context.", "Preserves current tool-loop signatures, user messages, final answers, tool evidence, and Pi-native auto-compaction.", "Does not make generated reasoning free or bypass context and billing limits."],
    suitable: ["Long multi-turn sessions where old reasoning dominates input", "Reducing future context payload after decisions stabilize", "Tasks that value final evidence over exploratory thought"],
    avoid: ["Research depending on early implicit assumptions", "Work that must preserve the complete evolution of reasoning", "Any expectation of eliminating already generated token charges"],
    tradeoffs: ["Lighter future input with a risk of losing assumptions never written into final answers", "Every new turn can still generate fresh reasoning tokens at the manually selected level"],
    switchAdvice: "Use when objectives and decisions are stable; return to Quantum or Codex if the model forgets implicit premises.",
  },
};

MODE_GUIDE.en = MODE_GUIDE.zh.map((entry) => ({
  ...entry,
  category: entry.id === "chatgpt" ? "Work mode" : "Performance mode",
  summary: ({
    chatgpt: "General conversation mode for questions, writing, explanation, and planning. Pi's built-in file mutation tools are disabled to avoid project side effects.",
    codex: "A Codex-style desktop agent built from Pi's full runtime and a compact core prompt, with sparse visible progress and Pi-native compaction.",
    benchmark: "A dedicated maximum-score mode organized around the real metric, reproducible baselines, measured bottlenecks, adversarial cases, and exact evidence.",
    ultra: "The compact Pi contract with full current reasoning and tools, but no progress feedback; only the settled final answer is shown.",
    quantum: "Ultra Max plus post-turn reasoning compression: completed thinking becomes a small local digest before future requests, while Pi compaction remains enabled.",
    ghost: "Ultra Max plus post-turn reasoning removal: completed thinking is omitted from future requests while current reasoning, final evidence, and Pi compaction remain intact.",
  } as Record<string, string>)[entry.id],
  ...EN_MODE_GUIDE_DETAILS[entry.id],
}));

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retry<T>(work: () => Promise<T>, attempts = 5): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await work();
    } catch (error) {
      lastError = error;
      await sleep(350 + attempt * 250);
    }
  }
  throw lastError;
}

function thinkingFromContent(content: AgentMessage["content"]): string {
  return thinkingBlocksFromContent(content).join("\n\n");
}

function toolCallsFromContent(content: AgentMessage["content"]): ContentBlock[] {
  if (!Array.isArray(content)) return [];
  return content.filter((block) => block.type === "toolCall");
}

function formatContextWindow(value?: number) {
  if (!value) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value % 1_000_000 ? 1 : 0)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(value);
}

function formatPercent(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value > 0 && value < 1) return value.toFixed(2);
  if (value < 10) return value.toFixed(1);
  return String(Math.round(value));
}

function formatRelativeTime(timestamp: number, locale: Locale) {
  const delta = Date.now() - timestamp;
  if (delta < 60_000) return UI[locale].justNow;
  if (delta < 3_600_000) return locale === "zh" ? `${Math.floor(delta / 60_000)} ${UI.zh.minutesAgo}` : `${Math.floor(delta / 60_000)}${UI.en.minutesAgo}`;
  if (delta < 86_400_000) return locale === "zh" ? `${Math.floor(delta / 3_600_000)} ${UI.zh.hoursAgo}` : `${Math.floor(delta / 3_600_000)}${UI.en.hoursAgo}`;
  return new Date(timestamp).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric" });
}

function sortThinkingLevels(levels: string[]) {
  return [...new Set(levels)].sort((left, right) => {
    const leftIndex = THINKING_ORDER.indexOf(left);
    const rightIndex = THINKING_ORDER.indexOf(right);
    return (leftIndex < 0 ? THINKING_ORDER.length : leftIndex) - (rightIndex < 0 ? THINKING_ORDER.length : rightIndex);
  });
}

function thinkingLabel(level: string, locale: Locale) {
  const labels: Record<string, [string, string]> = {
    off: ["关闭", "Off"],
    minimal: ["极低", "Minimal"],
    low: ["低", "Low"],
    medium: ["中", "Medium"],
    high: ["高", "High"],
    xhigh: ["超高", "Extra high"],
    max: ["极高", "Max"],
  };
  return labels[level]?.[locale === "zh" ? 0 : 1] || level;
}

function modelOptionValue(model: Pick<ModelInfo, "provider" | "id">) {
  return `${encodeURIComponent(model.provider)}::${encodeURIComponent(model.id)}`;
}

function stringifyCompact(value: unknown) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? "");
  }
}

function estimateTokenCount(text: string) {
  const cjk = (text.match(/[\u3400-\u9fff\uf900-\ufaff]/g) || []).length;
  const remaining = Math.max(0, text.length - cjk);
  return cjk * 0.95 + remaining / 4;
}

function friendlyModelError(raw: unknown, locale: Locale) {
  const value = String(raw || "模型请求失败");
  if (/RESOURCE_EXHAUSTED|quota exceeded|current quota/i.test(value)) {
    return locale === "zh" ? "模型配额已用尽（429）。请在“设置 → 模型与接入”中切换 API、会员订阅或其他可用模型，然后重试。" : "Model quota exhausted (429). Switch the API, subscription, or model in Settings → Models & access.";
  }
  if (/unauthorized|invalid api key|authentication|401/i.test(value)) {
    return locale === "zh" ? "模型认证失败（401）。请重新连接 API 或会员订阅。" : "Model authentication failed (401). Reconnect the API or subscription.";
  }
  if (/permission.?denied|denied access|forbidden|403/i.test(value)) {
    return locale === "zh" ? "当前 API 项目被服务商拒绝访问（403）。请切换到有权限的 API 项目、会员订阅或其他服务商。" : "The provider denied this API project (403). Switch to an authorized API project, subscription, or provider.";
  }
  if (/model.+no longer available|not found|404/i.test(value)) {
    return locale === "zh" ? "所选模型已不可用（404）。请在模型与接入设置中切换到服务商当前支持的模型。" : "The selected model is unavailable (404). Choose a currently supported model.";
  }
  if (/rate.?limit|too many requests|429/i.test(value)) {
    return locale === "zh" ? "请求触发服务商限流（429）。请稍后重试或切换模型。" : "The provider rate-limited this request (429). Retry later or switch models.";
  }
  return value.length > 500 ? `${value.slice(0, 500)}…` : value;
}

function compactProfileLabel(profile: PerformanceProfile | undefined) {
  if (!profile) return "—";
  if (profile.id === "codex") return "Codex";
  if (profile.id === "benchmark") return "Benchmark";
  if (profile.id === "ultra") return "Ultra";
  if (profile.id === "quantum") return "Quantum";
  if (profile.id === "ghost") return "Ghost";
  return profile.label;
}

function ContextModeSlider({
  profiles,
  current,
  onCommit,
  busy,
  locale,
}: {
  profiles: PerformanceProfile[];
  current: ProfileId;
  onCommit: (profile: ProfileId) => void;
  busy: boolean;
  locale: Locale;
}) {
  const currentIndex = Math.max(0, profiles.findIndex((profile) => profile.id === current));
  const [draftIndex, setDraftIndex] = useState(currentIndex);
  useEffect(() => setDraftIndex(currentIndex), [currentIndex]);
  const draft = profiles[draftIndex] || profiles[0];
  const progress = profiles.length > 1 ? (draftIndex / (profiles.length - 1)) * 100 : 0;
  const violet = ["ultra", "quantum", "ghost"].includes(draft?.id || "");
  const commit = () => {
    const profile = profiles[draftIndex];
    if (profile && profile.id !== current && !busy) onCommit(profile.id);
  };

  return (
    <div className={`context-mode-slider ${violet ? "is-violet" : "is-blue"}`}>
      <div className="context-mode-slider-head">
        <span>{locale === "zh" ? "上下文模式" : "Context mode"}</span>
        <strong>{compactProfileLabel(draft)}</strong>
        <Zap size={15} />
      </div>
      <div className="context-mode-track">
        <div className="context-mode-fill" style={{ width: `${progress}%` }} />
        {violet ? (
          <div className="context-mode-stars" style={{ width: `calc(${progress}% + 21px)` }} aria-hidden="true">
            {Array.from({ length: 13 }, (_, index) => <i key={index} />)}
          </div>
        ) : null}
        <div className="context-mode-dots" aria-hidden="true">
          {profiles.map((profile, index) => <i key={profile.id} className={index <= draftIndex ? "active" : ""} />)}
        </div>
        <input
          aria-label={locale === "zh" ? "上下文模式" : "Context mode"}
          type="range"
          min={0}
          max={Math.max(0, profiles.length - 1)}
          step={1}
          value={draftIndex}
          disabled={busy}
          onChange={(event) => setDraftIndex(Number(event.target.value))}
          onPointerUp={commit}
          onKeyUp={commit}
        />
      </div>
      <div className="context-mode-footer">
        <span>{draft ? profileSubtitle(draft.id, locale) : ""}</span>
        <div>
          {profiles.map((profile, index) => (
            <button
              key={profile.id}
              className={index === draftIndex ? "active" : ""}
              title={profile.label}
              disabled={busy}
              onClick={() => {
                setDraftIndex(index);
                if (profile.id !== current && !busy) onCommit(profile.id);
              }}
            >
              {compactProfileLabel(profile)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function PerformanceRail({
  profiles,
  current,
  onCommit,
  busy,
  locale,
}: {
  profiles: PerformanceProfile[];
  current: ProfileId;
  onCommit: (profile: ProfileId) => void;
  busy: boolean;
  locale: Locale;
}) {
  return (
    <div className="performance-popover" onClick={(event) => event.stopPropagation()}>
      <ContextModeSlider profiles={profiles} current={current} onCommit={onCommit} busy={busy} locale={locale} />
    </div>
  );
}

function ModelReasoningControl({
  models,
  activeModel,
  configuredModelId,
  thinkingOptions,
  thinkingLevel,
  locale,
  busy,
  onModel,
  onThinking,
  initialOpen = false,
  initialSubmenu,
}: {
  models: ModelInfo[];
  activeModel?: ModelInfo;
  configuredModelId?: string;
  thinkingOptions: string[];
  thinkingLevel: string;
  locale: Locale;
  busy: boolean;
  onModel: (provider: string, modelId: string) => void;
  onThinking: (level: string) => void;
  initialOpen?: boolean;
  initialSubmenu?: "model" | "thinking";
}) {
  const [open, setOpen] = useState(initialOpen);
  const [submenu, setSubmenu] = useState<"model" | "thinking" | null>(initialSubmenu || null);
  const hostRef = useRef<HTMLDivElement>(null);
  const modelName = activeModel?.name || configuredModelId || (locale === "zh" ? "选择模型" : "Choose model");

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!hostRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setSubmenu(null);
      }
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (submenu) setSubmenu(null);
      else setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open, submenu]);

  useEffect(() => {
    if (busy) {
      setOpen(false);
      setSubmenu(null);
    }
  }, [busy]);

  return (
    <div className={`model-reasoning-control ${open ? "open" : ""}`} ref={hostRef}>
      {open ? (
        <div className="model-reasoning-popover">
          <button
            type="button"
            className={`model-config-row ${submenu === "model" ? "emphasized" : ""}`}
            aria-expanded={submenu === "model"}
            onPointerEnter={() => setSubmenu("model")}
            onClick={() => setSubmenu((value) => value === "model" ? null : "model")}
          >
            <span>{locale === "zh" ? "模型" : "Model"}</span>
            <strong>{modelName}</strong>
            <ChevronRight size={16} />
          </button>
          <button
            type="button"
            className={`model-config-row ${submenu === "thinking" ? "emphasized" : ""}`}
            aria-expanded={submenu === "thinking"}
            onPointerEnter={() => setSubmenu("thinking")}
            onClick={() => setSubmenu((value) => value === "thinking" ? null : "thinking")}
          >
            <span>{locale === "zh" ? "推理强度" : "Reasoning"}</span>
            <strong>{thinkingLabel(thinkingLevel, locale)}</strong>
            <ChevronRight size={16} />
          </button>
          {submenu === "model" ? (
            <div className="model-submenu model-list-submenu" role="listbox" aria-label={locale === "zh" ? "选择模型" : "Choose model"}>
              <header>{locale === "zh" ? "模型" : "Model"}</header>
              <div>
                {models.map((model) => {
                  const active = activeModel?.provider === model.provider && activeModel.id === model.id;
                  return (
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={active ? "active" : ""}
                      key={modelOptionValue(model)}
                      disabled={busy}
                      onClick={() => onModel(model.provider, model.id)}
                    >
                      <span><strong>{model.name}</strong><small>{model.provider}</small></span>
                      {active ? <Check size={17} /> : null}
                    </button>
                  );
                })}
                {!models.length ? <p>{locale === "zh" ? "没有可用模型" : "No available models"}</p> : null}
              </div>
            </div>
          ) : null}
          {submenu === "thinking" ? (
            <div className="model-submenu thinking-list-submenu" role="listbox" aria-label={locale === "zh" ? "选择推理强度" : "Choose reasoning level"}>
              <header>{locale === "zh" ? "推理强度" : "Reasoning"}</header>
              <div>
                {thinkingOptions.map((level) => {
                  const active = level === thinkingLevel;
                  return (
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={active ? "active" : ""}
                      key={level}
                      disabled={busy}
                      onClick={() => onThinking(level)}
                    >
                      <span>
                        <strong>{thinkingLabel(level, locale)}</strong>
                        {level === "max" ? <small>{locale === "zh" ? "模型支持的最高档" : "Highest supported level"}</small> : null}
                      </span>
                      {active ? <Check size={17} /> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      <button
        type="button"
        className="model-summary-pill"
        aria-expanded={open}
        disabled={busy}
        onClick={() => {
          setOpen((value) => !value);
          if (open) setSubmenu(null);
        }}
      >
        <strong>{modelName}</strong>
        <span>{thinkingLabel(thinkingLevel, locale)}</span>
        <ChevronDown size={15} />
      </button>
    </div>
  );
}

function ContextRing({
  percent,
  tokens,
  contextWindow,
  locale,
}: {
  percent: number | null;
  tokens: number | null;
  contextWindow: number | null;
  locale: Locale;
}) {
  const value = Math.max(0, Math.min(100, percent ?? 0));
  const circumference = 2 * Math.PI * 15;
  const dashOffset = circumference * (1 - value / 100);
  const title = `${UI[locale].context}: ${percent == null ? "—" : `${formatPercent(percent)}%`}${tokens != null && contextWindow ? ` · ${formatTokenCount(tokens)} / ${formatTokenCount(contextWindow)}` : ""}`;
  return (
    <div className="context-ring" title={title} aria-label={title}>
      <svg viewBox="0 0 36 36" aria-hidden="true">
        <circle className="context-ring-track" cx="18" cy="18" r="15" />
        <circle
          className="context-ring-value"
          cx="18"
          cy="18"
          r="15"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
      </svg>
      <span>{percent == null ? "·" : formatPercent(percent)}</span>
    </div>
  );
}

function formatTokenCount(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US").format(Math.max(0, Math.round(value)));
}

function formatUsd(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value === 0) return "$0.0000";
  return `$${value < 0.01 ? value.toFixed(5) : value.toFixed(4)}`;
}

function TokenStack({
  values,
}: {
  values: Array<{ value: number; color: string; label: string }>;
}) {
  const total = values.reduce((sum, entry) => sum + Math.max(0, entry.value), 0);
  return (
    <div className="token-stack" aria-label={values.map((entry) => `${entry.label}: ${formatTokenCount(entry.value)}`).join(", ")}>
      {values.map((entry) => (
        <span
          key={entry.label}
          title={`${entry.label}: ${formatTokenCount(entry.value)}`}
          style={{
            width: `${tokenSegmentWidth(entry.value, total)}%`,
            background: entry.color,
          }}
        />
      ))}
    </div>
  );
}

function RateSparkline({ values }: { values: number[] }) {
  const points = values.length > 1 ? values : [0, ...(values || [0])];
  const max = Math.max(1, ...points);
  const polyline = points
    .map((value, index) => `${(index / Math.max(1, points.length - 1)) * 220},${48 - (value / max) * 42}`)
    .join(" ");
  return (
    <svg className="rate-sparkline" viewBox="0 0 220 52" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="rate-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.28" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,52 ${polyline} 220,52`} fill="url(#rate-fill)" />
      <polyline points={polyline} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function TokenInspector({
  stats,
  latestUsage,
  model,
  locale,
  tokenRate,
  runTokens,
  runElapsed,
  rateHistory,
  usageSource,
  thinkingLevel,
  isStreaming,
  isCompacting,
  autoCompactionEnabled,
  open,
  onToggle,
}: {
  stats: SessionStats | null;
  latestUsage?: MessageUsage;
  model?: ModelInfo;
  locale: Locale;
  tokenRate: number;
  runTokens: number;
  runElapsed: number;
  rateHistory: number[];
  usageSource: "reported" | "estimated";
  thinkingLevel: string;
  isStreaming: boolean;
  isCompacting: boolean;
  autoCompactionEnabled: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const t = (key: UIKey) => UI[locale][key];
  const contextWindow = stats?.contextUsage?.contextWindow ?? model?.contextWindow ?? null;
  const contextUsed = stats?.contextUsage?.tokens ?? null;
  const contextPercent = stats?.contextUsage?.percent ?? (contextUsed != null && contextWindow ? (contextUsed / contextWindow) * 100 : null);
  const contextRemaining = contextUsed != null && contextWindow != null ? Math.max(0, contextWindow - contextUsed) : null;
  const percent = Math.max(0, Math.min(100, contextPercent ?? 0));
  const largeCircumference = 2 * Math.PI * 42;
  const sessionTokens = stats?.tokens ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };
  const cacheBase = sessionTokens.input + sessionTokens.cacheRead;
  const cacheHitRate = cacheBase > 0 ? (sessionTokens.cacheRead / cacheBase) * 100 : null;
  const latestCacheBase = (latestUsage?.input || 0) + (latestUsage?.cacheRead || 0);
  const latestCacheHitRate = latestCacheBase > 0 ? ((latestUsage?.cacheRead || 0) / latestCacheBase) * 100 : null;
  const sessionSegments = [
    { value: sessionTokens.input, color: "#7da7ff", label: t("inputTokens") },
    { value: sessionTokens.output, color: "#b17cff", label: t("outputTokens") },
    { value: sessionTokens.cacheRead, color: "#59c8a5", label: t("cacheReadTokens") },
    { value: sessionTokens.cacheWrite, color: "#e7a65a", label: t("cacheWriteTokens") },
  ];

  return (
    <div className={`token-dock ${open ? "open" : ""}`}>
      <button className="token-dock-bar" onClick={onToggle} aria-expanded={open} aria-controls="token-dashboard-drawer">
        <span className="token-dock-title">
          <ContextRing percent={contextPercent} tokens={contextUsed} contextWindow={contextWindow} locale={locale} />
          <span><strong>{t("tokenDashboard")}</strong><small>{model ? model.name : "—"}</small></span>
        </span>
        <span className="token-dock-summary">
          <span>{t("contextUsed")}<strong>{formatTokenCount(contextUsed)}</strong></span>
          <span>{t("contextLimit")}<strong>{formatTokenCount(contextWindow)}</strong></span>
          <span>{t("contextRemaining")}<strong>{formatTokenCount(contextRemaining)}</strong></span>
          <span>{t("tokenRate")}<strong>{tokenRate.toFixed(1)} tok/s</strong></span>
        </span>
        <ChevronDown className="token-dock-chevron" size={16} />
      </button>

      <div className="token-drawer" id="token-dashboard-drawer" aria-hidden={!open}>
        <section className="token-popover" role="region" aria-label={t("tokenDashboard")}>
          <header className="token-popover-header">
            <div>
              <h3>{t("tokenDashboard")}</h3>
              <small className="token-model-meta">{model ? `${model.provider}/${model.id}` : "—"}</small>
            </div>
            <div className={`token-run-status ${isStreaming ? "active" : ""}`}><i />{isStreaming ? t("active") : t("idle")}</div>
          </header>

          <div className="token-dashboard-grid">
            <div className="token-context-column">
              <div className="token-context-hero">
                <div className="token-hero-ring">
                  <svg viewBox="0 0 100 100" aria-hidden="true">
                    <circle className="token-hero-track" cx="50" cy="50" r="42" />
                    <circle className="token-hero-value" cx="50" cy="50" r="42" strokeDasharray={largeCircumference} strokeDashoffset={largeCircumference * (1 - percent / 100)} />
                  </svg>
                  <strong>{contextPercent == null ? "—" : `${formatPercent(contextPercent)}%`}</strong>
                  <small>{t("contextUsed")}</small>
                </div>
                <div className="context-number-grid">
                  <div><span>{t("contextUsed")}</span><strong>{formatTokenCount(contextUsed)}</strong><small>{t("tokensShort")}</small></div>
                  <div><span>{t("contextRemaining")}</span><strong>{formatTokenCount(contextRemaining)}</strong><small>{t("tokensShort")}</small></div>
                  <div><span>{t("contextLimit")}</span><strong>{formatTokenCount(contextWindow)}</strong><small>{t("tokensShort")}</small></div>
                  <div><span>{t("maxOutputTokens")}</span><strong>{formatTokenCount(model?.maxTokens)}</strong><small>{t("tokensShort")}</small></div>
                </div>
              </div>
              <div className="context-capacity-bar"><span style={{ width: `${percent}%` }} /><i style={{ left: `${percent}%` }} /></div>
            </div>

            <div className="token-panel-section session-section">
              <div className="token-section-heading"><strong>{t("sessionTokens")}</strong><span>{formatTokenCount(sessionTokens.total)}</span></div>
              <TokenStack values={sessionSegments} />
              <div className="token-legend-grid">
                {sessionSegments.map((entry) => <div key={entry.label}><i style={{ background: entry.color }} /><span>{entry.label}</span><strong>{formatTokenCount(entry.value)}</strong></div>)}
              </div>
              <div className="token-summary-row"><span>{t("cacheHitRate")}<strong>{cacheHitRate == null ? "—" : `${cacheHitRate.toFixed(1)}%`}</strong></span><span>{t("tokenCost")}<strong>{formatUsd(stats?.cost)}</strong></span></div>
            </div>

            <div className="token-panel-section latest-usage-section">
              <div className="token-section-heading"><strong>{t("latestResponse")}</strong><span>{latestUsage ? formatTokenCount(latestUsage.totalTokens) : "—"}</span></div>
              <div className="latest-usage-grid">
                <div><span>{t("inputTokens")}</span><strong>{formatTokenCount(latestUsage?.input)}</strong></div>
                <div><span>{t("outputTokens")}</span><strong>{formatTokenCount(latestUsage?.output)}</strong></div>
                <div><span>{t("reasoningTokens")}</span><strong>{formatTokenCount(latestUsage?.reasoning)}</strong></div>
                <div><span>{t("cacheReadTokens")}</span><strong>{formatTokenCount(latestUsage?.cacheRead)}</strong></div>
                <div><span>{t("cacheWriteTokens")}</span><strong>{formatTokenCount(latestUsage?.cacheWrite)}</strong></div>
                <div><span>{t("cacheHitRate")}</span><strong>{latestCacheHitRate == null ? "—" : `${latestCacheHitRate.toFixed(1)}%`}</strong></div>
              </div>
              <TokenStack values={[
                { value: latestUsage?.input || 0, color: "#7da7ff", label: t("inputTokens") },
                { value: latestUsage?.output || 0, color: "#b17cff", label: t("outputTokens") },
                { value: latestUsage?.cacheRead || 0, color: "#59c8a5", label: t("cacheReadTokens") },
                { value: latestUsage?.cacheWrite || 0, color: "#e7a65a", label: t("cacheWriteTokens") },
              ]} />
              <div className="token-summary-row latest-cost-row"><span>{t("latestCost")}<strong>{formatUsd(latestUsage?.cost?.total)}</strong></span><span>{t("cacheWrite1hTokens")}<strong>{formatTokenCount(latestUsage?.cacheWrite1h)}</strong></span></div>
              <div className="cost-breakdown-grid">
                <span>{t("inputTokens")}<strong>{formatUsd(latestUsage?.cost?.input)}</strong></span>
                <span>{t("outputTokens")}<strong>{formatUsd(latestUsage?.cost?.output)}</strong></span>
                <span>{t("cacheReadTokens")}<strong>{formatUsd(latestUsage?.cost?.cacheRead)}</strong></span>
                <span>{t("cacheWriteTokens")}<strong>{formatUsd(latestUsage?.cost?.cacheWrite)}</strong></span>
              </div>
            </div>

            <div className="token-panel-section run-section">
              <div className="run-chart-copy"><span>{t("currentRun")}</span><strong>{tokenRate.toFixed(1)} <small>tok/s</small></strong><em>{formatTokenCount(runTokens)} tokens · {runElapsed.toFixed(1)}s</em></div>
              <RateSparkline values={rateHistory} />
              <div className="run-meta-row">
                <span>{t("dataSource")}<strong>{usageSource === "reported" ? t("providerReported") : t("locallyEstimated")}</strong></span>
                <span>{t("compactionStatus")}<strong>{isCompacting ? t("active") : autoCompactionEnabled ? t("autoEnabled") : t("idle")}</strong></span>
                <span>Reasoning<strong>{thinkingLevel.toUpperCase()}</strong></span>
              </div>
            </div>

            <div className="token-panel-section activity-section">
              <div className="token-section-heading"><strong>{t("activity")}</strong><span>{stats?.sessionId ? `${stats.sessionId.slice(0, 8)}…` : "—"}</span></div>
              <div className="activity-grid">
                <div><User size={13} /><span>{t("userMessages")}</span><strong>{stats?.userMessages ?? 0}</strong></div>
                <div><Bot size={13} /><span>{t("assistantMessages")}</span><strong>{stats?.assistantMessages ?? 0}</strong></div>
                <div><SquareTerminal size={13} /><span>{t("toolCalls")}</span><strong>{stats?.toolCalls ?? 0}</strong></div>
                <div><Check size={13} /><span>{t("toolResults")}</span><strong>{stats?.toolResults ?? 0}</strong></div>
                <div className="activity-total"><MessageSquare size={13} /><span>{t("totalMessages")}</span><strong>{stats?.totalMessages ?? 0}</strong></div>
              </div>
            </div>
          </div>

          <footer className="token-popover-notes"><p>{t("reportedReasoningNote")}</p><p>{t("contextEstimateNote")}</p><p>{t("costNote")}</p><p>{t("sessionTotalsNote")}</p></footer>
        </section>
      </div>
    </div>
  );
}

function MarkdownBody({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ href, children: linkChildren }) => (
          <a href={href} target="_blank" rel="noopener noreferrer">
            {linkChildren}
          </a>
        ),
        code: ({ className, children: codeChildren }) => (
          <code className={className || "inline-code"}>{codeChildren}</code>
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}

function MessageCard({
  message,
  locale,
  live = false,
  profile,
  thinkingOnly = false,
  contextSettled = true,
}: {
  message: AgentMessage;
  locale: Locale;
  live?: boolean;
  profile?: ProfileId;
  thinkingOnly?: boolean;
  contextSettled?: boolean;
}) {
  const isError = message.stopReason === "error" || Boolean(message.errorMessage);
  const text = textFromContent(message.content) || (isError ? friendlyModelError(message.errorMessage, locale) : "");
  const thinking = thinkingFromContent(message.content);
  const toolCalls = toolCallsFromContent(message.content);
  const isUser = message.role === "user";
  const [thinkingOpen, setThinkingOpen] = useState(true);
  const disposition = !isUser
    ? reasoningDispositionForMessage(message.content, profile, !live && contextSettled)
    : null;

  if ((!text || thinkingOnly) && !thinking && (thinkingOnly || toolCalls.length === 0)) return null;

  return (
    <article className={`message-card ${isUser ? "user-message" : "assistant-message"} ${isError ? "error-message" : ""} ${live ? "live" : ""} ${thinkingOnly ? "thinking-only-message" : ""}`}>
      <div className="message-avatar">
        {isUser ? <User size={16} /> : <img src={logoUrl} alt="北辰" />}
      </div>
      <div className="message-content">
        {!isUser && thinking ? (
          <div className="reasoning-section">
            <button className="thinking-toggle" onClick={() => setThinkingOpen((open) => !open)}>
              <BrainCircuit size={14} />
              <strong>{locale === "zh" ? "完整思考过程" : "Full reasoning"}</strong>
              <span className={live ? "reasoning-live-badge" : "reasoning-complete-badge"}>
                {live ? (locale === "zh" ? "实时" : "Live") : (locale === "zh" ? "已完成" : "Complete")}
              </span>
              <ChevronRight className={thinkingOpen ? "rotated" : ""} size={13} />
            </button>
            {thinkingOpen ? (
              <div className={`reasoning-context-visual ${disposition ? `has-${disposition.kind}` : ""}`}>
                <div className="thinking-content">
                  {thinking}
                  {live ? <span className="thinking-stream-caret" /> : null}
                </div>
                {disposition ? (
                  <>
                    <svg className="reasoning-brace" viewBox="0 0 28 100" preserveAspectRatio="none" aria-hidden="true">
                      <path d="M2 1 C17 1 15 18 15 31 C15 42 20 48 26 50 C20 52 15 58 15 69 C15 82 17 99 2 99" />
                    </svg>
                    <div className={`reasoning-disposition disposition-${disposition.kind}`}>
                      <strong>
                        {disposition.kind === "compressed"
                          ? (locale === "zh" ? "已压缩" : "Compressed")
                          : (locale === "zh" ? "已删除" : "Deleted")}
                      </strong>
                      {disposition.kind === "compressed" ? (
                        <div>
                          <span>{locale === "zh" ? "模型后续实际看到" : "What the model sees next"}</span>
                          {disposition.digests.map((digest, index) => <pre key={`${index}-${digest.slice(0, 20)}`}>{digest}</pre>)}
                        </div>
                      ) : (
                        <p>{locale === "zh" ? "模型后续上下文不再携带这段思考" : "This reasoning is omitted from future model context"}</p>
                      )}
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
        {!thinkingOnly && text ? <MarkdownBody>{text}</MarkdownBody> : null}
        {!thinkingOnly && toolCalls.length > 0 ? (
          <div className="message-tool-list">
            {toolCalls.map((tool, index) => (
              <div className="message-tool-chip" key={tool.id || `${tool.name}-${index}`}>
                <SquareTerminal size={13} />
                <span>{tool.name || "tool"}</span>
              </div>
            ))}
          </div>
        ) : null}
        {live && !thinkingOnly ? <span className="stream-caret" /> : null}
      </div>
    </article>
  );
}

function ToolTimeline({ runs, locale }: { runs: ToolRun[]; locale: Locale }) {
  if (!runs.length) return null;
  return (
    <div className="tool-timeline">
      {runs.slice(-4).map((run) => (
        <details className={`tool-run tool-${run.status}`} key={run.id} open={run.status === "running"}>
          <summary>
            <span className="tool-status-dot" />
            <SquareTerminal size={14} />
            <strong>{run.name}</strong>
            <span>{run.status === "running" ? (locale === "zh" ? "执行中" : "Running") : run.status === "error" ? (locale === "zh" ? "失败" : "Failed") : (locale === "zh" ? "完成" : "Done")}</span>
            <ChevronDown size={13} />
          </summary>
          <pre>{stringifyCompact(run.result ?? run.partial ?? run.args)}</pre>
        </details>
      ))}
    </div>
  );
}

function AuthPromptModal({
  request,
  onSubmit,
  onCancel,
  t,
}: {
  request: AuthPromptRequest;
  onSubmit: (value: string) => void;
  onCancel: () => void;
  t: Translate;
}) {
  const [value, setValue] = useState("");
  const prompt = request.prompt;

  if (prompt.type === "select") {
    return (
      <div className="modal-backdrop">
        <div className="modal-card auth-modal">
          <div className="modal-icon"><Sparkles size={20} /></div>
          <h3>{prompt.message}</h3>
          <div className="auth-options">
            {prompt.options?.map((option) => (
              <button key={option.id} onClick={() => onSubmit(option.id)}>
                <strong>{option.label}</strong>
                {option.description ? <span>{option.description}</span> : null}
              </button>
            ))}
          </div>
          <div className="modal-actions">
            <button type="button" onClick={onCancel}>{t("cancel")}</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop">
      <form
        className="modal-card auth-modal"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(value);
        }}
      >
        <div className="modal-icon"><Sparkles size={20} /></div>
        <h3>{prompt.message}</h3>
        <input
          autoFocus
          type={prompt.type === "secret" ? "password" : "text"}
          value={value}
          placeholder={prompt.placeholder || "请输入"}
          onChange={(event) => setValue(event.target.value)}
        />
        <div className="modal-actions">
          <button type="button" onClick={onCancel}>{t("cancel")}</button>
          <button className="primary-button" type="submit" disabled={!value.trim()}>
            {t("continue")}
            <ArrowUp size={15} />
          </button>
        </div>
      </form>
    </div>
  );
}

function ExtensionModal({
  dialog,
  onRespond,
  t,
}: {
  dialog: ExtensionDialog;
  onRespond: (response: Record<string, unknown>) => Promise<void>;
  t: Translate;
}) {
  const [value, setValue] = useState(extensionDialogInitialValue(dialog));
  const [responding, setResponding] = useState(false);
  const respondingRef = useRef(false);
  const respond = async (response: Record<string, unknown>) => {
    if (respondingRef.current) return;
    respondingRef.current = true;
    setResponding(true);
    try {
      await onRespond(response);
    } finally {
      respondingRef.current = false;
      setResponding(false);
    }
  };
  return (
    <div className="modal-backdrop">
      <div className="modal-card extension-modal">
        <div className="modal-icon"><Puzzle size={20} /></div>
        <h3>{dialog.title || t("pluginRequest")}</h3>
        {dialog.message ? <p>{dialog.message}</p> : null}
        {dialog.method === "select" ? (
          <div className="auth-options">
            {dialog.options?.map((option) => (
              <button disabled={responding} key={option} onClick={() => void respond({ value: option })}>{option}</button>
            ))}
          </div>
        ) : dialog.method === "input" || dialog.method === "editor" ? (
          <textarea
            autoFocus
            disabled={responding}
            value={value}
            placeholder={dialog.placeholder}
            onChange={(event) => setValue(event.target.value)}
          />
        ) : null}
        <div className="modal-actions">
          <button disabled={responding} onClick={() => void respond({ cancelled: true })}>{t("cancel")}</button>
          <button
            className="primary-button"
            disabled={responding}
            onClick={() => void respond(dialog.method === "confirm" ? { confirmed: true } : { value })}
          >
            {t("confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}

function SecurityNoticeModal({ locale, onAccept }: { locale: Locale; onAccept: () => void }) {
  const zh = locale === "zh";
  return (
    <div className="modal-backdrop security-notice-backdrop">
      <div className="modal-card security-notice-modal">
        <div className="modal-icon"><EyeOff size={20} /></div>
        <h3>{zh ? "使用前请确认安全边界" : "Understand the security boundary"}</h3>
        <p>{zh
          ? "北辰 Pi 的 Agent 模式不是安全沙箱。确认后，它可以在你选择的工作目录中读取和修改文件、执行 PowerShell，并加载 Pi 技能与扩展。"
          : "Beichen Pi Agent mode is not a security sandbox. It can read and modify files, execute PowerShell, and load Pi skills and extensions in the workspace you select."}</p>
        <ul>
          <li>{zh ? "只打开可信项目，不安装来源不明的技能或扩展。" : "Open only trusted projects and extensions."}</li>
          <li>{zh ? "重要文件先使用 Git 或离线备份保护。" : "Protect important work with Git or offline backups."}</li>
          <li>{zh ? "提示词、附件、文件内容和工具结果可能发送给所选模型服务商。" : "Prompts, attachments, file content, and tool results may be sent to the selected model provider."}</li>
          <li>{zh ? "不要把密钥、隐私文件或无权上传的代码交给模型。" : "Do not provide secrets, private files, or code you are not authorized to upload."}</li>
        </ul>
        <div className="modal-actions">
          <button type="button" onClick={() => window.beichen.close()}>{zh ? "退出" : "Exit"}</button>
          <button className="primary-button" type="button" onClick={onAccept}>{zh ? "我理解并继续" : "I understand and continue"}</button>
        </div>
      </div>
    </div>
  );
}

const DEFAULT_CUSTOM_API: CustomApiInput = {
  name: "",
  baseUrl: "https://api.example.com/v1",
  api: "openai-completions",
  apiKey: "",
  modelId: "",
  modelName: "",
  contextWindow: 128000,
  maxTokens: 16384,
  reasoning: false,
  imageInput: false,
  extendedThinking: false,
  thinkingFormat: "auto",
  supportsDeveloperRole: false,
  authHeader: false,
  useApiKey: true,
};

function CustomApiManager({
  entries,
  busy,
  locale,
  t,
  onSave,
  onDelete,
  initiallyOpen = false,
}: {
  entries: CustomApiInfo[];
  busy: boolean;
  locale: Locale;
  t: Translate;
  onSave: (input: CustomApiInput) => Promise<boolean>;
  onDelete: (providerId: string) => Promise<boolean>;
  initiallyOpen?: boolean;
}) {
  const [formOpen, setFormOpen] = useState(initiallyOpen);
  const [form, setForm] = useState<CustomApiInput>(DEFAULT_CUSTOM_API);
  const [saving, setSaving] = useState(false);
  const [activePreset, setActivePreset] = useState<CustomApiPreset | null>(null);
  const pendingPresets = remainingCustomApiPresets(CUSTOM_API_PRESETS, entries);

  const beginNew = () => {
    setForm({ ...DEFAULT_CUSTOM_API });
    setActivePreset(null);
    setFormOpen(true);
  };

  const beginPreset = (preset: CustomApiPreset) => {
    setForm({
      ...DEFAULT_CUSTOM_API,
      name: preset.name,
      api: preset.api,
      baseUrl: preset.baseUrl,
      modelId: preset.modelId,
      modelName: preset.modelName,
    });
    setActivePreset(preset);
    setFormOpen(true);
  };

  const beginEdit = (entry: CustomApiInfo) => {
    setForm({
      providerId: entry.providerId,
      name: entry.name,
      baseUrl: entry.baseUrl,
      api: entry.api,
      apiKey: "",
      modelId: entry.modelId,
      modelName: entry.modelName,
      contextWindow: entry.contextWindow,
      maxTokens: entry.maxTokens,
      reasoning: entry.reasoning,
      imageInput: entry.imageInput,
      extendedThinking: entry.extendedThinking,
      thinkingFormat: entry.thinkingFormat,
      supportsDeveloperRole: entry.supportsDeveloperRole,
      authHeader: entry.authHeader,
      useApiKey: entry.useApiKey,
    });
    setActivePreset(null);
    setFormOpen(true);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || busy) return;
    setSaving(true);
    try {
      if (await onSave(form)) {
        setFormOpen(false);
        setForm({ ...DEFAULT_CUSTOM_API });
        setActivePreset(null);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="custom-api-manager">
      <div className="custom-api-heading">
        <div>
          <span className="field-label">CUSTOM ENDPOINTS</span>
          <strong>{t("customApiTitle")}</strong>
          <small>{t("customApiDesc")}</small>
        </div>
        <button type="button" className="outline-button" onClick={beginNew}><Plus size={14} />{t("addCustomApi")}</button>
      </div>

      {pendingPresets.length ? (
        <div className="custom-api-presets">
          <span className="field-label">{t("customApiPreset")}</span>
          {pendingPresets.map((preset) => (
            <button key={preset.presetId} type="button" className="outline-button custom-api-preset" title={preset.baseUrl} onClick={() => beginPreset(preset)}>
              <Zap size={13} />{preset.name} · {preset.modelName}
            </button>
          ))}
        </div>
      ) : null}

      {entries.length ? (
        <div className="custom-api-list">
          {entries.map((entry) => (
            <article key={entry.providerId} className="custom-api-card">
              <span className="custom-api-icon"><Server size={16} /></span>
              <div>
                <strong>{entry.name}</strong>
                <small>{entry.modelName || entry.modelId} · {entry.api}</small>
                <em>{entry.baseUrl}</em>
              </div>
              <span className="custom-api-key-state"><KeyRound size={11} />{entry.useApiKey ? t("encryptedKey") : t("keylessApi")}</span>
              <div className="custom-api-actions">
                <button type="button" title={t("editCustomApi")} onClick={() => beginEdit(entry)}><Pencil size={13} /></button>
                <button
                  type="button"
                  className="danger"
                  title={locale === "zh" ? "删除" : "Delete"}
                  onClick={() => {
                    const confirmed = window.confirm(locale === "zh" ? `删除自定义 API“${entry.name}”？` : `Delete custom API “${entry.name}”?`);
                    if (confirmed) void onDelete(entry.providerId);
                  }}
                ><Trash2 size={13} /></button>
              </div>
            </article>
          ))}
        </div>
      ) : <div className="empty-setting custom-api-empty">{t("customApiEmpty")}</div>}

      {formOpen ? (
        <form className="custom-api-form" onSubmit={submit}>
          <div className="custom-form-title">
            <span><Server size={15} /></span>
            <strong>{form.providerId ? t("editCustomApi") : t("addCustomApi")}</strong>
            <button type="button" onClick={() => setFormOpen(false)}><X size={14} /></button>
          </div>
          {activePreset ? <p className="custom-form-preset-hint">{t("customApiPresetHint")}</p> : null}
          <div className="custom-form-grid">
            <label><span>{t("customApiName")}</span><input required maxLength={80} value={form.name} onChange={(event) => setForm((value) => ({ ...value, name: event.target.value }))} placeholder="My API" /></label>
            <label><span>{t("apiProtocol")}</span><select value={form.api} onChange={(event) => setForm((value) => ({ ...value, api: event.target.value as CustomApiInput["api"] }))}>
              <option value="openai-completions">OpenAI Chat Completions</option>
              <option value="openai-responses">OpenAI Responses</option>
              <option value="anthropic-messages">Anthropic Messages</option>
              <option value="google-generative-ai">Google Generative AI</option>
            </select></label>
            <label className="wide"><span>{t("apiBaseUrl")}</span><input required value={form.baseUrl} onChange={(event) => setForm((value) => ({ ...value, baseUrl: event.target.value }))} placeholder="https://api.example.com/v1" /></label>
            <label><span>{t("modelId")}</span><input required value={form.modelId} onChange={(event) => setForm((value) => ({ ...value, modelId: event.target.value }))} placeholder="model-id" /></label>
            <label><span>{t("modelName")}</span><input value={form.modelName} onChange={(event) => setForm((value) => ({ ...value, modelName: event.target.value }))} placeholder={form.modelId || "Model"} /></label>
            <label className="wide"><span>{t("apiKey")}</span><input type="password" autoComplete="new-password" disabled={!form.useApiKey} value={form.apiKey || ""} onChange={(event) => setForm((value) => ({ ...value, apiKey: event.target.value }))} placeholder={form.providerId ? (locale === "zh" ? "留空则保留已加密密钥" : "Leave blank to keep encrypted key") : "sk-…"} /></label>
          </div>
          <label className="custom-check"><input type="checkbox" checked={!form.useApiKey} onChange={(event) => setForm((value) => ({ ...value, useApiKey: !event.target.checked, apiKey: "" }))} /><span>{t("noApiKey")}</span></label>

          <details className="custom-api-advanced">
            <summary>{t("advancedCompatibility")}<ChevronDown size={13} /></summary>
            <div className="custom-form-grid advanced-grid">
              <label><span>{t("contextLimit")}</span><input type="number" min={1024} max={10000000} value={form.contextWindow} onChange={(event) => setForm((value) => ({ ...value, contextWindow: Number(event.target.value) }))} /></label>
              <label><span>{t("maxOutputTokens")}</span><input type="number" min={256} max={2000000} value={form.maxTokens} onChange={(event) => setForm((value) => ({ ...value, maxTokens: Number(event.target.value) }))} /></label>
              {form.reasoning ? <label><span>{t("thinkingProtocol")}</span><select value={form.thinkingFormat} onChange={(event) => setForm((value) => ({ ...value, thinkingFormat: event.target.value as CustomApiInput["thinkingFormat"] }))}>
                <option value="auto">Auto / standard</option><option value="openai">OpenAI reasoning_effort</option><option value="openrouter">OpenRouter</option><option value="deepseek">DeepSeek</option><option value="qwen">Qwen</option>
              </select></label> : null}
            </div>
            <div className="custom-check-grid">
              <label className="custom-check"><input type="checkbox" checked={form.reasoning} onChange={(event) => setForm((value) => ({ ...value, reasoning: event.target.checked, extendedThinking: event.target.checked ? value.extendedThinking : false }))} /><span>{t("reasoningModel")}</span></label>
              <label className="custom-check"><input type="checkbox" checked={form.imageInput} onChange={(event) => setForm((value) => ({ ...value, imageInput: event.target.checked }))} /><span>{t("imageSupport")}</span></label>
              <label className="custom-check"><input type="checkbox" disabled={!form.reasoning} checked={form.extendedThinking} onChange={(event) => setForm((value) => ({ ...value, extendedThinking: event.target.checked }))} /><span>{t("extendedThinking")}</span></label>
              <label className="custom-check"><input type="checkbox" checked={form.supportsDeveloperRole} onChange={(event) => setForm((value) => ({ ...value, supportsDeveloperRole: event.target.checked }))} /><span>{t("developerRole")}</span></label>
              <label className="custom-check"><input type="checkbox" checked={form.authHeader} onChange={(event) => setForm((value) => ({ ...value, authHeader: event.target.checked }))} /><span>{t("authHeader")}</span></label>
            </div>
          </details>
          <div className="custom-form-actions">
            <button type="button" className="outline-button" onClick={() => setFormOpen(false)}>{t("cancel")}</button>
            <button type="submit" className="primary-button" disabled={busy || saving}>{saving ? <RefreshCw className="spin" size={14} /> : <Check size={14} />}{t("saveAndApply")}</button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  config: WindowConfig;
  profiles: PerformanceProfile[];
  providers: ProviderInfo[];
  selectedProvider: string;
  setSelectedProvider: (provider: string) => void;
  authMode: "api" | "subscription";
  setAuthMode: (mode: "api" | "subscription") => void;
  models: ModelInfo[];
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  customApis: CustomApiInfo[];
  customApiFormOpen?: boolean;
  commands: PiCommandInfo[];
  busy: boolean;
  onPickDirectory: () => void;
  onNewWindow: () => void;
  onConnect: () => void;
  onLogout: () => void;
  onApplyModel: () => void;
  onSaveCustomApi: (input: CustomApiInput) => Promise<boolean>;
  onDeleteCustomApi: (providerId: string) => Promise<boolean>;
  onProfile: (profile: ProfileId) => void;
  onInsertCommand: (command: PiCommandInfo) => void;
  onOpenPluginRoot: () => void;
  locale: Locale;
  theme: VisualTheme;
  t: Translate;
  onTheme: (theme: VisualTheme) => void;
}

function SettingsPanel(props: SettingsPanelProps) {
  if (!props.open) return null;
  const filteredProviders = props.providers.filter((provider) =>
    props.authMode === "subscription" ? provider.oauth?.isSubscription : Boolean(provider.apiKey),
  );
  const activeProvider = props.providers.find((provider) => provider.id === props.selectedProvider);
  const tabs = [
    { id: "general", label: props.t("general"), icon: Settings },
    { id: "appearance", label: props.t("appearanceTab"), icon: Palette },
    { id: "models", label: props.t("models"), icon: Cpu },
    { id: "plugins", label: props.t("plugins"), icon: Puzzle },
    { id: "performance", label: props.t("performance"), icon: Gauge },
    { id: "guide", label: props.t("guide"), icon: BookOpen },
  ];
  const themeOptions: Array<{ id: VisualTheme; label: UIKey; description: UIKey }> = [
    { id: "codex", label: "themeCodex", description: "descCodex" },
    { id: "ink", label: "themeInk", description: "descInk" },
    { id: "wuxia", label: "themeWuxia", description: "descWuxia" },
    { id: "nekomimi", label: "themeNekomimi", description: "descNekomimi" },
    { id: "cream", label: "themeCream", description: "descCream" },
    { id: "midnight", label: "themeMidnight", description: "descMidnight" },
    { id: "cyber", label: "themeCyber", description: "descCyber" },
  ];
  const guideEntries = MODE_GUIDE[props.locale];

  return (
    <div className="settings-layer" onMouseDown={props.onClose}>
      <section className="settings-panel" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <span>北辰 Pi</span>
            <h2>{props.t("settings")}</h2>
          </div>
          <button className="icon-button" onClick={props.onClose}><X size={18} /></button>
        </header>
        <div className="settings-body">
          <nav className="settings-nav">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  className={props.activeTab === tab.id ? "active" : ""}
                  onClick={() => props.setActiveTab(tab.id)}
                >
                  <Icon size={16} />
                  {tab.label}
                </button>
              );
            })}
          </nav>
          <div className="settings-content">
            {props.activeTab === "general" ? (
              <div className="settings-section">
                <div className="section-kicker">WORKSPACE</div>
                <h3>{props.t("workspaceWindows")}</h3>
                <p>{props.t("workspaceWindowsDesc")}</p>
                <div className="setting-card workspace-card">
                  <div className="setting-card-icon"><Folder size={18} /></div>
                  <div><span>{props.t("currentWorkspace")}</span><strong>{props.config.cwd}</strong></div>
                  <button onClick={props.onPickDirectory}>{props.t("change")}</button>
                </div>
                <div className="setting-row">
                  <div><strong>{props.t("independentWindow")}</strong><span>{props.t("independentWindowDesc")}</span></div>
                  <button className="outline-button" onClick={props.onNewWindow}><Plus size={15} />{props.t("newWindow")}</button>
                </div>
                <div className="setting-row">
                  <div><strong>{props.t("uiEngine")}</strong><span>Electron + Pi RPC · Local</span></div>
                  <span className="status-pill ready"><Check size={13} />{props.t("connected")}</span>
                </div>
              </div>
            ) : null}

            {props.activeTab === "appearance" ? (
              <div className="settings-section appearance-section">
                <div className="section-kicker">APPEARANCE</div>
                <h3>{props.t("appearanceTitle")}</h3>
                <p>{props.t("appearanceHelp")}</p>
                <div className="theme-gallery">
                  {themeOptions.map((option) => (
                    <button
                      key={option.id}
                      className={`theme-gallery-card theme-card-${option.id} ${props.theme === option.id ? "active" : ""}`}
                      onClick={() => props.onTheme(option.id)}
                    >
                      <span className="theme-card-art"><i /><i /><i /></span>
                      <span className="theme-card-copy">
                        <strong>{props.t(option.label)}</strong>
                        <small>{props.t(option.description)}</small>
                      </span>
                      <span className="theme-card-check">{props.theme === option.id ? <Check size={14} /> : null}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {props.activeTab === "models" ? (
              <div className="settings-section">
                <div className="section-kicker">MODEL ACCESS</div>
                <h3>{props.t("modelAccess")}</h3>
                <p>{props.t("modelAccessDesc")}</p>
                <div className="segmented-control access-segment">
                  <button className={props.authMode === "subscription" ? "active" : ""} onClick={() => props.setAuthMode("subscription")}>
                    {props.t("subscription")}
                  </button>
                  <button className={props.authMode === "api" ? "active" : ""} onClick={() => props.setAuthMode("api")}>
                    API
                  </button>
                </div>
                <label className="field-label">{props.t("provider")}</label>
                <div className="provider-grid">
                  {filteredProviders.map((provider) => (
                    <button
                      key={provider.id}
                      className={provider.id === props.selectedProvider ? "active" : ""}
                      onClick={() => props.setSelectedProvider(provider.id)}
                    >
                      <span className="provider-mark">{provider.name.slice(0, 1).toUpperCase()}</span>
                      <span><strong>{provider.name}</strong><small>{provider.modelCount} {props.t("modelCount")}</small></span>
                      {provider.ready ? <Check className="provider-ready" size={14} /> : null}
                    </button>
                  ))}
                </div>
                {filteredProviders.length === 0 ? <div className="empty-setting">{props.t("noProvider")}</div> : null}
                {activeProvider ? (
                  <div className="auth-status-card">
                    <div>
                      <span>{props.authMode === "subscription" ? activeProvider.oauth?.name : activeProvider.apiKey?.name}</span>
                      <strong>{activeProvider.ready ? props.t("connected") : props.t("notConnected")}</strong>
                      <small>{activeProvider.authSource || props.t("localCredential")}</small>
                    </div>
                    {activeProvider.ready ? (
                      <button className="outline-button danger" onClick={props.onLogout}><LogOut size={14} />{props.t("disconnect")}</button>
                    ) : (
                      <button className="primary-button" disabled={props.busy} onClick={props.onConnect}>
                        {props.authMode === "subscription" ? props.t("connectSubscription") : props.t("configureApi")}
                        <ExternalLink size={14} />
                      </button>
                    )}
                  </div>
                ) : null}
                <label className="field-label">{props.t("windowModel")}</label>
                <select value={props.selectedModel} onChange={(event) => props.setSelectedModel(event.target.value)}>
                  <option value="">{props.t("chooseModel")}</option>
                  {props.models.map((model) => (
                    <option key={`${model.provider}/${model.id}`} value={model.id}>
                      {model.name} · {formatContextWindow(model.contextWindow)} context
                    </option>
                  ))}
                </select>
                <button className="apply-model-button" disabled={!props.selectedModel || props.busy} onClick={props.onApplyModel}>
                  {props.busy ? <RefreshCw className="spin" size={16} /> : <Cpu size={16} />}
                  {props.t("applyWindow")}
                </button>
                <CustomApiManager
                  entries={props.customApis}
                  busy={props.busy}
                  locale={props.locale}
                  t={props.t}
                  onSave={props.onSaveCustomApi}
                  onDelete={props.onDeleteCustomApi}
                  initiallyOpen={props.customApiFormOpen}
                />
              </div>
            ) : null}

            {props.activeTab === "plugins" ? (
              <div className="settings-section">
                <div className="section-kicker">EXTENSIONS</div>
                <h3>{props.t("pluginTitle")}</h3>
                <p>{props.t("pluginDesc")}</p>
                <button className="outline-button plugin-folder-button" onClick={props.onOpenPluginRoot}>
                  <FolderOpen size={15} />{props.t("openPiRoot")}
                </button>
                <div className="plugin-list">
                  {props.commands.map((command) => (
                    <button key={`${command.source}:${command.name}`} onClick={() => props.onInsertCommand(command)}>
                      <span className={`plugin-source source-${command.source}`}>
                        {command.source === "skill" ? <Sparkles size={15} /> : command.source === "extension" ? <Puzzle size={15} /> : <Command size={15} />}
                      </span>
                      <span><strong>/{command.name}</strong><small>{command.description || command.path || command.source}</small></span>
                      <ChevronRight size={15} />
                    </button>
                  ))}
                  {props.commands.length === 0 ? (
                    <div className="empty-setting"><span>{props.t("noPlugins")}</span></div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {props.activeTab === "performance" ? (
              <div className="settings-section">
                <div className="section-kicker">PERFORMANCE MATRIX</div>
                <h3>{props.t("perfTitle")}</h3>
                <p>{props.t("perfDesc")}</p>
                <div className="profile-settings-grid">
                  {props.profiles.map((profile) => {
                    const Icon = PROFILE_ICONS[profile.id] || BrainCircuit;
                    const active = props.config.profile === profile.id;
                    return (
                      <button
                        key={profile.id}
                        className={`profile-setting-card mode-${profile.id} ${active ? "active" : ""}`}
                        onClick={() => props.onProfile(profile.id)}
                      >
                        <Icon size={19} />
                        <span><strong>{profile.label}</strong><small>{profileSubtitle(profile.id, props.locale)}</small></span>
                        <em>{props.locale === "zh" ? "自由" : "FREE"}</em>
                      </button>
                    );
                  })}
                </div>
                <div className="truth-note">
                  <EyeOff size={17} />
                  <div>
                    <strong>{props.t("ghostBoundary")}</strong>
                    <span>{props.t("ghostBoundaryDesc")}</span>
                  </div>
                </div>
              </div>
            ) : null}

            {props.activeTab === "guide" ? (
              <div className="settings-section guide-section">
                <h3>{props.t("guideTitle")}</h3>
                <p>{props.t("guideIntro")}</p>

                <h4 className="guide-subheading">{props.t("modeComparison")}</h4>
                <div className="mode-comparison-table">
                  <div className="mode-comparison-head">
                    <span>Mode</span><span>{props.locale === "zh" ? "核心策略" : "Core"}</span><span>{props.locale === "zh" ? "反馈 / 回合后" : "Feedback / post-turn"}</span><span>{props.locale === "zh" ? "定位" : "Purpose"}</span>
                  </div>
                  {guideEntries.map((entry) => (
                    <div className="mode-comparison-row" key={`comparison-${entry.id}`}>
                      <strong>{entry.name}</strong>
                      <span>{entry.facts[0]?.[1] || "—"}</span>
                      <span>{entry.facts[1]?.[1] || "—"}</span>
                      <span>{entry.summary}</span>
                    </div>
                  ))}
                </div>

                <h4 className="guide-subheading detailed-heading">{props.t("detailedModes")}</h4>
                <div className="mode-guide-list">
                  {guideEntries.map((entry, index) => (
                    <details className="mode-guide-details" key={entry.id} open={index === 1}>
                      <summary>
                        <span className="mode-guide-index">{String(index + 1).padStart(2, "0")}</span>
                        <span className="mode-guide-title"><strong>{entry.name}</strong><small>{entry.category}</small></span>
                        <p>{entry.summary}</p>
                        <ChevronDown size={15} />
                      </summary>
                      <div className="mode-guide-body">
                        <div className="mode-fact-grid">
                          {entry.facts.map(([label, value]) => <div key={`${entry.id}-${label}`}><span>{label}</span><strong>{value}</strong></div>)}
                        </div>
                        <div className="mode-guide-columns">
                          <section><h5>{props.t("actualBehavior")}</h5><ul>{entry.behavior.map((item) => <li key={item}>{item}</li>)}</ul></section>
                          <section><h5>{props.t("suitableFor")}</h5><ul>{entry.suitable.map((item) => <li key={item}>{item}</li>)}</ul></section>
                          <section><h5>{props.t("notSuitableFor")}</h5><ul>{entry.avoid.map((item) => <li key={item}>{item}</li>)}</ul></section>
                          <section><h5>{props.t("tradeoffs")}</h5><ul>{entry.tradeoffs.map((item) => <li key={item}>{item}</li>)}</ul></section>
                        </div>
                        <div className="mode-switch-advice"><span>{props.t("switchAdvice")}</span><p>{entry.switchAdvice}</p></div>
                      </div>
                    </details>
                  ))}
                </div>
                <h4 className="guide-subheading detailed-heading">{props.t("customApiTitle")}</h4>
                <div className="custom-api-guide">
                  <span><Server size={18} /></span>
                  <div>
                    <strong>{props.locale === "zh" ? "Pi 原生自定义模型接入" : "Pi-native custom model access"}</strong>
                    <p>{props.locale === "zh"
                      ? "在“模型与接入”底部填写 API 地址、协议、密钥和模型 ID。支持 OpenAI Chat Completions / Responses、Anthropic Messages、Google Generative AI 与无密钥本地服务。保存后模型立即应用到当前窗口。"
                      : "Enter the endpoint, protocol, key, and model ID at the bottom of Models & access. Supports OpenAI Chat Completions / Responses, Anthropic Messages, Google Generative AI, and keyless local servers, then applies the model to this window."}</p>
                    <p>{props.locale === "zh"
                      ? "API Key 由 Windows 系统加密；Pi models.json 只保存环境变量引用。自定义模型继续使用 Pi 工具、会话、Token 仪表、思考强度和所有性能模式。"
                      : "Windows encrypts the API key; Pi models.json stores only an environment-variable reference. Custom models retain Pi tools, sessions, token telemetry, thinking controls, and every performance mode."}</p>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

export default function App() {
  const [theme, setTheme] = useState<VisualTheme>(() => (window.localStorage.getItem("beichen-theme-v1.1") as VisualTheme) || "codex");
  const [locale, setLocale] = useState<Locale>(() => (window.localStorage.getItem("beichen-locale-v1.1") as Locale) || "zh");
  const [bootstrap, setBootstrap] = useState<BootstrapData | null>(null);
  const [config, setConfig] = useState<WindowConfig | null>(null);
  const [profiles, setProfiles] = useState<PerformanceProfile[]>([]);
  const [customApis, setCustomApis] = useState<CustomApiInfo[]>([]);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [liveMessage, setLiveMessage] = useState<AgentMessage | null>(null);
  const [toolRuns, setToolRuns] = useState<ToolRun[]>([]);
  const [commands, setCommands] = useState<PiCommandInfo[]>([]);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [engineModels, setEngineModels] = useState<ModelInfo[]>([]);
  const [availableThinkingLevels, setAvailableThinkingLevels] = useState<string[]>([]);
  const [thinkingLevel, setThinkingLevel] = useState("—");
  const [contextPercent, setContextPercent] = useState<number | null>(null);
  const [contextTokens, setContextTokens] = useState<number | null>(null);
  const [contextWindow, setContextWindow] = useState<number | null>(null);
  const [sessionStats, setSessionStats] = useState<SessionStats | null>(null);
  const [tokenRate, setTokenRate] = useState(0);
  const [runTokens, setRunTokens] = useState(0);
  const [runElapsed, setRunElapsed] = useState(0);
  const [rateHistory, setRateHistory] = useState<number[]>([0]);
  const [usageSource, setUsageSource] = useState<"reported" | "estimated">("estimated");
  const [autoCompactionEnabled, setAutoCompactionEnabled] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isCompacting, setIsCompacting] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [routeRestoring, setRouteRestoring] = useState(false);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [pendingAttachmentCount, setPendingAttachmentCount] = useState(0);
  const [backendStatus, setBackendStatus] = useState<{ state: string; message?: string }>({ state: "starting", message: "正在启动" });
  const [toast, setToast] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [sessionSearch, setSessionSearch] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState("general");
  const [authMode, setAuthMode] = useState<"api" | "subscription">("subscription");
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [selectedProvider, setSelectedProvider] = useState("");
  const [providerModels, setProviderModels] = useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [authPrompt, setAuthPrompt] = useState<AuthPromptRequest | null>(null);
  const [extensionDialog, setExtensionDialog] = useState<ExtensionDialog | null>(null);
  const [starSeen, setStarSeen] = useState(false);
  const [starFlight, setStarFlight] = useState(false);
  const [forceTokenPanel, setForceTokenPanel] = useState(false);
  const [tokenPanelOpen, setTokenPanelOpen] = useState(false);
  const [securityNoticeAccepted, setSecurityNoticeAccepted] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  const configRef = useRef<WindowConfig | null>(null);
  const settleRef = useRef<() => void>(() => undefined);
  const restoreFullAfterLightRef = useRef(false);
  const restoreRouteRef = useRef<() => Promise<boolean>>(async () => false);
  const routeRestorePromiseRef = useRef<Promise<boolean> | null>(null);
  const attachmentsRef = useRef<Attachment[]>([]);
  const pendingAttachmentCountRef = useRef(0);
  const runMetricsRef = useRef({ startedAt: 0, estimatedTokens: 0, actualTokens: 0 });

  const command = useCallback(<T,>(payload: Record<string, unknown>) => window.beichen.command(payload) as Promise<T>, []);
  const replaceAttachments = useCallback((next: Attachment[]) => {
    attachmentsRef.current = next;
    setAttachments(next);
  }, []);
  const t = useCallback<Translate>((key) => UI[locale][key], [locale]);

  useEffect(() => {
    window.localStorage.setItem("beichen-theme-v1.1", theme);
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem("beichen-locale-v1.1", locale);
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  }, [locale]);

  const activeProfile = useMemo(
    () => profiles.find((profile) => profile.id === config?.profile) || profiles[0],
    [profiles, config?.profile],
  );

  const activeModel = useMemo(
    () => engineModels.find((model) => model.provider === config?.provider && model.id === config?.modelId),
    [engineModels, config?.provider, config?.modelId],
  );

  const thinkingOptions = useMemo(() => {
    const levels = thinkingLevel && thinkingLevel !== "—"
      ? [...availableThinkingLevels, thinkingLevel]
      : availableThinkingLevels;
    return sortThinkingLevels(levels.length ? levels : ["off"]);
  }, [availableThinkingLevels, thinkingLevel]);

  const latestUsage = useMemo(() => {
    if (liveMessage?.usage) return liveMessage.usage;
    return [...messages].reverse().find((message) => message.role === "assistant" && message.usage)?.usage;
  }, [liveMessage, messages]);

  const filteredSessions = useMemo(() => {
    const query = sessionSearch.trim().toLowerCase();
    return query
      ? sessions.filter((session) => `${session.title} ${session.cwd}`.toLowerCase().includes(query))
      : sessions;
  }, [sessions, sessionSearch]);

  const loadProviders = useCallback(async () => {
    const next = await window.beichen.listProviders();
    setProviders(next);
    const current = configRef.current?.provider;
    const subscriptionDefault = next.find((provider) => provider.id === "openai-codex") || next.find((provider) => provider.oauth?.isSubscription);
    const apiDefault = next.find((provider) => provider.id === current) || next.find((provider) => provider.apiKey);
    setSelectedProvider((value) => value || (authMode === "subscription" ? subscriptionDefault?.id : apiDefault?.id) || "");
  }, [authMode]);

  const loadEngineState = useCallback(async () => {
    const [stateData, messageData, modelData, commandData, levelData, statsData] = await retry(() =>
      Promise.all([
        command<any>({ type: "get_state" }),
        command<any>({ type: "get_messages" }),
        command<any>({ type: "get_available_models" }),
        command<any>({ type: "get_commands" }),
        command<any>({ type: "get_available_thinking_levels" }),
        command<any>({ type: "get_session_stats" }),
      ]),
    );

    const availableModels = (modelData?.models || []).map((model: any) => ({
      id: model.id,
      provider: model.provider,
      name: model.name || model.id,
      reasoning: Boolean(model.reasoning),
      input: model.input || [],
      contextWindow: model.contextWindow,
      maxTokens: model.maxTokens,
    }));
    setMessages(messageData?.messages || []);
    setEngineModels(availableModels);
    setCommands(commandData?.commands || []);
    setThinkingLevel(stateData?.thinkingLevel || "off");
    setAvailableThinkingLevels(sortThinkingLevels(levelData?.levels || ["off"]));
    setContextPercent(statsData?.contextUsage?.percent ?? null);
    setContextTokens(statsData?.contextUsage?.tokens ?? null);
    setContextWindow(statsData?.contextUsage?.contextWindow ?? stateData?.model?.contextWindow ?? null);
    setSessionStats(statsData || null);
    setAutoCompactionEnabled(stateData?.autoCompactionEnabled !== false);

    const currentConfig = configRef.current;
    if (stateData?.model && currentConfig) {
      const merged = {
        ...currentConfig,
        provider: stateData.model.provider,
        modelId: stateData.model.id,
        thinkingLevel: stateData?.thinkingLevel || "off",
      };
      configRef.current = merged;
      setConfig(merged);
    }
  }, [command]);

  const refreshAfterRun = useCallback(async () => {
    try {
      const [messageData, statsData, nextSessions] = await Promise.all([
        command<any>({ type: "get_messages" }),
        command<any>({ type: "get_session_stats" }),
        window.beichen.listSessions(),
      ]);
      setMessages(messageData?.messages || []);
      setContextPercent(statsData?.contextUsage?.percent ?? null);
      setContextTokens(statsData?.contextUsage?.tokens ?? null);
      setContextWindow(statsData?.contextUsage?.contextWindow ?? null);
      setSessionStats(statsData || null);
      setSessions(nextSessions);
      setLiveMessage(null);
      setToolRuns([]);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "刷新会话失败");
    }
  }, [command]);

  useEffect(() => {
    const offPi = window.beichen.onPiEvent((payload) => {
      const event = payload as any;
      switch (event.type) {
        case "agent_start":
          autoScrollRef.current = true;
          runMetricsRef.current = { startedAt: performance.now(), estimatedTokens: 0, actualTokens: 0 };
          setTokenRate(0);
          setRunTokens(0);
          setRunElapsed(0);
          setRateHistory([0]);
          setUsageSource("estimated");
          setIsStreaming(true);
          setLiveMessage(null);
          setToolRuns([]);
          break;
        case "message_start":
          if (event.message?.role === "assistant") {
            setLiveMessage({
              ...event.message,
              content: Array.isArray(event.message.content)
                ? event.message.content.map((block: ContentBlock) => ({ ...block }))
                : event.message.content || [],
            });
          }
          break;
        case "message_update":
          setLiveMessage((current) => applyAssistantStreamEvent(current, event.assistantMessageEvent, event.usage));
          if (
            typeof event.assistantMessageEvent?.delta === "string" &&
            (event.assistantMessageEvent.type === "text_delta" || event.assistantMessageEvent.type === "thinking_delta")
          ) {
            runMetricsRef.current.estimatedTokens += estimateTokenCount(event.assistantMessageEvent.delta);
          }
          break;
        case "message_end":
          if (event.message?.role === "assistant") {
            setMessages((current) => {
              const responseId = event.message.responseId;
              if (responseId && current.some((message) => message.responseId === responseId)) return current;
              return [...current, event.message];
            });
            setLiveMessage(null);
          }
          if (typeof event.message?.usage?.output === "number") {
            runMetricsRef.current.actualTokens = accumulateReportedTokens(
              runMetricsRef.current.actualTokens,
              event.message.usage.output,
            );
            setUsageSource("reported");
          }
          break;
        case "tool_execution_start":
          setToolRuns((runs) => [
            ...runs.filter((run) => run.id !== event.toolCallId),
            { id: event.toolCallId, name: event.toolName, args: event.args, status: "running" },
          ]);
          break;
        case "tool_execution_update":
          setToolRuns((runs) => runs.map((run) => (run.id === event.toolCallId ? { ...run, partial: event.partialResult } : run)));
          break;
        case "tool_execution_end":
          setToolRuns((runs) =>
            runs.map((run) =>
              run.id === event.toolCallId
                ? { ...run, result: event.result, status: event.isError ? "error" : "done" }
                : run,
            ),
          );
          break;
        case "agent_settled":
          {
            const elapsed = Math.max(0.25, (performance.now() - runMetricsRef.current.startedAt) / 1000);
            const count = runMetricsRef.current.actualTokens || runMetricsRef.current.estimatedTokens;
            const rate = count / elapsed;
            setTokenRate(rate);
            setRunTokens(count);
            setRunElapsed(elapsed);
            setRateHistory((history) => [...history.slice(-39), rate]);
          }
          setIsStreaming(false);
          settleRef.current();
          break;
        case "compaction_start":
          setIsCompacting(true);
          break;
        case "compaction_end":
          setIsCompacting(false);
          break;
        case "extension_error":
          setToast(event.error || `扩展错误：${event.extensionPath || "unknown"}`);
          break;
        case "extension_ui_request":
          if (event.method === "notify") setToast(event.message || "插件通知");
          else if (event.method === "set_editor_text") setInput(event.text || "");
          else if (event.method === "setTitle" && event.title) document.title = event.title;
          else if (["select", "confirm", "input", "editor"].includes(event.method)) setExtensionDialog(event);
          break;
        default:
          break;
      }
    });
    const offStatus = window.beichen.onBackendStatus((status) => {
      setBackendStatus(status);
      if (!isTerminalBackendStatus(status.state)) return;

      setIsStreaming(false);
      setIsCompacting(false);
      setLiveMessage(null);
      setExtensionDialog(null);
      setToolRuns((runs) => runs.map((run) => run.status === "running"
        ? { ...run, status: "error", result: status.message || "Pi 引擎意外停止" }
        : run));
      if (configRef.current?.routeTier !== "full") restoreFullAfterLightRef.current = true;
      if (restoreFullAfterLightRef.current) void restoreRouteRef.current();
    });
    const offAuthPrompt = window.beichen.onAuthPrompt((request) => setAuthPrompt(request));
    const offAuthEvent = window.beichen.onAuthEvent((payload) => {
      const event = (payload as any).event;
      if (event?.type === "progress" || event?.type === "info") setToast(event.message);
      if (event?.type === "device_code") setToast(`设备代码：${event.userCode}`);
    });

    void (async () => {
      try {
        const data = await window.beichen.bootstrap();
        if (data.visualThemeOverride) setTheme(data.visualThemeOverride);
        if (data.localeOverride) setLocale(data.localeOverride);
        if (data.settingsTabOverride) {
          setSettingsTab(data.settingsTabOverride);
          setSettingsOpen(true);
        }
        if (data.sidebarCollapsedOverride) setSidebarCollapsed(true);
        if (data.searchOpenOverride) setSearchOpen(true);
        setForceTokenPanel(Boolean(data.tokenPanelOverride));
        if (data.tokenPanelOverride) setTokenPanelOpen(true);
        setBootstrap(data);
        setConfig(data.config);
        configRef.current = data.config;
        setProfiles(data.profiles);
        setCustomApis(data.customApis || []);
        setSecurityNoticeAccepted(data.securityNoticeAccepted);
        setStarSeen(data.starSeen);
        await loadEngineState();
        setSessions(await window.beichen.listSessions());
      } catch (error) {
        setToast(error instanceof Error ? error.message : "北辰 Pi 启动失败");
      }
    })();

    return () => {
      offPi();
      offStatus();
      offAuthPrompt();
      offAuthEvent();
    };
  }, [loadEngineState]);

  useEffect(() => {
    if (!isStreaming) return;
    const timer = window.setInterval(() => {
      const elapsed = Math.max(0.25, (performance.now() - runMetricsRef.current.startedAt) / 1000);
      const count = runMetricsRef.current.actualTokens || runMetricsRef.current.estimatedTokens;
      const rate = count / elapsed;
      setTokenRate(rate);
      setRunTokens(count);
      setRunElapsed(elapsed);
      setRateHistory((history) => [...history.slice(-39), rate]);
    }, 400);
    return () => window.clearInterval(timer);
  }, [isStreaming]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const transcript = transcriptRef.current;
    if (!transcript || !autoScrollRef.current) return;
    transcript.scrollTo({ top: transcript.scrollHeight, behavior: isStreaming ? "auto" : "smooth" });
  }, [messages, liveMessage, toolRuns, isStreaming]);

  useEffect(() => {
    if (!settingsOpen) return;
    void loadProviders();
  }, [settingsOpen, loadProviders]);

  useEffect(() => {
    if (!providers.length) return;
    const eligible = providers.filter((provider) =>
      authMode === "subscription" ? provider.oauth?.isSubscription : Boolean(provider.apiKey),
    );
    if (!eligible.some((provider) => provider.id === selectedProvider)) {
      const preferred =
        eligible.find((provider) => provider.id === configRef.current?.provider) ||
        eligible.find((provider) => provider.id === "openai-codex") ||
        eligible[0];
      setSelectedProvider(preferred?.id || "");
    }
  }, [authMode, providers, selectedProvider]);

  useEffect(() => {
    if (!selectedProvider) {
      setProviderModels([]);
      setSelectedModel("");
      return;
    }
    void window.beichen.listModels(selectedProvider).then((models) => {
      setProviderModels(models);
      const current = configRef.current;
      setSelectedModel((value) => {
        if (value && models.some((model) => model.id === value)) return value;
        if (current?.provider === selectedProvider && current.modelId && models.some((model) => model.id === current.modelId)) return current.modelId;
        return models[0]?.id || "";
      });
    });
  }, [selectedProvider]);

  const restartWith = useCallback(async (
    patch: Partial<WindowConfig>,
    options: { background?: boolean } = {},
  ) => {
    if (!options.background) setSwitching(true);
    setIsStreaming(false);
    setIsCompacting(false);
    setLiveMessage(null);
    setToolRuns([]);
    setExtensionDialog(null);
    try {
      const next = await window.beichen.restartBackend(patch);
      configRef.current = next;
      setConfig(next);
      await loadEngineState();
      return true;
    } catch (error) {
      setToast(error instanceof Error ? error.message : "切换失败");
      return false;
    } finally {
      if (!options.background) setSwitching(false);
    }
  }, [loadEngineState]);

  useEffect(() => {
    restoreRouteRef.current = () => {
      if (routeRestorePromiseRef.current) return routeRestorePromiseRef.current;
      if (!restoreFullAfterLightRef.current && configRef.current?.routeTier === "full") return Promise.resolve(true);

      restoreFullAfterLightRef.current = false;
      setRouteRestoring(true);
      const restorePromise = (async () => {
        const restored = await restartWith({ routeTier: "full" }, { background: true });
        const fullRouteActive = restored && configRef.current?.routeTier === "full";
        restoreFullAfterLightRef.current = !fullRouteActive;
        return fullRouteActive;
      })().finally(() => {
        routeRestorePromiseRef.current = null;
        setRouteRestoring(false);
      });
      routeRestorePromiseRef.current = restorePromise;
      return restorePromise;
    };
  }, [restartWith]);

  useEffect(() => {
    settleRef.current = () => {
      void (async () => {
        await refreshAfterRun();
        await restoreRouteRef.current();
      })();
    };
  }, [refreshAfterRun]);

  const applyProfile = useCallback((profile: ProfileId) => {
    if (configRef.current?.surface !== "codex" || configRef.current.profile === profile) return;
    void restartWith({ profile, routeTier: "full" });
  }, [restartWith]);

  const switchSurface = useCallback((surface: SurfaceMode) => {
    if (switching || isStreaming || routeRestoring || configRef.current?.surface === surface) return;
    void restartWith(surfaceSwitchRestartPatch(surface));
  }, [isStreaming, restartWith, routeRestoring, switching]);

  const sendPrompt = useCallback(async () => {
    const message = input.trim();
    if (
      (!message && attachments.length === 0) ||
      pendingAttachmentCount > 0 ||
      switching ||
      routeRestoring ||
      (isStreaming && restoreFullAfterLightRef.current)
    ) return;
    if (shouldRestoreFullRouteBeforePrompt({
      routeTier: configRef.current?.routeTier,
      restorePending: restoreFullAfterLightRef.current,
      isStreaming,
    }) && !await restoreRouteRef.current()) return;

    const outgoingAttachments = attachments;
    const useLightRoute = shouldUseLightRoute({
      surface: configRef.current?.surface || "codex",
      currentRoute: configRef.current?.routeTier || "full",
      message,
      messageCount: messages.length,
      hasAttachments: outgoingAttachments.length > 0,
      isStreaming,
    });
    let lightRouteActive = false;

    if (useLightRoute) {
      lightRouteActive = await restartWith(
        { routeTier: "light" },
        { background: false },
      );
      restoreFullAfterLightRef.current = lightRouteActive;
      if (!lightRouteActive) {
        restoreFullAfterLightRef.current = true;
        if (!await restoreRouteRef.current()) return;
      }
    }

    const localMessage: AgentMessage = {
      role: "user",
      content: message || "请查看附件",
      timestamp: Date.now(),
      local: true,
    };
    autoScrollRef.current = true;
    setMessages((current) => [...current, localMessage]);
    setInput("");
    replaceAttachments([]);

    try {
      await command({
        type: "prompt",
        message: message || "请查看附件",
        ...(outgoingAttachments.length
          ? {
              images: outgoingAttachments.map((attachment) => ({
                type: "image",
                data: attachment.data,
                mimeType: attachment.mimeType,
              })),
            }
          : {}),
        ...(isStreaming ? { streamingBehavior: "followUp" } : {}),
      });
    } catch (error) {
      setToast(error instanceof Error ? error.message : "消息发送失败");
      if (lightRouteActive) await restoreRouteRef.current();
    }
  }, [attachments, command, input, isStreaming, messages.length, pendingAttachmentCount, replaceAttachments, restartWith, routeRestoring, switching]);

  const onComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (shouldSubmitComposer({
      key: event.key,
      shiftKey: event.shiftKey,
      isComposing: event.nativeEvent.isComposing,
      keyCode: event.nativeEvent.keyCode,
    })) {
      event.preventDefault();
      void sendPrompt();
    }
  };

  const addAttachments = async (files: File[] | null) => {
    if (!files) return;
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    const remainingSlots = Math.max(0, MAX_ATTACHMENTS - attachmentsRef.current.length - pendingAttachmentCountRef.current);
    if (imageFiles.length > remainingSlots) setToast(t("attachmentLimit"));

    const selectedFiles = imageFiles.slice(0, remainingSlots);
    pendingAttachmentCountRef.current += selectedFiles.length;
    setPendingAttachmentCount(pendingAttachmentCountRef.current);
    const next: Attachment[] = [];
    let readFailed = false;
    try {
      for (const file of selectedFiles) {
        try {
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(reader.error || new Error("Image read failed"));
            reader.readAsDataURL(file);
          });
          next.push({
            name: file.name,
            mimeType: file.type,
            data: dataUrl.split(",")[1] || "",
            previewUrl: dataUrl,
          });
        } catch {
          readFailed = true;
        }
      }
    } finally {
      pendingAttachmentCountRef.current = Math.max(0, pendingAttachmentCountRef.current - selectedFiles.length);
      setPendingAttachmentCount(pendingAttachmentCountRef.current);
    }
    if (readFailed) setToast(t("attachmentReadError"));
    if (next.length) replaceAttachments([...attachmentsRef.current, ...next].slice(0, MAX_ATTACHMENTS));
  };

  const newSession = async () => {
    setSwitching(true);
    try {
      const mustResetBackend = shouldResetBackendBeforeNewSession({
        routeTier: configRef.current?.routeTier,
        restorePending: restoreFullAfterLightRef.current,
        isStreaming,
      });
      if (isStreaming) {
        try {
          await command({ type: "abort" });
        } catch {
          // A full backend restart below is the authoritative recovery path.
        }
      }
      if (mustResetBackend) {
        restoreFullAfterLightRef.current = false;
        const restored = await restartWith({ routeTier: "full" }, { background: true });
        if (!restored) return;
      }
      const result = await command<any>({ type: "new_session" });
      if (!result?.cancelled) {
        autoScrollRef.current = true;
        await loadEngineState();
        setLiveMessage(null);
        setIsStreaming(false);
        setTokenRate(0);
        setRunTokens(0);
        setRunElapsed(0);
        setRateHistory([0]);
        setSessions(await window.beichen.listSessions());
      }
    } catch (error) {
      setToast(error instanceof Error ? error.message : "新建任务失败");
    } finally {
      setSwitching(false);
    }
  };

  const selectSession = async (session: SessionInfo) => {
    try {
      setSwitching(true);
      const result = await window.beichen.switchSession(session.path);
      if (!result?.cancelled) await loadEngineState();
    } catch (error) {
      setToast(error instanceof Error ? error.message : "会话切换失败");
    } finally {
      setSwitching(false);
    }
  };

  const pickDirectory = async () => {
    const cwd = await window.beichen.pickDirectory();
    if (cwd) await restartWith({ cwd, routeTier: "full" });
  };

  const connectProvider = async () => {
    if (!selectedProvider) return;
    setSwitching(true);
    try {
      await window.beichen.login(selectedProvider, authMode === "subscription" ? "oauth" : "api_key");
      await loadProviders();
      setToast("接入已完成");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "接入失败");
    } finally {
      setSwitching(false);
    }
  };

  const logoutProvider = async () => {
    if (!selectedProvider) return;
    await window.beichen.logout(selectedProvider);
    await loadProviders();
    setToast("已断开此服务商");
  };

  const changeRuntimeModel = async (provider: string, modelId: string) => {
    if (!provider || !modelId || switching || isStreaming) return false;
    if (provider === configRef.current?.provider && modelId === configRef.current?.modelId) return true;
    setSwitching(true);
    try {
      const result = await window.beichen.setModel(provider, modelId);
      const nextModel = result.model;
      const merged: WindowConfig = {
        ...configRef.current!,
        provider: nextModel?.provider || provider,
        modelId: nextModel?.id || modelId,
        thinkingLevel: result.thinkingLevel,
      };
      configRef.current = merged;
      setConfig(merged);
      setThinkingLevel(result.thinkingLevel);
      setAvailableThinkingLevels(sortThinkingLevels(result.levels || ["off"]));
      setSelectedProvider(merged.provider || "");
      setSelectedModel(merged.modelId || "");
      await loadEngineState();
      return true;
    } catch (error) {
      setToast(friendlyModelError(error instanceof Error ? error.message : error, locale));
      return false;
    } finally {
      setSwitching(false);
    }
  };

  const changeRuntimeThinking = async (level: string) => {
    if (!level || level === thinkingLevel || switching || isStreaming) return;
    setSwitching(true);
    try {
      const result = await window.beichen.setThinking(level);
      setThinkingLevel(result.level);
      setAvailableThinkingLevels(sortThinkingLevels(result.levels || ["off"]));
      if (configRef.current) {
        const merged = { ...configRef.current, thinkingLevel: result.level };
        configRef.current = merged;
        setConfig(merged);
      }
    } catch (error) {
      setToast(friendlyModelError(error instanceof Error ? error.message : error, locale));
    } finally {
      setSwitching(false);
    }
  };

  const applySelectedModel = async () => {
    if (!selectedProvider || !selectedModel) return;
    if (await changeRuntimeModel(selectedProvider, selectedModel)) setSettingsOpen(false);
  };

  const saveCustomApi = async (input: CustomApiInput) => {
    if (switching || isStreaming) return false;
    setSwitching(true);
    try {
      const result = await window.beichen.saveCustomApi(input);
      configRef.current = result.config;
      setConfig(result.config);
      setCustomApis(result.customApis);
      setAuthMode("api");
      setSelectedProvider(result.providerId);
      setSelectedModel(result.modelId);
      await loadEngineState();
      await loadProviders();
      setSelectedProvider(result.providerId);
      setSelectedModel(result.modelId);
      setToast(t("customApiSaved"));
      return true;
    } catch (error) {
      setToast(error instanceof Error ? error.message : "自定义 API 保存失败");
      return false;
    } finally {
      setSwitching(false);
    }
  };

  const removeCustomApi = async (providerId: string) => {
    if (switching || isStreaming) return false;
    setSwitching(true);
    try {
      const result = await window.beichen.deleteCustomApi(providerId);
      configRef.current = result.config;
      setConfig(result.config);
      setCustomApis(result.customApis);
      await loadEngineState();
      await loadProviders();
      setSelectedProvider(result.config.provider || "");
      setSelectedModel(result.config.modelId || "");
      setToast(t("customApiDeleted"));
      return true;
    } catch (error) {
      setToast(error instanceof Error ? error.message : "自定义 API 删除失败");
      return false;
    } finally {
      setSwitching(false);
    }
  };

  const insertCommand = (entry: PiCommandInfo) => {
    setInput(`/${entry.name} `);
    setSettingsOpen(false);
  };

  const clickStar = () => {
    if (starSeen || starFlight) return;
    setStarFlight(true);
    void window.beichen.markStarSeen();
    window.setTimeout(() => {
      setStarFlight(false);
      setStarSeen(true);
    }, 5200);
  };

  const cycleTheme = () => {
    const order: VisualTheme[] = ["codex", "ink", "wuxia", "nekomimi", "cream", "midnight", "cyber"];
    setTheme(order[(order.indexOf(theme) + 1) % order.length]);
  };

  const silentProfileActive = isSilentProfileActive(config?.surface || "codex", Boolean(activeProfile?.silent));
  const conversationEntries = buildConversationEntries(messages, silentProfileActive, isStreaming);
  const liveHasThinking = Boolean(liveMessage && thinkingFromContent(liveMessage.content));
  const showLive = Boolean(liveMessage && (!silentProfileActive || liveHasThinking));
  const contextProfile = config?.surface === "codex" ? config.profile : undefined;
  const empty = conversationEntries.length === 0 && !showLive;

  if (!config || !bootstrap) {
    return (
      <div className={`boot-screen theme-${theme}`}>
        <div className="boot-mark"><img src={logoUrl} alt="北辰 Pi" /><span /></div>
        <h1>北辰 Pi</h1>
        <p>{backendStatus.message}</p>
      </div>
    );
  }

  return (
    <div className={`app-shell theme-${theme} locale-${locale} ${sidebarCollapsed ? "sidebar-collapsed" : ""} ${forceTokenPanel ? "force-token-panel" : ""}`}>
      <header className="titlebar">
        <div className="titlebar-brand">
          <img src={logoUrl} alt="" />
          <span>北辰 Pi</span>
        </div>
        <button className={`beichen-star ${starFlight ? "flying" : ""}`} onClick={clickStar} aria-label={locale === "zh" ? "北辰流星" : "Beichen meteor"}>
          <span className="star-halo" />
          <span className="star-core">✦</span>
          {starFlight ? (
            <span className="meteor-promo">
              <i />
              <strong>关注 B 站的北辰捡垃圾</strong>
            </span>
          ) : null}
        </button>
        <div className="window-controls">
          <button onClick={() => window.beichen.minimize()}><Minimize2 size={14} /></button>
          <button onClick={() => window.beichen.toggleMaximize()}><Square size={12} /></button>
          <button className="close-button" onClick={() => window.beichen.close()}><X size={15} /></button>
        </div>
      </header>

      <div className="app-body">
        <aside className="sidebar">
          <div className="sidebar-top">
            <button className="sidebar-logo-button" onClick={() => setSidebarCollapsed((value) => !value)}>
              <img src={logoUrl} alt="北辰" />
              <PanelLeft size={17} />
            </button>
            <button className="nav-item primary-nav" onClick={() => void newSession()}>
              <SquarePen size={17} /><span>{t("newTask")}</span>
            </button>
            <button className={`nav-item ${searchOpen ? "active" : ""}`} onClick={() => setSearchOpen((value) => !value)}>
              <Search size={17} /><span>{t("searchTasks")}</span>
            </button>
            <button className="nav-item" onClick={() => { setSettingsTab("plugins"); setSettingsOpen(true); }}>
              <Puzzle size={17} /><span>{t("plugins")}</span><em>{commands.length || ""}</em>
            </button>
            <button className="nav-item" onClick={() => { setSettingsTab("performance"); setSettingsOpen(true); }}>
              <FlaskConical size={17} /><span>{t("perfLab")}</span>
            </button>
          </div>

          <div className="sidebar-project">
            <div className="sidebar-section-label"><span>{t("workspace")}</span><button onClick={() => void pickDirectory()}><Plus size={14} /></button></div>
            <button className="project-button" onClick={() => void pickDirectory()}>
              <span className="project-icon"><Folder size={15} /></span>
              <span><strong>{workspaceLabel(config.cwd)}</strong><small>{config.cwd}</small></span>
              <ChevronDown size={13} />
            </button>
          </div>

          <div className="sidebar-history">
            <div className="sidebar-section-label"><span>{t("tasks")}</span></div>
            {searchOpen ? (
              <div className="sidebar-search"><Search size={14} /><input autoFocus value={sessionSearch} onChange={(event) => setSessionSearch(event.target.value)} placeholder={locale === "zh" ? "搜索" : "Search"} /></div>
            ) : null}
            <div className="session-list">
              {filteredSessions.map((session) => (
                <button key={session.path} onClick={() => void selectSession(session)} title={session.cwd}>
                  <span>{session.title}</span>
                  <small>{formatRelativeTime(session.updatedAt, locale)}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="sidebar-bottom">
            <button className="nav-item" onClick={() => window.beichen.newWindow()}><AppWindow size={17} /><span>{t("newWindow")}</span></button>
            <button className="nav-item" onClick={() => { setSettingsTab("general"); setSettingsOpen(true); }}><Settings size={17} /><span>{t("settings")}</span></button>
            <div className="sidebar-version"><img src={logoUrl} alt="" /><span>北辰 Pi<small>v{bootstrap.appVersion}</small></span></div>
          </div>
        </aside>

        <main className={`workspace ${(tokenPanelOpen || forceTokenPanel) ? "token-dock-open" : ""}`}>
          <div className="workspace-toolbar">
            <div className="toolbar-left">
              {sidebarCollapsed ? <button className="icon-button" onClick={() => setSidebarCollapsed(false)}><PanelLeft size={18} /></button> : null}
              <div className="surface-switch">
                <button disabled={switching || isStreaming || routeRestoring} className={config.surface === "chatgpt" ? "active" : ""} onClick={() => switchSurface("chatgpt")}>ChatGPT</button>
                <button disabled={switching || isStreaming || routeRestoring} className={config.surface === "codex" ? "active" : ""} onClick={() => switchSurface("codex")}>Codex</button>
              </div>
              {config.surface === "codex" ? (
                <div className="mode-host">
                  <button className={`mode-chip mode-${config.profile}`} disabled={switching}>
                    <span className="mode-chip-spark">✦</span>
                    <strong>{activeProfile?.label || "CODEX"}</strong>
                    <ChevronDown size={13} />
                  </button>
                  <PerformanceRail profiles={profiles} current={config.profile} onCommit={applyProfile} busy={switching || isStreaming || routeRestoring} locale={locale} />
                </div>
              ) : null}
            </div>
            <div className="toolbar-right">
              <div className="live-metrics toolbar-metrics">
                <span className="token-rate"><Zap size={12} />{tokenRate.toFixed(1)} tok/s</span>
                <ContextRing percent={contextPercent} tokens={contextTokens} contextWindow={contextWindow} locale={locale} />
              </div>
              <button className="model-chip" onClick={() => { setSettingsTab("models"); setSettingsOpen(true); }}>
                <span className={`backend-dot status-${backendStatus.state}`} />
                <strong>{activeModel?.name || config.modelId || t("chooseModel")}</strong>
                <small>{thinkingLevel}</small>
                <ChevronDown size={13} />
              </button>
              <button className="locale-toggle" title={t("language")} onClick={() => setLocale((value) => value === "zh" ? "en" : "zh")}>{locale === "zh" ? "EN" : "中"}</button>
              <button className="icon-button theme-toggle" title={`${t("style")}: ${theme}`} onClick={cycleTheme}><Palette size={16} /></button>
              <button className="icon-button" title={t("newWindow")} onClick={() => window.beichen.newWindow()}><Plus size={18} /></button>
            </div>
          </div>

          <div
            className="transcript"
            ref={transcriptRef}
            onScroll={(event) => {
              autoScrollRef.current = isNearScrollBottom(event.currentTarget);
            }}
          >
            <div className="transcript-inner">
              {empty ? (
                <div className="empty-state">
                  <div className="empty-logo"><img src={logoUrl} alt="北辰 Pi" /><span /></div>
                  <h1>{config.surface === "chatgpt" ? t("chatEmpty") : t("codexEmpty")}</h1>
                  <p>
                    {config.surface === "chatgpt"
                      ? t("chatEmptySub")
                      : t("codexEmptySub")}
                  </p>
                  <div className="suggestion-grid">
                    {(config.surface === "chatgpt"
                      ? [t("suggestionChat1"), t("suggestionChat2"), t("suggestionChat3")]
                      : [t("suggestionCode1"), t("suggestionCode2"), t("suggestionCode3")]
                    ).map((suggestion) => (
                      <button key={suggestion} onClick={() => setInput(suggestion)}>
                        {config.surface === "chatgpt" ? <MessageSquare size={16} /> : <FileCode2 size={16} />}
                        {suggestion}
                        <ArrowUp size={14} />
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {conversationEntries.map((entry, index) => (
                <MessageCard
                  key={`${entry.message.timestamp || 0}-${index}-${entry.message.role}`}
                  message={entry.message}
                  locale={locale}
                  profile={contextProfile}
                  thinkingOnly={entry.thinkingOnly}
                  contextSettled={entry.contextSettled}
                />
              ))}
              {showLive && liveMessage ? (
                <MessageCard
                  message={liveMessage}
                  locale={locale}
                  live
                  profile={contextProfile}
                  thinkingOnly={silentProfileActive}
                />
              ) : null}
              {!silentProfileActive ? <ToolTimeline runs={toolRuns} locale={locale} /> : null}
              {isStreaming && silentProfileActive ? (
                <div className={`silent-run silent-${config.profile}`} aria-label={t("silentWorking")}>
                  <span className="silent-orbit"><i /><i /><i /></span>
                </div>
              ) : null}
            </div>
          </div>

          <div className="composer-zone">
            <div className={`composer ${isStreaming ? "streaming" : ""}`}>
              {attachments.length ? (
                <div className="attachment-strip">
                  {attachments.map((attachment, index) => (
                    <div className="attachment-preview" key={`${attachment.name}-${index}`}>
                      <img src={attachment.previewUrl} alt={attachment.name} />
                      <button onClick={() => replaceAttachments(attachmentsRef.current.filter((_, itemIndex) => itemIndex !== index))}><X size={12} /></button>
                    </div>
                  ))}
                </div>
              ) : null}
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={onComposerKeyDown}
                placeholder={config.surface === "chatgpt" ? t("ask") : `${locale === "zh" ? "在" : t("workIn")} ${workspaceLabel(config.cwd)}${locale === "zh" ? ` ${t("workIn")}` : ""}`}
                rows={1}
              />
              <div className="composer-actions">
                <div className="composer-left">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    hidden
                    onChange={(event) => {
                      const files = event.currentTarget.files ? Array.from(event.currentTarget.files) : null;
                      event.currentTarget.value = "";
                      void addAttachments(files);
                    }}
                  />
                  <button title={t("attach")} onClick={() => fileInputRef.current?.click()}><Paperclip size={18} /></button>
                  <button title={t("voice")}><Mic size={18} /></button>
                  {config.surface === "codex" ? (
                    <button className="cwd-mini" title={config.cwd} onClick={() => void pickDirectory()}><Folder size={14} /><span>{workspaceLabel(config.cwd)}</span></button>
                  ) : null}
                  <ModelReasoningControl
                    models={engineModels}
                    activeModel={activeModel}
                    configuredModelId={config.modelId}
                    thinkingOptions={thinkingOptions}
                    thinkingLevel={thinkingLevel}
                    locale={locale}
                    busy={switching || isStreaming || routeRestoring}
                    onModel={(provider, modelId) => void changeRuntimeModel(provider, modelId)}
                    onThinking={(level) => void changeRuntimeThinking(level)}
                    initialOpen={Boolean(bootstrap.modelControlOverride)}
                    initialSubmenu={bootstrap.modelControlSubmenuOverride}
                  />
                </div>
                {isStreaming ? (
                  <button className="send-button stop" title={t("stop")} onClick={() => void command({ type: "abort" })}><CircleStop size={19} /></button>
                ) : (
                  <button className="send-button" disabled={(!input.trim() && !attachments.length) || pendingAttachmentCount > 0 || switching || routeRestoring} onClick={() => void sendPrompt()}><ArrowUp size={19} /></button>
                )}
              </div>
            </div>
            <div className="composer-meta">
              <span>{config.surface === "codex" ? activeProfile?.label : "CHATGPT"} · {t("thinkingStrength")} {thinkingLevel.toUpperCase()}</span>
              <span>{isCompacting ? t("compacting") : contextPercent == null ? t("contextReady") : `${t("context")} ${formatPercent(contextPercent)}%`}</span>
            </div>
          </div>
          <TokenInspector
            stats={sessionStats}
            latestUsage={latestUsage}
            model={activeModel}
            locale={locale}
            tokenRate={tokenRate}
            runTokens={runTokens}
            runElapsed={runElapsed}
            rateHistory={rateHistory}
            usageSource={usageSource}
            thinkingLevel={thinkingLevel}
            isStreaming={isStreaming}
            isCompacting={isCompacting}
            autoCompactionEnabled={autoCompactionEnabled}
            open={tokenPanelOpen || forceTokenPanel}
            onToggle={() => setTokenPanelOpen((value) => !value)}
          />
        </main>
      </div>

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        activeTab={settingsTab}
        setActiveTab={setSettingsTab}
        config={config}
        profiles={profiles}
        providers={providers}
        selectedProvider={selectedProvider}
        setSelectedProvider={setSelectedProvider}
        authMode={authMode}
        setAuthMode={setAuthMode}
        models={providerModels}
        selectedModel={selectedModel}
        setSelectedModel={setSelectedModel}
        customApis={customApis}
        customApiFormOpen={bootstrap.customApiFormOverride}
        commands={commands}
        busy={switching || isStreaming || routeRestoring}
        onPickDirectory={() => void pickDirectory()}
        onNewWindow={() => window.beichen.newWindow()}
        onConnect={() => void connectProvider()}
        onLogout={() => void logoutProvider()}
        onApplyModel={() => void applySelectedModel()}
        onSaveCustomApi={saveCustomApi}
        onDeleteCustomApi={removeCustomApi}
        onProfile={applyProfile}
        onInsertCommand={insertCommand}
        onOpenPluginRoot={() => void window.beichen.openPluginRoot()}
        locale={locale}
        theme={theme}
        t={t}
        onTheme={setTheme}
      />

      {authPrompt ? (
        <AuthPromptModal
          request={authPrompt}
          t={t}
          onSubmit={(value) => {
            void window.beichen.replyAuth(authPrompt.id, value);
            setAuthPrompt(null);
          }}
          onCancel={() => {
            void window.beichen.cancelAuth(authPrompt.id);
            setAuthPrompt(null);
          }}
        />
      ) : null}

      {!securityNoticeAccepted ? (
        <SecurityNoticeModal
          locale={locale}
          onAccept={() => {
            void window.beichen.acceptSecurityNotice().then(() => setSecurityNoticeAccepted(true));
          }}
        />
      ) : null}

      {extensionDialog ? (
        <ExtensionModal
          key={extensionDialog.id}
          dialog={extensionDialog}
          t={t}
          onRespond={async (response) => {
            const dialogId = extensionDialog.id;
            try {
              await window.beichen.raw({ type: "extension_ui_response", id: dialogId, ...response });
              setExtensionDialog((current) => current?.id === dialogId ? null : current);
            } catch (error) {
              setToast(error instanceof Error ? error.message : "插件响应失败");
            }
          }}
        />
      ) : null}

      {switching ? (
        <div className="switching-overlay"><div className="switching-orb"><span /><span /><span /></div></div>
      ) : null}
      {toast ? <div className="toast"><Sparkles size={15} />{toast}</div> : null}
    </div>
  );
}
