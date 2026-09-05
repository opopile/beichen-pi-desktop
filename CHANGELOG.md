# Changelog

## 1.8.2 — 2026-08-30

- Added one-click custom API presets under Settings → Custom API (bundled: Baimeow relay serving `kimi-k3-max` via OpenAI Chat Completions at `https://api.baimeow.icu/v1`). Selecting a preset pre-fills the endpoint and model, so only the API key — stored Windows-encrypted as before — needs to be entered; presets whose endpoint and model already exist hide automatically.

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
