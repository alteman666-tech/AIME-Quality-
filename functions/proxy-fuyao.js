export async function onRequest(context) {
  const { request, env } = context;
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };

  if(request.method === "OPTIONS"){
    return new Response(null,{headers:corsHeaders})
  }
  if(request.method !== "POST"){
    return new Response(JSON.stringify({error:"only post"}),{status:405,headers:{...corsHeaders,"Content-Type":"application/json"}})
  }

  try{
    const payload = await request.json();
    const FUYAO_API_KEY = env.FUYAO_API_KEY;
    const thscode = String(payload.thscode || "600519.SH").trim().toUpperCase();

    if (!FUYAO_API_KEY) {
      return json({
        ok: false,
        stage: "configuration",
        error: "FUYAO_API_KEY_NOT_CONFIGURED"
      }, 503, corsHeaders);
    }

    if (!/^\d{6}\.(SH|SZ|BJ)$/.test(thscode)) {
      return json({
        ok: false,
        stage: "validation",
        error: "INVALID_THSCODE",
        message: "请输入完整股票代码，例如 600519.SH"
      }, 400, corsHeaders);
    }

    const apiUrl = `https://fuyao.aicubes.cn/api/a-share/prices/snapshot?thscodes=${encodeURIComponent(thscode)}`;

    const upstream = await fetch(apiUrl,{
      method:"GET",
      headers:{
        "X-api-key":FUYAO_API_KEY
      }
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
        error: "FUYAO_NON_JSON_RESPONSE"
      }, 502, corsHeaders);
    }

    const businessSuccess = upstream.ok && result && result.code === 0 && result.data !== null;
    if (!businessSuccess) {
      return json({
        ok: false,
        stage: "upstream_business",
        upstream_http_status: upstream.status,
        upstream_code: result?.code ?? null,
        upstream_message: result?.message ?? "unknown",
        request_id: result?.request_id ?? null
      }, 502, corsHeaders);
    }

    return json({
      ok: true,
      source: "fuyao",
      fetched_at: new Date().toISOString(),
      request_id: result.request_id ?? null,
      data: result.data
    }, 200, corsHeaders);
  }catch(err){
    return json({
      ok: false,
      stage: "edge_function",
      error: "EDGE_FUNCTION_ERROR",
      message: err instanceof Error ? err.message : "unknown error"
    }, 500, corsHeaders);
  }
}

function json(body, status, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...extraHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
