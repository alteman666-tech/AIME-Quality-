const DATA = window.DEMO_DATA;
const STORE_KEY = "aime-quality-reviews-v1";
const FEEDBACK_KEY = "aime-quality-feedback-v1";
const state = { selectedCase: DATA.cases[1], lastRun: null, reviews: loadReviews(), selectedReview: null };
const titles = { overview: "治理概览", workspace: "评测工作台", review: "人工复核", personalization: "画像对照", versions: "版本回归", services: "服务诊断" };

document.querySelectorAll(".nav-item").forEach((button) => button.addEventListener("click", () => navigate(button.dataset.view)));
document.getElementById("quickStartBtn").addEventListener("click", () => navigate("workspace"));
document.getElementById("runEvaluationBtn").addEventListener("click", runEvaluation);
document.getElementById("clearReviewsBtn").addEventListener("click", clearReviews);
document.getElementById("runRegressionBtn").addEventListener("click", runRegression);
document.getElementById("refreshHealthBtn").addEventListener("click", checkHealth);
document.getElementById("queryFuyaoBtn").addEventListener("click", queryFuyao);
document.getElementById("queryQwenBtn").addEventListener("click", queryQwen);
document.querySelectorAll(".filter").forEach((button) => button.addEventListener("click", () => filterCases(button)));

renderCases();
selectCase(state.selectedCase.id);
renderPairCompare();
renderRegressionOptions();
renderReviews();
checkHealth();

function navigate(view) {
  document.querySelectorAll(".view").forEach((section) => section.classList.toggle("active", section.id === `view-${view}`));
  document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  document.getElementById("pageTitle").textContent = titles[view];
  if (view === "review") renderReviews();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderCases(filter = "all") {
  const cases = filter === "all" ? DATA.cases : DATA.cases.filter((item) => item.intent === filter);
  document.getElementById("caseList").innerHTML = cases.map((item) => `
    <button class="case-item ${item.id === state.selectedCase?.id ? "active" : ""} ${item.expected === "pass" ? "expected-pass" : ""}" data-case-id="${item.id}">
      <span><em>${item.id}</em><em>${intentLabel(item.intent)}</em></span>
      <b>${escapeHtml(item.title)}</b>
      <small><i class="risk-dot"></i>${escapeHtml(item.risk)}</small>
    </button>`).join("");
  document.querySelectorAll(".case-item").forEach((button) => button.addEventListener("click", () => selectCase(button.dataset.caseId)));
}

function filterCases(active) {
  document.querySelectorAll(".filter").forEach((button) => button.classList.toggle("active", button === active));
  renderCases(active.dataset.filter);
}

function selectCase(id) {
  state.selectedCase = DATA.cases.find((item) => item.id === id) || DATA.cases[0];
  const item = state.selectedCase;
  document.querySelectorAll(".case-item").forEach((button) => button.classList.toggle("active", button.dataset.caseId === id));
  document.getElementById("caseTitle").textContent = `${item.id} · ${item.title}`;
  document.getElementById("question").value = item.question;
  document.getElementById("candidateAnswer").value = item.answer;
  document.getElementById("intentTag").textContent = intentLabel(item.intent);
  document.getElementById("profileTag").textContent = DATA.profiles[item.profile].label;
  const evidenceHtml = item.evidence.length ? item.evidence.map((id) => {
    const evidence = DATA.evidence[id];
    return `<a class="evidence-pill" href="${evidence.source_url}" target="_blank" rel="noreferrer">${id} · ${escapeHtml(evidence.metric)} · 第${evidence.page}页 ↗</a>`;
  }).join("") : `<span class="evidence-pill">无可用事实证据 · 不能判为已核验</span>`;
  const contextHtml = item.context ? `<span class="evidence-pill">${item.context} · ${escapeHtml(DATA.contexts[item.context].kind)} · 未核实</span>` : "";
  document.getElementById("evidencePreview").innerHTML = evidenceHtml + contextHtml;
  document.getElementById("evaluationOutput").className = "panel result-panel empty-state";
  document.getElementById("evaluationOutput").innerHTML = `<div><span class="empty-icon">◎</span><h3>等待评测</h3><p>当前样例预置风险为“${escapeHtml(item.risk)}”，真实结论由模型与人工复核产生。</p></div>`;
}

async function runEvaluation() {
  const button = document.getElementById("runEvaluationBtn");
  const item = state.selectedCase;
  setButtonLoading(button, true, "评测中");
  document.getElementById("evaluationOutput").className = "panel result-panel empty-state";
  document.getElementById("evaluationOutput").innerHTML = `<div><span class="empty-icon">◌</span><h3>规则检查与千问评测执行中</h3><p>正在核对事实、证据、时效、个性化与合规边界。</p></div>`;
  try {
    const payload = evaluationPayload(item, document.getElementById("candidateAnswer").value.trim());
    const { response, data } = await requestJson("/api/evaluate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!response.ok || !data.ok) throw new Error(formatApiError(data, response.status));
    state.lastRun = { ...data, caseId: item.id, question: payload.question, answer: payload.answer };
    renderEvaluation(data);
  } catch (error) {
    renderEvaluationError(error.message);
  } finally {
    setButtonLoading(button, false, "运行联合评测");
  }
}

function evaluationPayload(item, answer) {
  return {
    case_id: item.id,
    intent: item.intent,
    question: document.getElementById("question").value.trim() || item.question,
    answer,
    profile: DATA.profiles[item.profile],
    context: item.context ? DATA.contexts[item.context] : null,
    question_as_of: "2025-04-03T23:59:59+08:00",
    required_rules: item.rules,
    evidence: item.evidence.map((id) => DATA.evidence[id]),
    tool_status: item.toolFailure || null,
    data_version: DATA.versions.data
  };
}

function renderEvaluation(data) {
  const result = data.evaluation;
  const findings = result.findings || [];
  const findingClass = result.verdict === "pass" ? "finding finding-pass" : "finding";
  const evidence = state.selectedCase.evidence.map((id) => DATA.evidence[id]);
  const output = document.getElementById("evaluationOutput");
  output.className = "panel result-panel";
  output.innerHTML = `
    <div class="result-summary">
      <div class="verdict-card verdict-${result.verdict}"><small>机器初判</small><strong>${verdictLabel(result.verdict)}</strong></div>
      <div class="summary-copy"><h3>${escapeHtml(result.summary)}</h3><p>任务完成：${result.task_completed ? "是" : "否"} · ${result.needs_human_review ? "需要人工复核" : "模型未要求复核"}</p><div class="summary-meta"><span class="tag">${escapeHtml(data.versions.model)}</span><span class="tag tag-neutral">${escapeHtml(data.versions.judge_prompt)}</span><span class="tag tag-neutral">${data.latency_ms} ms</span><span class="tag tag-neutral">Run ${escapeHtml(data.run_id.slice(0, 8))}</span></div></div>
    </div>
    <div class="trace-head"><b>规则检查结果</b><span>${result.verdict === "pass" ? "通过项" : "问题定位"}</span></div>
    <div class="finding-list">${findings.length ? findings.map((finding) => `<div class="${findingClass}"><code>${escapeHtml(finding.rule_id)}</code><div><b>${escapeHtml(ruleName(finding.rule_id))}</b><p>${escapeHtml(finding.reason)}${finding.answer_span ? ` · 原文：“${escapeHtml(finding.answer_span)}”` : ""}</p></div></div>`).join("") : `<div class="finding finding-pass"><code>PASS</code><div><b>未发现阻断问题</b><p>仍需人工抽查证据与判断口径。</p></div></div>`}</div>
    <div class="trace-head"><b>事实证据链</b><span>关键数字可追溯</span></div>
    ${evidence.length ? evidence.map((item) => `<div class="trace-row"><b>${item.id}</b><span>${escapeHtml(item.metric)} · ${escapeHtml(item.display_value)}</span><span>${escapeHtml(item.source)}</span><a href="${item.source_url}" target="_blank" rel="noreferrer">第${item.page}页 ↗</a></div>`).join("") : `<div class="trace-row"><b>—</b><span>当前没有可核验证据</span><span>不能将未知判为正确</span><span>待补充</span></div>`}
    <div class="feedback-row"><span>用户反馈只进入排查队列，不会自动改变事实结论。</span><div><button class="feedback-button" data-vote="up">有帮助</button><button class="feedback-button" data-vote="down">有问题</button></div></div>
    <div class="review-cta"><button id="addReviewBtn" class="button button-primary">加入人工复核</button></div>`;
  document.getElementById("addReviewBtn").addEventListener("click", addCurrentRunToReview);
  document.querySelectorAll(".feedback-button").forEach((button) => button.addEventListener("click", () => saveFeedback(button.dataset.vote)));
}

function renderEvaluationError(message) {
  const output = document.getElementById("evaluationOutput");
  output.className = "panel result-panel";
  output.innerHTML = `<div class="result-summary"><div class="verdict-card verdict-insufficient_evidence"><small>执行状态</small><strong>评测失败</strong></div><div class="summary-copy"><h3>模型评测未完成</h3><p>${escapeHtml(message)}</p><div class="summary-meta"><span class="tag tag-neutral">已输入内容仍保留</span><span class="tag tag-neutral">可重试失败步骤</span></div></div></div>`;
}

function addCurrentRunToReview() {
  if (!state.lastRun) return;
  const existing = state.reviews.find((review) => review.runId === state.lastRun.run_id);
  if (!existing) {
    state.reviews.unshift({ id: crypto.randomUUID(), runId: state.lastRun.run_id, caseId: state.lastRun.caseId, title: state.selectedCase.title, machineVerdict: state.lastRun.evaluation.verdict, summary: state.lastRun.evaluation.summary, answer: state.lastRun.answer, createdAt: new Date().toISOString(), humanVerdict: "pending", reason: "" });
    persistReviews();
  }
  toast(existing ? "这条运行已在复核队列" : "已加入人工复核队列");
  renderReviews();
}

function renderReviews() {
  const list = document.getElementById("reviewList");
  const pending = state.reviews.filter((item) => item.humanVerdict === "pending").length;
  document.getElementById("reviewCount").textContent = state.reviews.length;
  document.getElementById("overviewReviewCount").textContent = pending;
  list.innerHTML = state.reviews.length ? state.reviews.map((item) => `<button class="review-item ${state.selectedReview === item.id ? "active" : ""}" data-review-id="${item.id}"><b>${escapeHtml(item.caseId)} · ${escapeHtml(item.title)}</b><small>机器：${verdictLabel(item.machineVerdict)} · 人工：${humanLabel(item.humanVerdict)}</small></button>`).join("") : `<div class="empty-state"><div><span class="empty-icon">✓</span><h3>队列为空</h3><p>运行评测后可将结果加入这里。</p></div></div>`;
  document.querySelectorAll(".review-item").forEach((button) => button.addEventListener("click", () => openReview(button.dataset.reviewId)));
  if (state.selectedReview && state.reviews.some((item) => item.id === state.selectedReview)) openReview(state.selectedReview);
}

function openReview(id) {
  state.selectedReview = id;
  const review = state.reviews.find((item) => item.id === id);
  if (!review) return;
  document.querySelectorAll(".review-item").forEach((button) => button.classList.toggle("active", button.dataset.reviewId === id));
  const editor = document.getElementById("reviewEditor");
  editor.className = "panel review-editor";
  editor.innerHTML = `<div class="panel-head"><div><span class="step-label">复核 ${escapeHtml(review.runId.slice(0, 8))}</span><h3>${escapeHtml(review.caseId)} · ${escapeHtml(review.title)}</h3></div><span class="tag">机器：${verdictLabel(review.machineVerdict)}</span></div><div class="answer-quote">${escapeHtml(review.answer)}</div><label>人工结论</label><div class="radio-row"><label class="choice"><input type="radio" name="humanVerdict" value="confirmed" ${review.humanVerdict === "confirmed" ? "checked" : ""}> 确认初判</label><label class="choice"><input type="radio" name="humanVerdict" value="overruled" ${review.humanVerdict === "overruled" ? "checked" : ""}> 改判</label><label class="choice"><input type="radio" name="humanVerdict" value="deferred" ${review.humanVerdict === "deferred" ? "checked" : ""}> 暂缓</label></div><label>复核理由<textarea id="reviewReason" rows="4" placeholder="说明证据、规则或争议点">${escapeHtml(review.reason)}</textarea></label><div class="action-row"><p>保存后仍保留机器初判，不覆盖原结论。</p><button id="saveReviewBtn" class="button button-primary">保存复核</button></div>`;
  document.getElementById("saveReviewBtn").addEventListener("click", saveReview);
}

function saveReview() {
  const review = state.reviews.find((item) => item.id === state.selectedReview);
  const checked = document.querySelector('input[name="humanVerdict"]:checked');
  const reason = document.getElementById("reviewReason").value.trim();
  if (!checked || !reason) return toast("请选择结论并填写复核理由");
  review.humanVerdict = checked.value;
  review.reason = reason;
  review.reviewedAt = new Date().toISOString();
  persistReviews();
  renderReviews();
  toast("人工复核已保存");
}

function clearReviews() {
  state.reviews = [];
  state.selectedReview = null;
  persistReviews();
  document.getElementById("reviewEditor").className = "panel review-editor empty-state";
  document.getElementById("reviewEditor").innerHTML = `<div><span class="empty-icon">✓</span><h3>记录已清空</h3><p>新的评测可以再次加入队列。</p></div>`;
  renderReviews();
}

function saveFeedback(vote) {
  if (!state.lastRun) return;
  let records = [];
  try { records = JSON.parse(localStorage.getItem(FEEDBACK_KEY) || "[]"); } catch { records = []; }
  records = records.filter((item) => item.runId !== state.lastRun.run_id);
  records.unshift({ runId: state.lastRun.run_id, caseId: state.lastRun.caseId, vote, createdAt: new Date().toISOString(), effect_on_verdict: "none" });
  localStorage.setItem(FEEDBACK_KEY, JSON.stringify(records.slice(0, 100)));
  document.querySelectorAll(".feedback-button").forEach((button) => button.classList.toggle("selected", button.dataset.vote === vote));
  toast(vote === "up" ? "已记录“有帮助”，不改变质量结论" : "已记录“有问题”，将作为排查线索");
}

function renderPairCompare() {
  const items = [DATA.cases.find((item) => item.id === "C21"), DATA.cases.find((item) => item.id === "C22")];
  document.getElementById("pairCompare").innerHTML = items.map((item) => {
    const profile = DATA.profiles[item.profile];
    const good = item.expected === "pass";
    return `<article class="pair-card ${good ? "good" : "bad"}"><header><div><span class="step-label">${item.id} · ${profile.label}</span><h3>${escapeHtml(item.title)}</h3></div><span class="status ${good ? "status-ok" : "status-error"}">${good ? "边界内" : "事实漂移"}</span></header><div class="profile-line"><span class="tag tag-neutral">经验：${profile.experience}</span><span class="tag tag-neutral">风险：${profile.risk}</span><span class="tag tag-neutral">表达：${profile.style}</span></div><div class="answer-quote">${escapeHtml(item.answer)}</div><div class="pair-checks"><div class="pair-check"><span>事实值与证据一致</span><b class="${good ? "check-ok" : "check-bad"}">${good ? "1708.99亿元 ✓" : "2000亿元 ×"}</b></div><div class="pair-check"><span>保留收益不确定性</span><b class="check-ok">是 ✓</b></div><div class="pair-check"><span>允许随画像变化</span><b>${good ? "措辞与侧重点" : "仅措辞与侧重点"}</b></div></div></article>`;
  }).join("");
}

function renderRegressionOptions() {
  document.getElementById("regressionCase").innerHTML = DATA.cases.filter((item) => item.expected !== "pass").map((item) => `<option value="${item.id}">${item.id} · ${escapeHtml(item.title)}</option>`).join("");
}

async function runRegression() {
  const button = document.getElementById("runRegressionBtn");
  const item = DATA.cases.find((entry) => entry.id === document.getElementById("regressionCase").value);
  const prompt = document.getElementById("candidatePrompt").value.trim();
  if (!prompt) return toast("请输入候选 Prompt");
  setButtonLoading(button, true, "生成与复评中");
  document.getElementById("regressionResult").innerHTML = `<article class="panel empty-state"><div><span class="empty-icon">◌</span><h3>正在生成候选回答</h3><p>随后会在相同问题、画像、证据与规则下复评。</p></div></article>`;
  try {
    const generatePayload = { prompt, question: item.question, profile: DATA.profiles[item.profile], evidence: item.evidence.map((id) => DATA.evidence[id]), context: item.context ? DATA.contexts[item.context] : null, versions: DATA.versions };
    const generated = await requestJson("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(generatePayload) });
    if (!generated.response.ok || !generated.data.ok) throw new Error(formatApiError(generated.data, generated.response.status));
    const baselinePayload = { ...evaluationPayload(item, item.answer), question: item.question };
    const candidatePayload = { ...evaluationPayload(item, generated.data.answer), question: item.question };
    const [baselineEvaluation, candidateEvaluation] = await Promise.all([
      requestJson("/api/evaluate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(baselinePayload) }),
      requestJson("/api/evaluate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(candidatePayload) })
    ]);
    if (!baselineEvaluation.response.ok || !baselineEvaluation.data.ok) throw new Error(`基线评测失败：${formatApiError(baselineEvaluation.data, baselineEvaluation.response.status)}`);
    if (!candidateEvaluation.response.ok || !candidateEvaluation.data.ok) throw new Error(`候选复评失败：${formatApiError(candidateEvaluation.data, candidateEvaluation.response.status)}`);
    renderRegression(item, generated.data, baselineEvaluation.data, candidateEvaluation.data);
  } catch (error) {
    document.getElementById("regressionResult").innerHTML = `<article class="panel"><div class="verdict-card verdict-insufficient_evidence"><strong>回归未完成</strong></div><p>${escapeHtml(error.message)}</p></article>`;
  } finally {
    setButtonLoading(button, false, "生成并回归");
  }
}

function renderRegression(item, generated, baseline, candidate) {
  const baselineVerdict = baseline.evaluation.verdict;
  const candidateVerdict = candidate.evaluation.verdict;
  const fixed = baselineVerdict !== "pass" && candidateVerdict === "pass";
  const baselineRules = (baseline.evaluation.findings || []).map((finding) => finding.rule_id).join(" · ") || "无阻断规则";
  const candidateRules = (candidate.evaluation.findings || []).map((finding) => finding.rule_id).join(" · ") || "无阻断规则";
  const generationRun = String(generated.run_id || "未返回").slice(0, 8);
  const baselineRun = String(baseline.run_id || "未返回").slice(0, 8);
  const candidateRun = String(candidate.run_id || "未返回").slice(0, 8);
  document.getElementById("regressionResult").innerHTML = `<article class="panel compare-card"><span class="step-label">BASELINE · fixture-authored</span><h3>${escapeHtml(item.title)}</h3><div class="compare-answer">${escapeHtml(item.answer)}</div><div class="compare-footer"><span class="status ${baselineVerdict === "pass" ? "status-ok" : "status-error"}">基线实评：${verdictLabel(baselineVerdict)}</span><small>${escapeHtml(baselineRules)}</small></div><div class="summary-meta"><span class="tag tag-neutral">评测 Run ${escapeHtml(baselineRun)}</span><span class="tag tag-neutral">${baseline.latency_ms} ms</span><span class="tag tag-neutral">标签 ${escapeHtml(item.rules.join(" · "))}</span></div></article><article class="panel compare-card"><span class="step-label">CANDIDATE · ${escapeHtml(generated.versions.answer_prompt)}</span><h3>${fixed ? "发现修复" : candidateVerdict === "pass" ? "候选通过" : "仍需处理"}</h3><div class="compare-answer">${escapeHtml(generated.answer)}</div><div class="compare-footer"><span class="status ${candidateVerdict === "pass" ? "status-ok" : "status-error"}">候选复评：${verdictLabel(candidateVerdict)}</span><small>${escapeHtml(candidateRules)}</small></div><div class="summary-meta"><span class="tag tag-neutral">生成 Run ${escapeHtml(generationRun)}</span><span class="tag tag-neutral">${generated.latency_ms} ms</span><span class="tag tag-neutral">评测 Run ${escapeHtml(candidateRun)}</span><span class="tag tag-neutral">${candidate.latency_ms} ms</span></div></article>`;
}

async function checkHealth() {
  try {
    const { response, data } = await requestJson("/api/health");
    if (!response.ok || !data.ok) throw new Error(data.error || `HTTP ${response.status}`);
    setStatus("fuyaoStatus", data.configured?.fuyao);
    setStatus("qwenStatus", data.configured?.qwen);
    document.getElementById("modelMeta").textContent = `${data.model} · ${data.data_mode}`;
    document.getElementById("healthDot").className = `health-dot ${data.ready ? "ready" : "error"}`;
    document.getElementById("healthText").textContent = data.ready ? "核心服务就绪" : "服务配置不完整";
  } catch {
    setStatus("fuyaoStatus", false);
    setStatus("qwenStatus", false);
    document.getElementById("healthDot").className = "health-dot error";
    document.getElementById("healthText").textContent = "健康检查失败";
  }
}

async function queryFuyao() {
  const target = document.getElementById("fuyaoResult");
  target.textContent = "正在请求扶摇行情快照…";
  try {
    const result = await requestJson("/proxy-fuyao", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ thscode: document.getElementById("stockCode").value.trim() }) });
    target.textContent = JSON.stringify(result.data, null, 2);
  } catch (error) { target.textContent = error.message; }
}

async function queryQwen() {
  const target = document.getElementById("qwenResult");
  target.textContent = "正在调用千问…";
  try {
    const result = await requestJson("/api/qwen-check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: document.getElementById("qwenPrompt").value.trim() }) });
    target.textContent = JSON.stringify(result.data, null, 2);
  } catch (error) { target.textContent = error.message; }
}

function setStatus(id, ok) { const el = document.getElementById(id); el.className = `status ${ok ? "status-ok" : "status-error"}`; el.textContent = ok ? "已配置" : "未配置"; }
function loadReviews() { try { return JSON.parse(localStorage.getItem(STORE_KEY) || "[]"); } catch { return []; } }
function persistReviews() { localStorage.setItem(STORE_KEY, JSON.stringify(state.reviews)); }
function intentLabel(value) { return ({ factual: "事实查询", explanation: "分析解释", personalized: "个性化" })[value] || value; }
function verdictLabel(value) { return ({ pass: "通过", fail: "不通过", insufficient_evidence: "证据不足" })[value] || value; }
function humanLabel(value) { return ({ pending: "待复核", confirmed: "已确认", overruled: "已改判", deferred: "暂缓" })[value] || value; }
function ruleName(id) { return DATA.rubric.find((rule) => rule.id === id)?.name || "质量问题"; }
function formatApiError(data, status) { return `${data.stage ? `${data.stage} · ` : ""}${data.upstream_message || data.message || data.error || `HTTP ${status}`}`; }
function setButtonLoading(button, loading, label) { button.disabled = loading; button.classList.toggle("loading", loading); button.textContent = label; }
function toast(message) { const el = document.getElementById("toast"); el.textContent = message; el.classList.add("show"); window.clearTimeout(toast.timer); toast.timer = window.setTimeout(() => el.classList.remove("show"), 2200); }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]); }
async function requestJson(url, options = {}) { const response = await fetch(url, options); const raw = await response.text(); let data; try { data = JSON.parse(raw); } catch { throw new Error(`服务返回非 JSON（HTTP ${response.status}）`); } return { response, data }; }
