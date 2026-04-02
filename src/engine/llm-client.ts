/**
 * Browser-side OpenAI-compatible chat completion client.
 * Works with OpenRouter, OpenAI, Azure OpenAI, and any compatible endpoint.
 */

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface LlmCallOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
}

export async function callOpenAiCompatible(
  opts: LlmCallOptions,
): Promise<string> {
  const { baseUrl, apiKey, model, messages, maxTokens = 4096 } = opts;

  const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`LLM API error ${res.status}: ${body}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("No content in LLM response");
  }

  return content;
}
