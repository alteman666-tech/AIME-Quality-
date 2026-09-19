const DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const DEFAULT_MODEL = "qwen3.7-flash";

export async function onRequest({ request, env }) {
  if (request.method !== "POST") {
    return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  }

  if (!env.DASHSCOPE_API_KEY) {
    return json({
      ok: false,
      stage: "configuration",
      error: "DASHSCOPE_API_KEY_NOT_CONFIGURED"
    }, 503);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, stage: "validation", error: "INVALID_JSON" }, 400);
  }

  const prompt = String(payload.prompt || "用一句话说明你能提供什么帮助。").trim();
  if (!prompt || prompt.length > 1000) {
    return json({
      ok: false,
      stage: "validation",
      error: "INVALID_PROMPT_LENGTH",
      message: "prompt 长度必须为 1 到 1000 个字符"
    }, 400);
  }

  const model = env.QWEN_MODEL || DEFAULT_MODEL;
  const baseUrl = String(env.QWEN_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
  const startedAt = Date.now();

  try {
    const upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.DASHSCOPE_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: "你是投资问答质量治理平台的服务连通性助手。回答简洁，不提供收益承诺或买卖建议。"
          },
          { role: "user", content: prompt }
        ],
        enable_thinking: true,
        stream: false,
        max_tokens: 500
      })
    });

    const raw = await upstream.text();
    let result;
    try {
      result = JSON.parse(raw);
    } catch {
      return json({
        ok: false,
        stage: "upstream_schema",
        upstream_http_status: upstream.status,
        error: "QWEN_NON_JSON_RESPONSE"
      }, 502);
    }

    if (!upstream.ok || !result?.choices?.[0]?.message) {
      return json({
        ok: false,
        stage: "upstream_business",
        upstream_http_status: upstream.status,
        upstream_code: result?.error?.code ?? null,
        upstream_message: result?.error?.message ?? "Qwen request failed",
        request_id: result?.request_id ?? null
      }, 502);
    }

    const message = result.choices[0].message;
    return json({
      ok: true,
      provider: "dashscope",
      model: result.model || model,
      mode: "thinking_non_stream",
      latency_ms: Date.now() - startedAt,
      request_id: result.request_id ?? null,
      reasoning_available: Boolean(message.reasoning_content),
      content: message.content || "",
      usage: result.usage || null
    });
  } catch (error) {
    return json({
      ok: false,
      stage: "edge_function",
      error: "QWEN_REQUEST_ERROR",
      message: error instanceof Error ? error.message : "unknown error"
    }, 500);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
