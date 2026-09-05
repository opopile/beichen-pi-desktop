# Beichen Pi 1.8.1 Complete User Guide

> 中文版本：[北辰 Pi 1.8.1 完整使用说明](北辰Pi使用说明.md)
>
> Beichen Pi is an independent, unofficial open-source project. It is not affiliated with, sponsored by, or endorsed by any supported model provider.
>
> Agent mode is not a security sandbox. It can execute PowerShell, read and modify workspace files, and load Pi extensions with the current Windows user’s permissions. Open only trusted projects, enable Git, and keep an offline backup of important data.

> Supported platform: Windows 10/11 x64<br />
> Current runtime: Electron 44 + Pi 0.84.4 RPC<br />
> Document version: 1.8.1

## 1. Product overview

Beichen Pi is a local-first minimalist desktop agent platform that packages the Pi coding agent as a Windows application. It supports ordinary conversation and project execution while retaining Pi models, sessions, tools, skills, extensions, authentication, context compaction, and session history.

Core capabilities:

- Chat and Agent workspaces.
- One independent Pi RPC process per window.
- Built-in API-key access, subscription OAuth, custom APIs, and keyless local-model endpoints.
- Independent provider, model, reasoning level, workspace, and context mode in every window.
- Installer and portable builds.
- Seven interface themes and instant Chinese/English switching.
- Live token/s and a Codex-style context ring.
- Pi sessions, skills, extensions, and prompt templates.
- Five visible Agent performance modes; the legacy Extreme implementation is currently hidden.
- Image attachments, streamed responses, task cancellation, and structured error messages.

Beichen Pi is designed primarily for locally deployed models such as Ollama, LM Studio, and vLLM. Cloud providers remain available, but the application does not require a cloud-only workflow.

## 2. Download editions

Published builds are available from [GitHub Releases](https://github.com/opopile/beichen-pi-desktop/releases/latest):

- `Beichen-Pi-Setup-1.8.1-x64.exe`: installer.
- `Beichen-Pi-Portable-1.8.1-x64.exe`: portable executable with the same custom model/reasoning menus, context ring, context-mode slider, real-time provider-returned thinking, and Quantum/Ghost visualization.

### 2.1 Installer

Recommended for daily use. The setup wizard lets you choose an installation directory and create desktop and Start Menu shortcuts.

### 2.2 Portable build

No installation is required. Run the executable directly. It extracts runtime files to the Windows temporary directory on first launch, so the first start can be slower than the installed edition.

### 2.3 SmartScreen

The current builds do not use a purchased commercial code-signing certificate. Windows may show “Unknown publisher” or a SmartScreen warning. Download only from this project’s GitHub Release and verify the published SHA-256. Do not disable antivirus software to bypass the warning.

## 3. System requirements

- Windows 10 or Windows 11, x64.
- 8 GB RAM or more recommended.
- At least 500 MB of free disk space.
- Internet access for cloud models.
- Node.js does not need to be installed on the target machine; Node 24 is bundled.
- Cloud calls require a valid API key or supported subscription. Keyless access is available for local endpoints that do not require authentication.

## 4. First launch

1. Run the installer build or portable executable.
2. The app reads the global Pi configuration directory.
3. It opens the last workspace; if none exists, it uses the launch directory or Documents.
4. A green model-status dot means the Pi RPC backend and model catalog are ready.
5. If credentials are missing, open **Settings → Models & Access**.
6. The purple Beichen star promotion animation is shown once per application version.

## 5. Main interface

### 5.1 Custom title bar

The title bar contains:

- Beichen Pi icon and product name.
- Purple Beichen star in the center.
- Minimize, maximize, and close buttons.

Blank title-bar areas can drag the window. Control areas do not trigger dragging.

### 5.2 Left sidebar

The sidebar contains:

- **New task**: create an empty Pi session in the current window.
- **Search tasks**: filter session history by title or workspace.
- **Plugins & Skills**: open extensions, skills, and prompt templates.
- **Performance Lab**: open Agent performance-mode settings.
- **Workspace**: show and switch the current working directory.
- **Task list**: display saved Pi sessions.
- **New window**: create an independent window and Pi process.
- **Settings**: open the settings panel on the right.

Click the sidebar icon to collapse or expand it. When collapsed, its width and border drop to zero, and the conversation, composer, and token row reflow across the full window rather than leaving an invisible spacer.

The task search field follows the selected theme. Light themes update its background, border, text, placeholder, focus, and autofill states without a restart.

### 5.3 Top work bar

The top bar contains:

- Chat/Agent workspace switch.
- Agent performance-mode control.
- Active model, provider state, and reasoning level.
- Chinese/English switch.
- Theme shortcut.
- New-window button.

### 5.4 Conversation area

The conversation area displays:

- User messages.
- Assistant responses and Markdown.
- Code blocks, tables, lists, and links.
- Expandable provider-returned thinking.
- Tool calls and execution states.
- Structured model errors.

Ultra Max, Quantum Collapse, and Ghost Payload suppress progress chatter and tool timelines while a task runs, then show the final result. Provider-returned thinking remains visible in real time in every mode.

### 5.4.1 Thinking and the actual model context

- The thinking panel is expanded by default and grows from Pi `thinking_delta` events. It can be collapsed manually.
- Quantum/Ghost show a live state until the current tool loop is finished; they do not claim compression or removal early.
- After a Quantum turn, a vertical brace connects the complete visible thinking to a **Compressed** card. That card shows the digest actually carried into the next request.
- After a Ghost turn, a brace marks the completed thinking as **Removed**. The visible original remains in the local session, but it is not injected into later model context.
- Thinking from every assistant segment in a multi-tool turn remains visible. Quiet modes suppress progress prose, not provider-returned thinking.
- The interface only displays thinking supplied by the provider through Pi. It does not infer or fabricate hidden chain-of-thought.

### 5.5 Composer

The composer supports:

- Plain text.
- `Shift + Enter` for a line break.
- `Enter` to send.
- Up to four image attachments.
- Workspace switching.
- Stopping an active streamed task.
- Changing the current window’s model under the composer.
- Changing the reasoning level in Chat and every Agent performance mode.
- Displaying the active performance mode, effective reasoning level, token/s, and context ring.

Model and reasoning controls share one compact pill. Opening it shows only two rows—**Model** and **Reasoning level**—with custom right-side submenus. The selected item has a check mark, providers and models are grouped, and long model lists scroll inside the submenu.

The token dashboard keeps its own context-ring entry. Agent context modes use the separate top-left mode slider: CODEX/BENCHMARK use a blue track; Ultra Max, Quantum Collapse, and Ghost Payload use a purple gradient, star particles, and a white thumb.

### 5.6 Input and link safety

- While a Chinese IME is composing text, `Enter` confirms the candidate rather than sending the message.
- Removing an image clears the file input so the same image can be selected again.
- Streaming auto-scroll follows only when the view is near the bottom; it does not pull the user down after manual scrolling.
- Markdown links never create an Electron child window. Only `http`, `https`, and `mailto` are handed to the system default application. `file`, `javascript`, `data`, and unknown schemes are blocked.

## 6. Chat and Agent workspaces

### 6.1 Chat

Use Chat for questions, explanations, writing, analysis, and creative work.

- File-editing tools are not loaded.
- A general conversation prompt is used.
- It does not directly modify project files.

### 6.2 Agent

Use Agent to inspect projects, modify code, execute commands, run tests, and deliver completed work.

Default tools include:

- `read`
- `powershell`
- `edit`
- `write`
- `grep`
- `find`
- `ls`

Agent also loads Pi project context, skills, and extensions.

## 7. Workspace

The workspace determines:

- Where Pi tools execute.
- Where project-level `.pi`, `.agents`, and instruction files are discovered.
- How saved sessions are grouped.
- The default root for file operations.

Switch it by:

1. Clicking the workspace card in the sidebar;
2. Clicking the directory button beside the composer; or
3. Opening **Settings → General**.

Changing the workspace restarts the Pi RPC for the current window only. Other windows are unaffected.

## 8. Sessions and history

Pi sessions are stored under:

```text
%USERPROFILE%\.pi\agent\sessions
```

The app can:

- Create a session.
- Restore history from the sidebar.
- Save model, reasoning level, messages, and tool results.
- Preserve Pi session trees, branches, and compaction records.

Automated tests may create sessions named after test prompts. They can be archived or removed from the Pi session directory when no longer needed.

## 9. Models and access

Open **Settings → Models & Access**.

### 9.1 Subscription access

The **Subscription** view lists providers for which Pi supports OAuth, which may include:

- OpenAI Codex through ChatGPT Plus/Pro.
- Anthropic.
- GitHub Copilot.
- xAI.
- Other subscription providers supported by Pi.

Select **Connect subscription** and finish the provider’s browser authorization flow.

### 9.2 API keys

The **API** view lists API providers supported by Pi. Select **Configure API key** and enter the key in the secure field.

API keys are not written into chat history. Credentials are managed by Pi authentication storage.

Authentication prompts include **Cancel**. Canceling rejects the pending input; closing the owning window also rejects and clears its pending authentication promise.

### 9.3 Selecting a model

The fastest method is the model control under the composer. It changes the model in the current Pi session without restarting RPC, clearing messages, or affecting other windows.

You can also use settings:

1. Select a provider.
2. Confirm that its state is **Connected**.
3. Select a model.
4. Choose **Apply to current window**.

The session remains intact. If the new model does not support the previous reasoning level, Pi falls back to a supported value and the UI displays the value that actually took effect.

### 9.4 Reasoning levels

The reasoning menu comes from Pi `get_available_thinking_levels`, so it lists only values genuinely supported by the current model:

- `Off`: no additional reasoning.
- `Minimal`: minimal reasoning.
- `Low`: low reasoning.
- `Medium`: medium reasoning.
- `High`: high reasoning.
- `Extra High`: maps to `xhigh`.
- `Max`: the highest level publicly supported by that model.

Different models expose different lists. Non-reasoning models usually show only `Off`. A selection applies immediately to the current window and session.

Model, reasoning level, and performance mode are independent:

- The model determines capability, context limit, price, and available reasoning levels.
- The reasoning level determines the effort used for the current work.
- The performance mode determines progress visibility, verification bias, tool strategy, and post-turn context handling.

Changing Chat/Agent, changing a performance mode, triggering the exact-greeting light route, or changing the workspace does not overwrite a manually selected reasoning level.

### 9.5 Custom API endpoints

Open **Settings → Models & Access**, scroll to **Custom API**, and select **Add custom API**. Saving the endpoint applies it to the current window and adds it to the composer model list.

The app ships **Quick setup** presets (for example Baimeow · Kimi K3 Max): selecting a preset fills in the endpoint and model automatically — paste your API key and choose **Save and apply**. Presets whose endpoint and model are already saved hide themselves.

Basic fields:

- **Connection name**: a local label such as “Office Gateway” or “Local Ollama”.
- **API base URL**: the service root, for example `https://api.example.com/v1` or `http://127.0.0.1:11434/v1`. Do not put credentials or a terminal `/chat/completions` path in this field.
- **Protocol**: OpenAI Chat Completions, OpenAI Responses, Anthropic Messages, or Google Generative AI.
- **Model ID**: the exact identifier accepted by the server.
- **Display name**: an optional friendly name.
- **API key**: required only when the endpoint authenticates. Check **Local service requires no key** for keyless Ollama, LM Studio, vLLM, and similar deployments.

Advanced compatibility fields:

- Context limit and maximum output tokens.
- Reasoning and image-input support.
- `Extra High / Max` support.
- Reasoning parameter format: automatic, OpenAI `reasoning_effort`, OpenRouter, DeepSeek, or Qwen.
- `developer` role support.
- Whether `Authorization: Bearer` must be forced.

Save behavior:

1. The app validates URL, model ID, and token limits.
2. API keys are encrypted through Electron `safeStorage` and Windows-backed credentials.
3. The model is merged into Pi `%USERPROFILE%\.pi\agent\models.json` without overwriting existing providers.
4. `models.json` stores only a `$BEICHEN_CUSTOM_API_...` environment-variable reference, not the plaintext key.
5. Every window refreshes the Pi model catalog. The current window switches to the new model; other windows keep their own selections.

Leaving the key blank while editing keeps the existing encrypted value. Deleting an endpoint requires confirmation; windows currently using it fall back to the model selected before that endpoint was activated.

Custom endpoints use Pi’s native model layer, so tools, sessions, token telemetry, reasoning levels, and performance modes remain available. Actual behavior depends on the server’s protocol implementation. Saving does not send a test chat or consume model tokens; the first real conversation validates networking and credentials.

### 9.6 Common model states

- Green: backend and model catalog are ready.
- Yellow: starting or refreshing.
- Red: Pi process, credentials, or model loading failed.

## 10. Multiple windows and instances

**New window** creates another Electron `BrowserWindow` and an independent Pi RPC.

Each window can independently use a different:

- Workspace.
- Chat/Agent mode.
- Model and provider.
- Reasoning level and performance mode.
- Session.

Running the EXE more than once also creates multiple application instances.

## 11. Agent performance modes

Hover the top Agent performance control or open **Settings → Performance Modes**.

| Mode | Reasoning | Output strategy | Context strategy | Best use |
| --- | --- | --- | --- | --- |
| CODEX | User-selected | Sparse useful progress | Lean Pi prompt + Pi native compaction | Daily project work |
| BENCHMARK | User-selected; Max recommended when supported | Benchmark evidence remains visible | Real metrics, baseline, bottleneck analysis, strict verification | Benchmarks and extreme optimization |
| ULTRA MAX | User-selected and fully executed | Silent while running; final response only | Lean Pi prompt + Pi native compaction | Unattended complex tasks |
| QUANTUM COLLAPSE | User-selected and fully executed | Same as Ultra Max | Completed thinking becomes a local digest + Pi native compaction | Long sessions that still need reasoning breadcrumbs |
| GHOST PAYLOAD | User-selected and fully executed | Same as Ultra Max | Completed thinking removed from future requests + Pi native compaction | Minimum future context payload |

No performance mode forces or resets reasoning effort. When a model change makes the selected level unavailable, Pi performs a capability-based fallback and the UI shows the effective value.

The `EXTREME EFFICIENCY` implementation is retained internally but is hidden from the slider, settings, and guide. Legacy settings that reference it fall back to CODEX.

### 11.1 Built-in mode guide

The final settings item is **User Guide**. It contains:

- A comparison of Chat, Agent, and five visible modes.
- Reasoning selection, progress visibility, tools, and compaction behavior.
- Suitable and unsuitable task types.
- Latency, cost, context, and observability tradeoffs.
- Recommendations for switching modes.
- The real boundaries of Quantum compression and Ghost removal.

Expanding a guide section does not change the active mode. Modes are changed only from the top performance control or **Settings → Performance Modes**.

### 11.2 Shared post-turn lifecycle

Quantum Collapse and Ghost Payload follow the same lifecycle boundary:

1. The current turn runs at the user-selected reasoning level.
2. The model calls tools, verifies work, and produces the final result normally.
3. Completed-turn thinking is processed only when the next request is prepared.
4. The active tool loop and its signatures remain intact.
5. Pi native automatic compaction stays enabled. Mode processing is an additive layer and does not replace the complete `compact` operation.

Compression or removal therefore does not mean that the model was prevented from thinking. It does not reduce the quality or provider billing of a turn that has already finished.

### 11.3 Quantum Collapse boundaries

Quantum adds local, post-turn reasoning compression on top of Ultra Max:

- Completed thinking becomes a `<reasoning_digest>` of up to roughly 480 characters.
- The digest favors the opening premise, conclusion, root cause, verification, and next step.
- User messages, final responses, and tool evidence are unchanged.
- No extra model request is made, so there is no summarization call latency or cost.
- The original on-disk session is not rewritten; only temporary context prepared for later model requests changes.

### 11.4 Ghost Payload boundaries

Ghost changes only the context sent with future requests:

- Completed-turn thinking blocks are removed.
- Signatures required by the active tool loop are retained.
- Final responses, tool evidence, and user messages remain.
- Pi native compaction remains enabled.

Ghost cannot make provider-generated tokens free and cannot bypass provider context or billing rules.

## 12. Appearance and themes

Open **Settings → Appearance & Themes** and select a theme card. The change applies immediately and is stored locally.

Themes only change presentation. They do not alter models, prompts, context, permissions, or performance behavior. They cover the title bar, sidebar, search, conversation, composer, model/reasoning submenus, settings, and token dashboard.

### 12.1 Minimal Codex

- Flat dark interface.
- Information density close to the Codex desktop experience.
- Minimal decoration for sustained work.

### 12.2 Ink Wash

- Rice paper, ink diffusion, and negative space.
- Light reading environment.
- Low-contrast background that does not obscure code.

### 12.3 Wuxia Swordsman

- Dark jianghu atmosphere, distant ink mountains, and a swordsman background.
- Ink black, smoke gray, and restrained cinnabar accents.
- Chinese headings use a more martial type style.

### 12.4 Gentle Nekomimi

- Warm white, soft pink, and pale purple.
- A gentle adult cat-eared character on the right.
- Low-contrast, adult, non-revealing design.

### 12.5 Cream Comfort

- Cream, oat, and sage-green palette.
- Plants and soft paper texture.
- Intended for long reading with low visual fatigue.

### 12.6 Midnight Glass

- Deep blue night, aurora haze, and glass arcs.
- Broad-appeal dark theme.
- Technical character without dense cyberpunk noise.

### 12.7 Cyber Tech

- Preserves the purple glow language from version 1.0.
- Stronger purple mode slider and glow effects.
- Intended for users who prefer a more expressive visual style.

## 13. Chinese/English switching

Select `EN` or `中` in the top bar.

The switch updates:

- Navigation and settings.
- Empty states.
- Buttons, hints, errors, and metric labels.
- Time formatting.

User messages, model responses, provider names, and existing session titles are not translated automatically.

## 14. Token speed

The composer footer shows `tok/s`.

Calculation:

1. During streaming, text deltas are converted into a local token estimate.
2. When final assistant usage arrives, real output-token data corrects the estimate.
3. Speed is output tokens divided by total run time.

Tool execution, network waits, and silent reasoning reduce the displayed average. This is end-to-end run speed, not a provider’s isolated peak decoder speed.

### 14.1 Opening the complete token dashboard

A dedicated token status row remains visible at the bottom. It includes the context ring, model, used tokens, context limit, remaining tokens, and live speed. Click the row or arrow to expand **Complete Token Dashboard** upward from the bottom.

When expanded:

- The composer moves upward.
- The conversation gains matching bottom space.
- The dashboard occupies its own layout row and does not cover content.
- It does not depend on hover, so it works consistently with touchpads, touchscreens, and different DPI settings.

### 14.2 Context capacity

The large ring and capacity bar show:

- Context tokens used.
- Context tokens remaining.
- Model context limit.
- Used percentage, with two decimal places below 1%.
- Maximum model output tokens.
- Ring progress and a used/remaining position marker.

### 14.3 Session totals

The session section uses Pi `get_session_stats` and includes:

- Input tokens.
- Output tokens.
- Cache-read tokens.
- Cache-write tokens.
- Total tokens.
- Cache hit rate.
- Accumulated cost.
- A colored stacked proportion chart.

Session totals can include assistant messages, internal model calls made by tools, context compaction, and branch summaries, so they may exceed the visible-message total.

### 14.4 Latest model response

When the provider returns complete usage, the dashboard shows:

- Input and output tokens.
- Reasoning tokens.
- Cache reads and writes.
- Anthropic one-hour cache writes when supplied.
- Total tokens and cache hit rate.
- Total cost and input/output/cache cost breakdown.

Reasoning tokens are a subset of output tokens and are not added twice. If a provider does not report reasoning, the field shows `—`.

### 14.5 Current-run chart

The current-run section shows:

- Live token/s.
- Output tokens so far.
- Elapsed seconds.
- A line/area chart for roughly the latest 40 speed samples.
- Whether the source is a streaming estimate or provider usage.
- Automatic-compaction state.
- Active reasoning level.

### 14.6 Message and tool counts

The activity section shows:

- User-message count.
- Assistant-message count.
- Tool-call count.
- Tool-result count.
- Total messages.
- Short session ID.

### 14.7 Accuracy and unavailable data

- Final usage and `SessionStats` are authoritative when available.
- Token/s is estimated during streaming because final provider usage has not arrived.
- The estimate is corrected by real output usage at completion.
- Context tokens are Pi’s current estimate for compaction decisions.
- Context and percentage can show `—` after compaction and before the next model response.
- Subscription providers may omit monetary cost.
- Some models omit reasoning, cache-write, or cache-read details.
- Missing fields show `—`; they are never replaced with a fake zero.

## 15. Context ring

The ring uses real context statistics from Pi `get_session_stats`.

- Center value: current context percentage, including decimals at low usage.
- Ring progress: proportion of the context window in use.
- Click the bottom status row: expand or collapse the complete dashboard.
- `0` or an empty ring: new session or no valid usage yet.
- Temporarily empty after compaction: the next response must produce a fresh valid statistic.

## 16. Plugins, skills, and prompt templates

Open **Settings → Plugins & Skills**. The list is retrieved live through Pi RPC `get_commands`.

Source types:

- `extension`: Pi extension command.
- `skill`: a skill command beginning with `/skill:`.
- `prompt`: a prompt template.

Selecting an item inserts its slash command into the composer; it does not send immediately.

**Open Pi resource directory** opens:

```text
%USERPROFILE%\.pi\agent
```

Restart the window after adding or modifying resources to ensure complete loading.

## 17. Image attachments

1. Select the paperclip beside the composer.
2. Choose PNG, JPG, WebP, or another supported image.
3. Attach up to four images per message.
4. Use the close button on a thumbnail to remove it.

Only models that support image input can process attachments.

## 18. Context compaction

Pi automatically compacts history as context approaches the limit.

Compaction aims to retain:

- User goals.
- Hard constraints.
- Completed work.
- Files read or modified.
- Verification evidence.
- Blockers and next steps.

Quantum Collapse and Ghost Payload do not replace this mechanism. They process only completed-turn thinking before the next request: Quantum creates a local digest; Ghost removes it. Current-turn thinking and the active tool loop are unaffected.

## 19. Credentials, privacy, and local data

Pi’s default configuration directory is:

```text
%USERPROFILE%\.pi\agent
```

Common resources:

- `settings.json`: default Pi model and settings.
- `auth.json`: API/OAuth credentials.
- `models-store.json`: model-catalog cache.
- `sessions/`: session history.
- `skills/`: global skills.
- `extensions/`: global extensions.

Security recommendations:

- Never upload `auth.json` to a public repository.
- Never paste a complete API key into chat.
- Review provider usage and cost regularly.
- Handle credential files separately when backing up sessions.
- Theme and language are stored in Electron local storage.

## 20. Errors and troubleshooting

### 20.1 HTTP 401: authentication failed

Cause: invalid or expired API key, or expired OAuth authorization.

1. Open **Settings → Models & Access**.
2. Disconnect the provider.
3. Configure the key again or reconnect the subscription.

### 20.2 HTTP 403: permission denied

Cause: the API project lacks model access or the provider rejected the current project.

Use a project or subscription with access, or switch providers.

### 20.3 HTTP 404: model unavailable

Cause: the model was retired, renamed, or is not visible to the current account.

Refresh the model catalog and choose a currently supported model.

### 20.4 HTTP 429: quota or rate limit

Possible causes include exhausted credit, zero free quota, per-minute/daily limits, or provider load.

- Retry later.
- Switch models.
- Check billing and quota.
- Use another API or subscription.

### 20.5 Red backend-status dot

Check:

- The workspace still exists.
- Pi CLI and bundled Node runtime are complete.
- `resources/app.asar.unpacked` contains Pi and `jiti` in packaged builds.
- Credentials are valid.
- Extensions do not contain syntax or dependency errors.

### 20.6 Empty plugin list

Check:

- The window is in Agent mode.
- The Pi resource directory exists.
- Extension and skill files are valid.
- The window was restarted after changing resources or workspace.

### 20.7 Slow portable startup

The portable build extracts roughly hundreds of megabytes of runtime files on first launch. The installed edition starts faster and is recommended for daily use.

### 20.8 A new task has no tools

1. Check whether the previous request used the exact-greeting light route or ended abnormally.
2. **New task** stops residual streaming work, restores `routeTier: full`, and then creates a session.
3. If tools are still absent, toggle Agent mode once or restart the window and inspect extension errors.

## 21. Backup and migration

Recommended backup targets:

```text
%USERPROFILE%\.pi\agent\sessions
%USERPROFILE%\.pi\agent\skills
%USERPROFILE%\.pi\agent\extensions
%USERPROFILE%\.pi\agent\prompts
```

Back up with additional care:

```text
%USERPROFILE%\.pi\agent\auth.json
```

To migrate:

1. Install or copy Beichen Pi to the new machine.
2. Copy only the required sessions and resource directories.
3. Sign in to providers again on the new machine; avoid copying long-lived credentials when practical.

## 22. Uninstall

### Installed edition

Use **Windows Settings → Apps → Installed apps**.

### Portable edition

Close the app and delete the portable executable.

### User data

Uninstalling does not automatically remove Pi sessions or credentials. For a complete cleanup, handle these directories manually:

```text
%USERPROFILE%\.pi\agent
%APPDATA%\北辰 Pi
```

Back up sessions and resources before deleting them.

## 23. Development and build

From the project root:

```powershell
npm ci
npm run prepare:runtime
npm run dev
```

Complete validation:

```powershell
npm run check
```

This includes:

- TypeScript validation.
- Node unit tests.
- Vite production build.

Build Windows executables:

```powershell
npm run dist
```

Build only the unpacked directory:

```powershell
npm run dist:dir
```

## 24. Project structure

```text
electron/
  main.cjs              Electron main process, Pi RPC, authentication, windows, packaging smoke hooks
  preload.cjs           Secure IPC bridge
  prompts.cjs           Chat/Agent and performance-mode prompts
src/
  App.tsx               Main UI, themes, language, telemetry, and settings
  styles.css            Seven themes and component styles
  assets/               Ink and additional theme backgrounds
resources/
  pi-extensions/        Ghost/Quantum context extensions
  runtime/node.exe      Bundled Node runtime generated during preparation; not tracked in Git
tests/                  Prompt, mode, runtime, security, and UI tests
output/                 Production icon; local verification screenshots are ignored
release/                Local installer, portable build, checksums, and unpacked output; ignored by Git
```

## 25. Known limitations

- The app cannot bypass provider access, balance, quota, billing, or context limits.
- Windows executables are not commercially code-signed.
- token/s is an estimate during streaming and is corrected only after final usage arrives.
- Reasoning, cache, or cost fields omitted by a provider can only be shown as unavailable.
- Image, tool, reasoning-level, and context-persistence support varies by model and server.
- Chat mode does not load file-modification tools.
- Theme backgrounds add several megabytes to the package.
- Post-turn context modes do not refund already generated tokens or expose provider-hidden chain-of-thought.

## 26. Quick checklist

Before the first task, confirm:

- [ ] Backend status is green.
- [ ] The workspace is correct and trusted.
- [ ] The provider or local endpoint is connected.
- [ ] The selected model is available.
- [ ] Chat or Agent matches the task.
- [ ] Performance mode matches quality, latency, and context requirements.
- [ ] The context ring is not near capacity.
- [ ] Provider quota and cost have been checked when relevant.
