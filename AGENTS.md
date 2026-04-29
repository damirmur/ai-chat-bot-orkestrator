# AGENTS.md

## Команды

- `npm start` — запуск бота
- `npm run dev` — dev с автоперезагрузкой при изменении .env

## Архитектура

- `vk-bot.mjs` — точка входа, загрузка, приём/отправка сообщений
- `orchestrator/` — обработка запросов
  - `handler.mjs` — парсит JSON-план, управляет выполнением, обрабатывает ошибки (до 5 попыток)
  - `executor.mjs` — выполняет план шаг за шагом
  - `response.mjs` — формирует ответы (текст/изображения)
- `tools/` — инструменты: draw_chart, render_table, get_finance_data, web_search, get_system_time, model_tool
- `agents/` — агенты: agent_data_request, agent_fin_period_table_graph
- `lm_model_manager.mjs` — проверяет/загружает модель при старте

## Как работает

1. Запрос → модель → JSON-план
2. orchestrator/handler парсит план → executor выполняет
3. При ошибке → модель получает информацию → перепланирование (до 5 попыток)
4. Результат → бот → в чат

## Важно

- `.env` обязателен: VK_TOKEN, GROUP_ID, CHAT_PEER_ID, LM_STUDIO_URL, LM_STUDIO_API_KEY
- Sharp генерирует SVG → PNG локально для графиков/таблиц
- Все инструменты возвращают JSON с полем `error` при проблемах
- Graceful shutdown: SIGTERM/SIGINT корректно останавливают бота

## Переменные LM_STUDIO

**Обязательные:**
- `LM_STUDIO_URL` — http://localhost:1234
- `LM_STUDIO_API_KEY` — токен из LM Studio Settings → Developer

**Параметры модели:**
- `LM_MODEL_KEY=qwen3.5-9b` — какую модель загружать
- `LM_CONTEXT_LENGTH=65536` — размер контекста
- `LM_PARALLEL=4` — параллельные сессии
- `LM_GPU_OFFLOAD=1` — 1 = полная загрузка на GPU
- `LM_TEMPERATURE=0.5` — температура
- `LM_MAX_TOKENS=1500` — макс токенов

## Добавление инструмента/агента

**Инструменты** — в `tools/name.mjs`:
```js
export const definition = { type: "function", function: { name, description, parameters: {...} } };
export async function handler(args) { return JSON.stringify({ error: "..." }) или { text: "..." } или { image: "..." }); }
```

**Агенты** — в `agents/name.mjs`. Агент получает `toolsHandlers`:
```js
export async function handler(args, toolsHandlers) { ... }
```

**model_tool** — особый инструмент, использует модель для перевода/анализа/форматирования текста.