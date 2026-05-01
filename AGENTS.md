**AGENTS.md**

- **Start the bot** – `npm run start` runs `communication/vk-bot.mjs`.
- **Run the terminal chat** – `npm run terminal` runs `communication/terminal-chat.mjs`.
- **Watch‑mode development** – `npm run dev:bot` or `npm run dev:term` restarts the respective script on file changes (uses `node --watch`).
- **List available tools** – `node list_tools.mjs` prints all tool modules under `tools/`.
- **Execute a specific tool** – `node tools/<tool_name>.mjs` (e.g., `node tools/weather_api.mjs`).
- **Tool loading** – The orchestrator loads tools based on `orchestrator/tools.config.json`; an empty file means *all* modules in `tools/` are auto‑registered.
- **State persistence** – Runtime state is stored in `state.json`; editing this file while the server is running may cause inconsistent behavior.
- **Logging** – All logs are written to the `logs/` directory; each run creates a timestamped file.
- **No test suite** – `npm test` is a placeholder; there are no automated tests in this repo.
- **Environment** – Copy `.env_example` to `.env` for required variables; the bot expects `OPENAI_API_KEY` and VK credentials if using the VK bot.

These points capture the non‑obvious commands, configuration quirks, and runtime expectations that an OpenCode agent would otherwise miss.