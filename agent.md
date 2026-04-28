# VK Bot Agent

VK-бот с интеграцией LM Studio для обработки сообщений.

## Запуск

```bash
npm start      # VK-бот
npm run dev   # режим разработки
```

## Структура

```
├── vk-bot.mjs          # точка входа
├── tools/              # инструменты (автозагрузка)
│   ├── draw_chart.mjs
│   ├── get_time.mjs
│   ├── web_search.mjs
│   └── yahoo_finance.mjs
├── .env               # переменные окружения
└── package.json
```

## Переменные окружения (.env)

```
VK_TOKEN=           # токен VK бота
GROUP_ID=          # ID группы VK
CHAT_PEER_ID=     # ID чата для обработки сообщений
LM_STUDIO_URL=    # URL LM Studio (по умолчанию http://localhost:1234)
LM_STUDIO_API_KEY= # API ключ (по умолчанию lm-studio)
MODEL_NAME=       # имя модели (по умолчанию local-model)
SEARCH_URL=       # URL для web_search (SearXNG)
```

## Добавление инструментов

Создай файл в `tools/name.mjs`:

```javascript
export const definition = {
  type: "function",
  function: {
    name: "tool_name",
    description: "Что делает инструмент",
    parameters: {
      type: "object",
      properties: { arg: { type: "string" } },
      required: ["arg"]
    }
  }
};

export async function handler(args) {
  // логика
  return "результат";
}
```

Инструмент загрузится автоматически при запуске бота.

## Архитектура

- `vk-bot.mjs` - загружает инструменты из `/tools` и обрабатывает сообщения
- Инструменты имеют `definition` (описание для LM) и `handler` (исполнение)
- Бот автоматически обнаруживает ссылки на графики quickchart.io и прикрепляет их как фото