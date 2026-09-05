# Changelog

## 1.8.2 — 2026-09-05

- Added one-click custom API presets under Settings → Custom API (bundled: Baimeow relay serving `kimi-k3-max` via OpenAI Chat Completions at `https://api.baimeow.icu/v1`). Selecting a preset pre-fills the endpoint and model, so only the API key — stored Windows-encrypted as before — needs to be entered; presets whose endpoint and model already exist hide automatically.
- Hardened the Pi backend lifecycle: unexpected exits recover cleanly, concurrent restarts are serialized, shutdown and window-close paths cannot spawn orphan processes, and synchronous spawn failures no longer leave stale restart state behind.
- Preserved stream correctness across restarts by discarding stale child output, reporting asynchronous stdin failures to the renderer, retaining thinking deltas and tool-call content indexes, and waiting for terminal child events before completing a forced stop.
- Tightened context-mode behavior and UI recovery for Quantum, Ghost, Ultra, and light routes, including bounded local reasoning compression, digest-leak prevention, accurate completed-turn handling, and safe session recovery after interrupted runs.
- Added regression coverage for backend restart/shutdown races, stream assembly, custom API normalization, context controls, session recovery, external-link policy, workspace handling, and related renderer utilities.
- Validation for this release: TypeScript typecheck passed, all 69 tests passed, and the production Vite build completed successfully.

## 1.8.1 — 2026-08-30

- Reframed the project as a local-first minimalist agent platform, moved post-turn context controls to the top of the project introduction, and added a fully bilingual README plus a complete English user guide.
- Added independent model, reasoning, and context-mode controls with complete token telemetry.
- Added Codex, Benchmark, Ultra Max, Quantum Collapse, and Ghost Payload behavior.
- Added custom API and local-model endpoints with Windows-encrypted credentials.
- Added seven visual themes and Chinese/English interface switching.
- Hardened navigation, authentication lifecycle, session continuity, IME input, attachments, and malformed messages.
- Added reasoning-context tests, real-time thinking UI, and digest-leak prevention.
- Upgraded to Electron 44.0.0 and Pi 0.84.4; `npm audit` reports zero known vulnerabilities.
- Prepared the first public source release with MIT licensing, privacy/security documentation, CSP, permission hardening, CI, Dependabot, and reproducible runtime provisioning.
