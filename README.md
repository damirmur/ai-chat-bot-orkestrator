# MCP Servers

A lightweight Node.js orchestration framework that connects user interfaces (VK bot, terminal) with LLMs and a set of utility tools (weather, time, rendering, …).

## Quick Start
1. **Copy environment variables**
   ```bash
   cp .env_example .env
   ```
   Fill in `OPENAI_API_KEY` and VK credentials if you plan to run the VK bot.
2. **Install dependencies**
   ```bash
   npm install
   ```
3. **Run an interface**
   - VK bot: `npm run start`
   - Terminal chat: `npm run terminal`
   - Development (auto‑restart on changes): `npm run dev:bot` or `npm run dev:term`

## Project Structure
See **ARCHITECTURE.md** for a detailed diagram of directories and data flow.

## Adding a New Tool
1. Create `tools/<name>.mjs` exporting an async function that receives a single `args` object and returns a JSON‑serialisable value.
2. No registration is needed – an empty `tools.config.json` loads every file in `tools/` automatically.
3. Use the tool from prompts by mentioning its name; the orchestrator will route the call.

## State & Logs
- Runtime state is persisted in `state.json`. Do **not** edit it while the server is running.
- Logs are written to `logs/` with ISO timestamps.

## Tests
`npm test` is a placeholder – the repo currently has no automated tests.
