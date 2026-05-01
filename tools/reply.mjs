export const definition = {
    type: "function",
    function: {
        name: "reply",
        description: "Вернуть текстовый ответ пользователю. Используйте для ВСЕХ ответов, включая приветствия и простые вопросы.",
        parameters: {
            type: "object",
            properties: {
                text: { type: "string", description: "Текст ответа пользователю" }
            },
            required: ["text"]
        }
    }
};

export async function handler(args) {
    return JSON.stringify({ text: args.text });
}
