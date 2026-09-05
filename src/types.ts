export type SurfaceMode = "chatgpt" | "codex";
export type ProfileId = "codex" | "benchmark" | "efficiency" | "ultra" | "quantum" | "ghost";
export type VisualTheme = "codex" | "ink" | "cyber" | "wuxia" | "nekomimi" | "cream" | "midnight";
export type Locale = "zh" | "en";
export type RouteTier = "full" | "light";
export type CustomApiProtocol = "openai-completions" | "openai-responses" | "anthropic-messages" | "google-generative-ai";
export type CustomThinkingFormat = "auto" | "openai" | "openrouter" | "deepseek" | "qwen";

export interface PerformanceProfile {
  id: ProfileId;
  label: string;
  subtitle: string;
  recommendedThinking: string;
  silent: boolean;
  contextMode: string;
  hidden?: boolean;
}

export interface WindowConfig {
  cwd: string;
  surface: SurfaceMode;
  profile: ProfileId;
  routeTier: RouteTier;
  provider?: string;
  modelId?: string;
  thinkingLevel?: string;
}

export interface BootstrapData {
  appVersion: string;
  config: WindowConfig;
  profiles: PerformanceProfile[];
  customApis: CustomApiInfo[];
  securityNoticeAccepted: boolean;
  starSeen: boolean;
  platform: string;
  visualThemeOverride?: VisualTheme;
  localeOverride?: Locale;
  settingsTabOverride?: string;
  tokenPanelOverride?: boolean;
  customApiFormOverride?: boolean;
  modelControlOverride?: boolean;
  modelControlSubmenuOverride?: "model" | "thinking";
  sidebarCollapsedOverride?: boolean;
  searchOpenOverride?: boolean;
}

export interface CustomApiInfo {
  providerId: string;
  name: string;
  baseUrl: string;
  api: CustomApiProtocol;
  modelId: string;
  modelName: string;
  contextWindow: number;
  maxTokens: number;
  reasoning: boolean;
  imageInput: boolean;
  extendedThinking: boolean;
  thinkingFormat: CustomThinkingFormat;
  supportsDeveloperRole: boolean;
  authHeader: boolean;
  useApiKey: boolean;
  hasApiKey: boolean;
  updatedAt: number;
}

export interface CustomApiInput extends Omit<CustomApiInfo, "providerId" | "hasApiKey" | "updatedAt"> {
  providerId?: string;
  apiKey?: string;
}

export interface ContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  name?: string;
  id?: string;
  arguments?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface AgentMessage {
  role: "user" | "assistant" | "toolResult" | string;
  content: string | ContentBlock[];
  timestamp?: number;
  model?: string;
  provider?: string;
  stopReason?: string;
  usage?: MessageUsage;
  [key: string]: unknown;
}

export interface MessageUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cacheWrite1h?: number;
  reasoning?: number;
  totalTokens: number;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
}

export interface SessionStats {
  sessionFile?: string;
  sessionId: string;
  userMessages: number;
  assistantMessages: number;
  toolCalls: number;
  toolResults: number;
  totalMessages: number;
  tokens: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
  cost: number;
  contextUsage?: {
    tokens: number | null;
    contextWindow: number;
    percent: number | null;
  };
}

export interface ProviderInfo {
  id: string;
  name: string;
  ready: boolean;
  authSource?: string;
  apiKey: { name: string; canLogin: boolean } | null;
  oauth: { name: string; loginLabel: string; isSubscription: boolean } | null;
  modelCount: number;
}

export interface ModelInfo {
  id: string;
  provider: string;
  name: string;
  reasoning: boolean;
  input: string[];
  contextWindow?: number;
  maxTokens?: number;
}

export interface SessionInfo {
  path: string;
  id: string;
  title: string;
  cwd: string;
  updatedAt: number;
}

export interface PiCommandInfo {
  name: string;
  description?: string;
  source: "extension" | "prompt" | "skill" | string;
  location?: string;
  path?: string;
}

export interface Attachment {
  name: string;
  mimeType: string;
  data: string;
  previewUrl: string;
}

export interface ToolRun {
  id: string;
  name: string;
  args?: unknown;
  partial?: unknown;
  result?: unknown;
  status: "running" | "done" | "error";
}

export interface AuthPromptRequest {
  id: string;
  providerId: string;
  prompt: {
    type: "text" | "secret" | "select" | "manual_code";
    message: string;
    placeholder?: string;
    options?: Array<{ id: string; label: string; description?: string }>;
  };
}

export interface ExtensionDialog {
  type: "extension_ui_request";
  id: string;
  method: "select" | "confirm" | "input" | "editor" | string;
  title?: string;
  message?: string;
  options?: string[];
  placeholder?: string;
  value?: string;
  prefill?: string;
  [key: string]: unknown;
}
