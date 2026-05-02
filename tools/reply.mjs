export const definition = {
    type: "function",
    function: {
        name: "reply",
        description: "Send a direct text response to the user. Use for simple answers or when no external data is needed.",
        parameters: {
            type: "object",
            properties: {
                text: { type: "string", description: "Text message content to send to user" }
            },
            required: ["text"]
        }
    }
};

export async function handler(args) {
    return JSON.stringify({ text: args.text });
}
