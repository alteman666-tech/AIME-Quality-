export async function onRequest({ request, env }) {
  if (request.method !== "GET") {
    return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  }

  const services = {
    fuyao: Boolean(env.FUYAO_API_KEY),
    qwen: Boolean(env.DASHSCOPE_API_KEY),
  };

  return json({
    ok: true,
    service: "investment-agent-quality-console",
    deployment: "edgeone-pages",
    checked_at: new Date().toISOString(),
    model: env.QWEN_MODEL || "qwen3.7-flash",
    data_mode: env.APP_DATA_MODE || "hybrid",
    configured: services,
    ready: services.fuyao && services.qwen
  });
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
