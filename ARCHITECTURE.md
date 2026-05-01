# Architecture Overview

## Directory Structure
```
root/
├─ communication/            # Entry points for user interfaces
│   ├─ vk-bot.mjs           # VK bot server (receives VK messages)
│   └─ terminal-chat.mjs    # CLI chat interface
├─ orchestrator/            # Core orchestration layer
│   ├─ index_logger.mjs     # Logger helper used by orchestrator
│   ├─ executor.mjs         # Executes requested tools / model calls
│   ├─ handler.mjs          # Main request handler, routes to tools
│   ├─ response.mjs         # Formats model responses
│   └─ tools.config.json    # Tool registration config (empty ⇒ auto‑load all)
├─ tools/                    # Individual tool implementations
│   ├─ weather_api.mjs       # Calls external weather service
│   ├─ get_time.mjs          # Returns current time
│   ├─ model_tool.mjs        # Wrapper for OpenAI model calls
│   └─ …                     # Other utility tools (render_table, draw_chart, …)
├─ state.json                # Persistent runtime state (in‑memory cache, conversation history)
├─ logs/                     # Timestamped log files for each run
├─ package.json
└─ .env/.env_example         # Environment variables (API keys, VK credentials)
```

## Interaction Flow

### 1. User → Interface
- **VK Bot**: User sends a message on VK → `vk-bot.mjs` receives it via `vk-io` and forwards the text to the **orchestrator**.
- **Terminal**: User types a line → `terminal-chat.mjs` reads stdin and forwards the text to the orchestrator.

### 2. Orchestrator
1. **handler.mjs** receives the raw query.
2. It selects a **model tool** (`model_tool.mjs`) to generate a response plan.
3. The plan may reference **tool calls** (e.g., `weather_api`).
4. **executor.mjs** resolves each tool request, loads the appropriate module from `tools/` (auto‑registered via `tools.config.json`).
5. Results are fed back to the model for final answer composition.
6. **response.mjs** formats the answer (plain text, markdown, etc.) and returns it to the interface.

### 3. Tools
- **weather_api.mjs** – contacts a weather service (e.g., OpenWeather) using the `OPENAI_API_KEY` or other credentials, returns JSON with temperature, condition, etc.
- **get_time.mjs**, **render_table.mjs**, … – pure utility helpers that do not require external network.

### 4. State & Logging
- **state.json** holds conversation context (last messages, cached tool outputs).  Modifying it while the server runs can cause inconsistencies.
- Every run writes a timestamped file to `logs/` for debugging.

## Example Request Flow
**User query:** `"What is the weather today in Washington?"`

1. **Interface** forwards text to orchestrator.
2. **Model** decides it needs weather data and emits a tool call:
   ```
   tool: weather_api
   args: { location: "Washington, DC", unit: "metric" }
   ```
3. **executor** loads `tools/weather_api.mjs`, performs the HTTP request, receives:
   ```json
   { "temp": 22, "desc": "clear sky", "city": "Washington" }
   ```
4. The model receives the result and crafts a natural‑language answer:
   > "The weather in Washington today is clear with a temperature of 22 °C."
5. **Response** is sent back to the VK user or terminal.

---

# README (English)

## MCP Servers
A lightweight Node.js orchestration framework that connects user interfaces (VK bot, terminal) with LLMs and a set of utility tools (weather, time, rendering, …).

### Quick Start
1. Copy env variables:
   ```bash
   cp .env_example .env
   ```
   Fill in `OPENAI_API_KEY` and VK credentials if you intend to run the VK bot.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the desired interface:
   - VK bot: `npm run start`
   - Terminal chat: `npm run terminal`
   - Development (auto‑restart on changes): `npm run dev:bot` or `npm run dev:term`

### Project Structure
(see **ARCHITECTURE.md** for a detailed diagram).

### Adding a New Tool
1. Create `tools/<name>.mjs` exporting an async function that receives a single `args` object and returns a JSON‑serialisable value.
2. No additional registration is required – an empty `tools.config.json` loads every file in `tools/` automatically.
3. Use the tool from prompts by mentioning its name; the orchestrator will route the call.

### State & Logs
- Runtime state is persisted in `state.json`. Do not edit it while the server runs.
- Logs are written to `logs/` with ISO timestamps.

### Tests
`npm test` is a placeholder – the repo currently has no automated tests.

---

# README_RU (Русский)

## MCP Servers
Лёгкий фреймворк на Node.js, связывающий пользовательские интерфейсы (бот ВКонтакте, терминал) с LLM‑моделью и набором вспомогательных инструментов (погода, время, визуализация и т.д.).

### Быстрый старт
1. Скопируйте переменные окружения:
   ```bash
   cp .env_example .env
   ```
   Заполните `OPENAI_API_KEY` и данные VK, если собираетесь запускать бота.
2. Установите зависимости:
   ```bash
   npm install
   ```
3. Запустите нужный интерфейс:
   - Бот VK: `npm run start`
   - Терминальный чат: `npm run terminal`
   - Разработка с авто‑перезапуском: `npm run dev:bot` или `npm run dev:term`

### Структура проекта
(подробная диаграмма в **ARCHITECTURE.md**).

### Добавление нового инструмента
1. Создайте файл `tools/<имя>.mjs`, экспортирующий асинхронную функцию, принимающую объект `args` и возвращающую JSON‑совместимое значение.
2. Регистрация не нужна – пустой `tools.config.json` автоматически подключает все файлы из каталога `tools/`.
3. Вызывайте инструмент из запросов, указывая его имя; оркестратор выполнит вызов.

### Состояние и логи
- Состояние работы хранится в `state.json`. Не изменяйте файл во время выполнения сервера.
- Логи выводятся в директорию `logs/` с меткой времени.

### Тесты
`npm test` – заглушка, в репозитории пока нет автоматических тестов.
