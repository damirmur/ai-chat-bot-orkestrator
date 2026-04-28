# VK Bot Agent

VK-бот с интеграцией LM Studio и оркестратором для многоходовых задач.

## Запуск

```bash
npm start      # запуск бота
npm run dev   # режим разработки с автоперезагрузкой
```

## Структура

```
├── vk-bot.mjs          # точка входа
├── tools/              # инструменты (автозагрузка)
│   ├── draw_chart.mjs      # графики (SVG → PNG)
│   ├── render_table.mjs   # таблицы (SVG → PNG)
│   ├── execute_plan.mjs   # оркестратор задач
│   ├── get_time.mjs       # системное время
│   ├── web_search.mjs     # веб-поиск
│   └── yahoo_finance.mjs  # финансовые данные
├── agent.md            # документация
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

## Оркестратор execute_plan

Для многоходовых задач используется `execute_plan`:

```json
{
  "steps": [
    {"id": 0, "tool": "get_finance_data", "args": {"symbol": "BTC-USD", "type": "historical", "range": "1y"}},
    {"id": 1, "tool": "draw_chart", "args": {"title": "BTC", "source": 0, "key_labels": "date", "key_values": "price"}},
    {"id": 2, "tool": "render_table", "args": {"title": "BTC", "source": 0}}
  ]
}
```

### Авто-определение

Оркестратор автоматически определяет тип вывода:
- Данные с датами → график
- Массив объектов → таблица
- Несколько изображений → все прикрепляются к сообщению

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

- `vk-bot.mjs` - загружает инструменты из `/tools`, обрабатывает сообщения
- `execute_plan.mjs` - оркестратор: выполняет цепочку шагов, собирает изображения
- Инструменты имеют `definition` (описание для LM) и `handler` (исполнение)
- Изображения генерируются локально через sharp (SVG → PNG)
- Результаты загружаются в VK как фото