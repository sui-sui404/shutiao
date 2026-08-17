/**
 * API — OpenAI 兼容格式的 API 调用层
 * 支持流式输出（SSE）
 */
import { getActiveApi } from "./db.js";
import bus from "./eventBus.js";

/**
 * 发送聊天请求（流式）
 * @param {Array} messages  [{role, content}, ...]
 * @param {Object} options  覆盖参数
 * @param {Function} onChunk  每收到一个 token 调用
 * @param {AbortSignal} signal  取消信号
 * @returns {Promise<string>} 完整回复
 */
export async function chatStream(messages, options = {}, onChunk, signal) {
  const api = await getActiveApi();
  if (!api) throw new Error("No active API configured");

  const url = api.baseUrl.replace(/\/+$/, "") + "/v1/chat/completions";

  const body = {
    model: options.model || api.model,
    messages,
    temperature: options.temperature ?? api.temperature,
    stream: api.stream !== false,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${api.apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(`API Error ${response.status}: ${errorText}`);
  }

  if (api.stream === false) {
    const result = await response.json();
    const text = result.choices?.[0]?.message?.content || "";
    if (onChunk) onChunk(text, text);
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data:")) continue;

      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") break;

      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          fullText += delta;
          if (onChunk) onChunk(delta, fullText);
        }
      } catch {
        /* skip malformed chunks */
      }
    }
  }

  return fullText;
}

/**
 * 发送聊天请求（非流式，用于测试连接等）
 */
export async function chatOnce(messages, options = {}) {
  const api = await getActiveApi();
  if (!api) throw new Error("No active API configured");

  const url = api.baseUrl.replace(/\/+$/, "") + "/v1/chat/completions";

  const body = {
    model: options.model || api.model,
    messages,
    temperature: options.temperature ?? api.temperature,
    stream: false,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${api.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(`API Error ${response.status}: ${errorText}`);
  }

  const result = await response.json();
  return result.choices?.[0]?.message?.content || "";
}

/**
 * 测试 API 连接
 */
export async function testApiConnection(apiConfig) {
  const url = apiConfig.baseUrl.replace(/\/+$/, "") + "/v1/chat/completions";

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiConfig.apiKey}`,
    },
    body: JSON.stringify({
      model: apiConfig.model,
      messages: [{ role: "user", content: "Hi" }],
      max_tokens: 10,
      stream: false,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(`${response.status}: ${errorText}`);
  }

  const result = await response.json();
  return {
    success: true,
    reply: result.choices?.[0]?.message?.content || "(empty reply)",
    model: result.model,
  };
}
