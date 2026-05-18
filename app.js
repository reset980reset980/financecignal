const API_URL = "/api/korea/dashboard";
const CNY_TO_KRW = 218.59;
const TRANSLATE_URL = "https://translate.googleapis.com/translate_a/single";
const translationCache = new Map(JSON.parse(localStorage.getItem("financeTranslationCache.v1") || "[]"));

const KO_TEXT = new Map([
  ["泰国火车相撞致5死，交通板块受扰动", "태국 열차 충돌로 5명 사망, 교통 섹터 단기 변동성 확대"],
  ["该事件为短期局部风险，对A股影响微弱。大秦铁路（601006）及广深铁路（601333）作为高股息标的，可能受益于避险资金的短暂配置。预期相关板块日内波动幅度在±0.5%以内，无长期投资逻辑支撑。", "이번 사고는 단기·국지적 위험으로 A주 전체 영향은 제한적입니다. 다친철도(601006)와 광선철도(601333)는 고배당 방어주 성격 때문에 단기 안전자산 선호 자금의 일시적 배분 수혜를 받을 수 있습니다. 관련 섹터의 당일 변동 폭은 ±0.5% 이내로 예상되며, 장기 투자 논리를 뒷받침할 수준은 아닙니다."],
  ["事件发生在5月16日18:52，属于超短期突发新闻（时效性0.9）。虽然致死人数为5人，但相较于全球交通流量，此事件属于小概率局部事故，市场定价处于'未定价'状态。核心传导逻辑在于'避险情绪'而非'业务受损'。A股相关标的（如大秦铁路）虽无直接业务往来，但因其防御属性，可能成为短线资金博弈避险的筹码，而非基本面驱动的投资标的。", "이 사건은 5월 16일 18시 52분에 발생한 초단기 돌발 뉴스입니다(시의성 0.9). 사망자는 5명이지만 글로벌 교통량 관점에서는 국지적 사고에 가깝고, 시장 가격에는 아직 충분히 반영되지 않은 상태로 해석됩니다. 핵심 전달 경로는 실적 훼손이 아니라 위험회피 심리입니다. 다친철도 같은 A주 관련 종목은 직접 사업 연관성은 낮지만 방어주 성격 때문에 단기 자금의 안전 선호 거래 대상이 될 수 있습니다."],
  ["事件触发", "사건 발생"],
  ["铁路运营", "철도 운영"],
  ["港口物流", "항만·물류"],
  ["避险资产", "위험회피 자산"],
  ["泰国曼谷发生火车与巴士相撞事故致5人死亡，引发市场对全球交通安全及运输效率的担忧。", "태국 방콕에서 열차와 버스가 충돌해 5명이 사망하면서 글로벌 교통 안전과 운송 효율에 대한 우려가 단기적으로 부각됐습니다."],
  ["短期内市场可能对铁路安全整改产生联想，但中国铁路网络独立运营，直接影响有限。", "단기적으로 철도 안전 점검 이슈가 연상될 수 있으나, 중국 철도망은 독립적으로 운영되므로 직접 영향은 제한적입니다."],
  ["作为国际交通枢纽，泰国的交通瘫痪风险理论上会增加周边港口（如新加坡、上海）的短期运输压力，但长期影响可忽略。", "태국은 국제 교통 거점이기 때문에 교통 차질이 주변 항만의 단기 운송 부담을 키울 수 있지만, 장기 영향은 미미합니다."],
  ["风险厌恶情绪上升可能导致资金短暂流向避险资产，如黄金（当前价格4540.07）或高股息股票（如大秦铁路）。", "위험회피 심리가 높아지면 자금이 금 또는 다친철도 같은 고배당 방어주로 일시 이동할 수 있습니다."],
  ["泰国火车与巴士相撞已致5人死亡", "태국 열차·버스 충돌로 5명 사망"],
  ["大秦铁路", "다친철도"],
  ["广深铁路", "광선철도"],
  ["未知", "미확인"]
]);

const KO_REPLACEMENTS = [
  ["泰国", "태국"],
  ["火车", "열차"],
  ["巴士", "버스"],
  ["相撞", "충돌"],
  ["死亡", "사망"],
  ["交通", "교통"],
  ["板块", "섹터"],
  ["风险", "위험"],
  ["短期", "단기"],
  ["长期", "장기"],
  ["市场", "시장"],
  ["铁路", "철도"],
  ["高股息", "고배당"],
  ["避险", "위험회피"],
  ["资金", "자금"],
  ["黄金", "금"],
  ["影响", "영향"]
];

const state = {
  data: null,
  signals: [],
  selectedSignal: null,
  selectedTicker: null,
  filter: "all",
  query: ""
};

const $ = (selector) => document.querySelector(selector);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatPercent(value) {
  return `${Math.round((Number(value) || 0) * 100)}%`;
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatKRW(value) {
  const converted = Number(value) * CNY_TO_KRW;
  if (!Number.isFinite(converted)) return "-";
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0
  }).format(converted);
}

function formatWon(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "-";
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0
  }).format(amount);
}

function pointToKrw(point, chart) {
  if (Number.isFinite(Number(point?.close_krw))) return Number(point.close_krw);
  if (chart?.currency === "KRW" || chart?.display_currency === "KRW") return Number(point?.close);
  return Number(point?.close) * CNY_TO_KRW;
}

function koText(value) {
  if (value === undefined || value === null) return "";
  let text = String(value);
  if (KO_TEXT.has(text)) return KO_TEXT.get(text);
  for (const [from, to] of KO_REPLACEMENTS) {
    text = text.split(from).join(to);
  }
  if (containsCjk(text)) return "한국어 번역 중입니다.";
  return text;
}

function containsCjk(value) {
  return /[\u3400-\u9fff]/.test(String(value || ""));
}

function normalizeMoneyText(text) {
  return String(text || "")
    .replace(/(\d+(?:\.\d+)?)\s*위안/g, (_, amount) => `${formatKRW(amount)}(원화 환산)`)
    .replace(/(\d+(?:\.\d+)?)\s*元/g, (_, amount) => `${formatKRW(amount)}(원화 환산)`);
}

async function translateText(value) {
  const original = String(value || "");
  if (!original) return "";
  if (KO_TEXT.has(original)) return normalizeMoneyText(KO_TEXT.get(original));
  if (!containsCjk(original)) return normalizeMoneyText(koText(original));
  if (translationCache.has(original)) return normalizeMoneyText(translationCache.get(original));

  const params = new URLSearchParams({
    client: "gtx",
    sl: "zh-CN",
    tl: "ko",
    dt: "t",
    q: original
  });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const response = await fetch(`${TRANSLATE_URL}?${params.toString()}`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) throw new Error(`translate ${response.status}`);
    const payload = await response.json();
    const translated = (payload?.[0] || []).map((part) => part?.[0] || "").join("") || koText(original);
    translationCache.set(original, translated);
    localStorage.setItem("financeTranslationCache.v1", JSON.stringify([...translationCache].slice(-500)));
    return normalizeMoneyText(translated);
  } catch {
    const fallback = normalizeMoneyText(koText(original));
    return containsCjk(fallback) ? "한국어 번역을 다시 시도 중입니다. 새로고침을 누르면 최신 번역 캐시로 갱신됩니다." : fallback;
  }
}

async function localizeData(data) {
  setSync("한글화 중");
  const signals = Array.isArray(data.signals) ? data.signals : [];
  const jobs = [];

  const addJob = (owner, key) => {
    if (!owner || !owner[key]) return;
    jobs.push(async () => {
      owner[key] = await translateText(owner[key]);
    });
  };

  for (const signal of signals) {
    addJob(signal, "title");
    addJob(signal, "summary");
    addJob(signal, "reasoning");
    addJob(signal, "price_in_status");

    for (const ticker of signal.impact_tickers || []) {
      addJob(ticker, "name");
    }
    for (const node of signal.transmission_chain || []) {
      addJob(node, "node_name");
      addJob(node, "logic");
    }
    for (const source of signal.sources || []) {
      addJob(source, "title");
    }
  }

  for (const chart of Object.values(data.charts || {})) {
    addJob(chart, "name");
    addJob(chart, "prediction_logic");
  }

  const batchSize = 4;
  for (let index = 0; index < jobs.length; index += batchSize) {
    await Promise.all(jobs.slice(index, index + batchSize).map((job) => job()));
  }
}

function koSourceName(value) {
  const map = {
    wallstreetcn: "화얼제젠원",
    "Search (ddg)": "한국어 뉴스 검색",
    ddg: "한국어 뉴스 검색"
  };
  return map[value] || koText(value || "출처");
}

function moodOf(score) {
  const value = Number(score) || 0;
  if (value > 0.08) return { key: "positive", label: "긍정", className: "good" };
  if (value < -0.08) return { key: "negative", label: "부정", className: "bad" };
  return { key: "neutral", label: "중립", className: "neutral" };
}

function impactLabel(value) {
  const map = {
    "利多": "호재",
    "利空": "악재",
    "中性": "중립",
    "中性偏空": "중립·약세",
    "中性偏多": "중립·강세"
  };
  return map[value] || value || "영향";
}

function textCorpus(signal) {
  return [
    koText(signal.title),
    koText(signal.summary),
    koText(signal.reasoning),
    ...(signal.impact_tickers || []).map((ticker) => `${ticker.code} ${koText(ticker.name)} ${ticker.ticker}`),
    ...(signal.transmission_chain || []).map((node) => `${koText(node.node_name)} ${koText(node.logic)} ${impactLabel(node.impact_type)}`)
  ].join(" ").toLowerCase();
}

function filteredSignals() {
  return state.signals.filter((signal) => {
    const mood = moodOf(signal.sentiment_score);
    const matchesMood = state.filter === "all" || mood.key === state.filter;
    const query = state.query.trim().toLowerCase();
    const matchesQuery = !query || textCorpus(signal).includes(query);
    return matchesMood && matchesQuery;
  });
}

async function loadData() {
  setSync("불러오는 중");
  try {
    const response = await fetch(API_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    state.data = data;
    state.signals = Array.isArray(data.signals) ? data.signals : [];
    state.selectedSignal = state.signals[0] || null;
    state.selectedTicker = firstTicker(state.selectedSignal);
    render();
    setSync("한국어 번역 중");
    localizeData(data).then(() => {
      render();
      setSync("실시간 연결");
    });
  } catch (error) {
    setSync("연결 실패");
    $("#signalList").innerHTML = `<div class="empty">데이터를 불러오지 못했습니다: ${escapeHtml(error.message)}</div>`;
  }
}

function setSync(label) {
  $("#syncState").textContent = label;
}

function firstTicker(signal) {
  return signal?.impact_tickers?.[0]?.ticker || Object.keys(state.data?.charts || {})[0] || null;
}

function render() {
  renderSummary();
  renderSignalList();
  renderDetail();
}

function renderSummary() {
  const signals = state.signals;
  const tickers = new Set();
  signals.forEach((signal) => (signal.impact_tickers || []).forEach((ticker) => tickers.add(ticker.ticker || ticker.code)));
  const avgConfidence = signals.length
    ? signals.reduce((sum, signal) => sum + (Number(signal.confidence) || 0), 0) / signals.length
    : 0;

  $("#generatedAt").textContent = formatDate(state.data?.generated_at);
  $("#signalCount").textContent = String(state.data?.count ?? signals.length);
  $("#avgConfidence").textContent = formatPercent(avgConfidence);
  $("#tickerCount").textContent = String(tickers.size);
}

function renderSignalList() {
  const list = filteredSignals();
  $("#signalList").innerHTML = "";
  if (!list.length) {
    $("#signalList").innerHTML = `<div class="empty">조건에 맞는 신호가 없습니다.</div>`;
    return;
  }

  list.forEach((signal) => {
    const mood = moodOf(signal.sentiment_score);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `signal-card ${state.selectedSignal?.signal_id === signal.signal_id ? "active" : ""}`;
    button.innerHTML = `
      <div class="mini-row">
        <span class="pill ${mood.className}">${mood.label}</span>
        <span class="pill">신뢰도 ${formatPercent(signal.confidence)}</span>
      </div>
      <h3>${escapeHtml(koText(signal.title || "제목 없음"))}</h3>
      <p>${escapeHtml(koText(signal.summary || "")).slice(0, 145)}${koText(signal.summary || "").length > 145 ? "..." : ""}</p>
      <div class="mini-row">
        <span class="pill">강도 ${signal.intensity ?? "-"}</span>
        <span class="pill">${escapeHtml(signal.expected_horizon || "기간 미상")}</span>
      </div>
    `;
    button.addEventListener("click", () => {
      state.selectedSignal = signal;
      state.selectedTicker = firstTicker(signal);
      render();
    });
    $("#signalList").appendChild(button);
  });
}

function renderDetail() {
  const signal = state.selectedSignal;
  if (!signal) {
    $("#detailTitle").textContent = "신호가 없습니다";
    return;
  }

  const mood = moodOf(signal.sentiment_score);
  $("#detailSource").textContent = `${signal.signal_id || "signal"} · 가격 반영: ${koText(signal.price_in_status || "가격 반영 상태 미상")}`;
  $("#detailTitle").textContent = koText(signal.title || "제목 없음");
  $("#detailMood").textContent = mood.label;
  $("#detailMood").className = `mood ${mood.className}`;

  setMetric("sentiment", Number(signal.sentiment_score) || 0, (Number(signal.sentiment_score) || 0).toFixed(2));
  setMetric("confidence", Number(signal.confidence) || 0, formatPercent(signal.confidence));
  setMetric("intensity", Number(signal.intensity) || 0, String(signal.intensity ?? 0));
  setMetric("timeliness", Number(signal.timeliness) || 0, formatPercent(signal.timeliness));

  $("#summaryText").textContent = koText(signal.summary || "-");
  $("#reasoningText").textContent = koText(signal.reasoning || "-");
  renderChain(signal);
  renderTickers(signal);
  renderLinks("#sourceLinks", signal.sources || [], "source_name");
  renderKoreanArticleSearch(signal);
  renderChart();
}

function setMetric(prefix, value, label) {
  $(`#${prefix}Score`).textContent = label;
  const meter = $(`#${prefix}Meter`);
  if (meter) meter.value = prefix === "sentiment" ? clamp(value, -1, 1) : clamp(value, 0, Number(meter.max) || 1);
}

function renderChain(signal) {
  const chain = signal.transmission_chain || [];
  $("#chainCount").textContent = `${chain.length}단계`;
  $("#chainList").innerHTML = chain.map((node) => `
    <li>
      <strong>${escapeHtml(koText(node.node_name || "단계"))} · ${escapeHtml(impactLabel(node.impact_type))}</strong>
      <span>${escapeHtml(koText(node.logic || ""))}</span>
    </li>
  `).join("");
}

function renderTickers(signal) {
  const tickers = signal.impact_tickers || [];
  $("#tickerHint").textContent = tickers.length ? `${tickers.length}개` : "없음";
  $("#tickerList").innerHTML = tickers.map((ticker) => `
    <button type="button" class="ticker-button ${state.selectedTicker === ticker.ticker ? "active" : ""}" data-ticker="${escapeHtml(ticker.ticker || "")}" onclick="window.selectTicker('${escapeJs(ticker.ticker || "")}')">
      <span>
        <strong>${escapeHtml(koText(ticker.name || ticker.code || ticker.ticker || "종목"))}</strong>
        <small>${escapeHtml(ticker.code || ticker.ticker || "")}</small>
      </span>
      <span class="pill">가중 ${Number(ticker.weight || 0).toFixed(1)}</span>
    </button>
  `).join("") || `<div class="empty">영향 종목 정보가 없습니다.</div>`;
}

function renderLinks(selector, links, labelKey) {
  const container = $(selector);
  container.innerHTML = links.map((item) => {
    const label = koSourceName(item[labelKey] || item.source_name || item.source || "source");
    return `<a href="${escapeAttr(item.url || "#")}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)} · ${escapeHtml(koText(item.title || item.url || "링크"))}</a>`;
  }).join("") || `<div class="empty">링크 없음</div>`;
}

function renderKoreanArticleSearch(signal) {
  const tickers = (signal.impact_tickers || []).map((ticker) => koText(ticker.name || ticker.code || ticker.ticker));
  const query = [koText(signal.title), ...tickers, "관련 뉴스"].filter(Boolean).join(" ");
  const encoded = encodeURIComponent(query);
  const links = [
    { label: "네이버 뉴스", url: `https://search.naver.com/search.naver?where=news&query=${encoded}` },
    { label: "구글 뉴스 한국", url: `https://news.google.com/search?q=${encoded}&hl=ko&gl=KR&ceid=KR:ko` },
    { label: "다음 뉴스", url: `https://search.daum.net/search?w=news&q=${encoded}` },
    { label: "빙 뉴스 한국어", url: `https://www.bing.com/news/search?q=${encoded}&setlang=ko-KR` }
  ];
  $("#searchLinks").innerHTML = links.map((link) => `
    <a href="${escapeAttr(link.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.label)} · ${escapeHtml(query)}</a>
  `).join("");
}

function renderChart() {
  const chart = state.data?.charts?.[state.selectedTicker];
  const canvas = $("#priceChart");
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!chart) {
    $("#chartTitle").textContent = "가격·예측 차트";
    $("#chartMeta").textContent = "선택한 종목의 차트 데이터가 없습니다.";
    $("#predictionRange").textContent = "-";
    drawEmpty(ctx, canvas, "차트 데이터 없음");
    return;
  }

  const lastClose = pointToKrw(chart.prices?.at(-1), chart);
  $("#chartTitle").textContent = `${koText(chart.name || chart.ticker)} (${chart.ticker})`;
  $("#chartMeta").textContent = `최근 ${chart.prices?.length || 0}개 가격 + ${chart.forecast?.length || 0}개 예측 · 최근 종가 ${formatWon(lastClose)} · 기준 통화 원화`;
  $("#predictionRange").textContent = `목표 ${chart.prediction?.target_low ?? "-"}% ~ ${chart.prediction?.target_high ?? "-"}%`;

  const historical = (chart.prices || []).map((point) => ({ ...point, type: "price" }));
  const forecast = (chart.forecast || []).map((point) => ({ ...point, type: "forecast" }));
  const all = [...historical, ...forecast];
  if (!all.length) {
    drawEmpty(ctx, canvas, "차트 데이터 없음");
    return;
  }

  const values = all.map((point) => pointToKrw(point, chart)).filter(Number.isFinite);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max((max - min) * 0.18, 0.05);
  const yMin = min - pad;
  const yMax = max + pad;
  const left = 54;
  const right = 24;
  const top = 24;
  const bottom = 42;
  const width = canvas.width - left - right;
  const height = canvas.height - top - bottom;

  ctx.fillStyle = "#fffdf7";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawGrid(ctx, canvas, left, top, width, height, yMin, yMax);

  const xFor = (index) => left + (index / Math.max(all.length - 1, 1)) * width;
  const yFor = (value) => top + (1 - (value - yMin) / (yMax - yMin || 1)) * height;

  drawLine(ctx, historical, 0, xFor, yFor, "#245f87", false, chart);
  drawLine(ctx, forecast, historical.length, xFor, yFor, "#b23a2f", true, chart);

  ctx.fillStyle = "#4f5b55";
  ctx.font = "22px Georgia";
  ctx.fillText(`${koText(chart.name || chart.ticker)}`, left, 22);
  ctx.font = "12px sans-serif";
  ctx.fillText("실선: 최근 종가 / 점선: 예측 종가 / 가격 단위: 원화 환산", left, canvas.height - 14);
}

function drawGrid(ctx, canvas, left, top, width, height, yMin, yMax) {
  ctx.strokeStyle = "rgba(23,33,28,0.12)";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#6d746e";
  ctx.font = "12px sans-serif";
  for (let i = 0; i <= 4; i += 1) {
    const y = top + (height / 4) * i;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(left + width, y);
    ctx.stroke();
    const label = formatWon(yMax - ((yMax - yMin) / 4) * i);
    ctx.fillText(label, 8, y + 4);
  }
  ctx.strokeStyle = "rgba(23,33,28,0.28)";
  ctx.strokeRect(left, top, width, height);
}

function drawLine(ctx, points, offset, xFor, yFor, color, dashed, chart) {
  if (!points.length) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.setLineDash(dashed ? [8, 7] : []);
  ctx.beginPath();
  points.forEach((point, index) => {
    const x = xFor(offset + index);
    const y = yFor(pointToKrw(point, chart));
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = color;
  points.forEach((point, index) => {
    const x = xFor(offset + index);
    const y = yFor(pointToKrw(point, chart));
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawEmpty(ctx, canvas, label) {
  ctx.fillStyle = "#fffdf7";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#6d746e";
  ctx.font = "24px Georgia";
  ctx.textAlign = "center";
  ctx.fillText(label, canvas.width / 2, canvas.height / 2);
  ctx.textAlign = "start";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function escapeJs(value) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

$("#refreshBtn").addEventListener("click", loadData);
$("#searchInput").addEventListener("input", (event) => {
  state.query = event.target.value;
  renderSignalList();
});

$("#tickerList").addEventListener("click", (event) => {
  const button = event.target.closest(".ticker-button");
  if (!button) return;
  state.selectedTicker = button.dataset.ticker;
  renderDetail();
});

window.selectTicker = (ticker) => {
  if (!ticker) return;
  state.selectedTicker = ticker;
  renderDetail();
};

document.querySelectorAll(".filters button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".filters button").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    state.filter = button.dataset.filter;
    renderSignalList();
  });
});

loadData();

async function apiGet(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`API ${response.status}`);
  return response.json();
}

async function apiPost(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`API ${response.status}`);
  return response.json();
}

function setOutput(selector, html) {
  const element = document.querySelector(selector);
  if (element) element.innerHTML = html;
}

function linkList(items) {
  return items.map((item) => `<div><a href="${escapeAttr(item.url || "#")}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title || item.name || item.question || item.url)}</a></div>`).join("");
}

async function checkApiHealth() {
  try {
    const health = await apiGet("/api/health");
    document.querySelector("#apiHealth").textContent = health.ok ? "API 정상" : "API 확인 필요";
  } catch {
    document.querySelector("#apiHealth").textContent = "API 연결 실패";
  }
}

async function runTool(tool) {
  try {
    if (tool === "news") {
      setOutput("#newsOutput", "뉴스를 불러오는 중입니다.");
      const source = document.querySelector("#newsSource").value;
      const data = await apiGet(`/api/news/hot?source=${encodeURIComponent(source)}&count=8`);
      setOutput("#newsOutput", `<strong>${escapeHtml(data.source_name)}</strong>${linkList(data.items)}`);
    }
    if (tool === "polymarket") {
      setOutput("#polyOutput", "예측시장을 불러오는 중입니다.");
      const q = document.querySelector("#polyQuery").value || "금융 경제 주식 비트코인 금리";
      const data = await apiGet(`/api/polymarket/markets?limit=8&q=${encodeURIComponent(q)}`);
      const notice = data.fallback
        ? `<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:4px;padding:8px 12px;margin-bottom:8px;color:#856404;font-size:13px;">⚠️ ${escapeHtml(data.fallback_reason || "폴리마켓 대체 데이터")}</div>`
        : "";
      const marketsList = data.markets.map((market) => `<div><a href="${escapeAttr(market.url)}" target="_blank">${escapeHtml(market.question_ko || market.question)}</a><br>${escapeHtml((market.tags_ko || []).join(" · "))}<br>거래량 ${Math.round(market.volume).toLocaleString("ko-KR")}</div>`).join("<hr>");
      setOutput("#polyOutput", notice + (marketsList || "조건에 맞는 금융 예측시장을 찾지 못했습니다."));
    }
    if (tool === "search") {
      const q = document.querySelector("#searchQuery").value || state.selectedSignal?.title || "금융 시장 뉴스";
      const data = await apiGet(`/api/search?q=${encodeURIComponent(q)}`);
      setOutput("#searchOutput", linkList(data.engines));
    }
    if (tool === "stock") {
      const q = document.querySelector("#stockQuery").value || "삼성전자";
      const found = await apiGet(`/api/stock/search?q=${encodeURIComponent(q)}`);
      const ticker = found.results[0]?.ticker || q;
      const [price, fundamentals] = await Promise.all([
        apiGet(`/api/stock/price?ticker=${encodeURIComponent(ticker)}&days=30`),
        apiGet(`/api/stock/fundamentals?ticker=${encodeURIComponent(ticker)}`)
      ]);
      setOutput("#stockOutput", `<strong>${escapeHtml(fundamentals.name)} (${escapeHtml(ticker)})</strong><br>최근 종가: ${fundamentals.latest_close_krw ? formatWon(fundamentals.latest_close_krw) : fundamentals.latest_close}<br>1개월 변화율: ${fundamentals.one_month_change_percent}%<br>가격 데이터: ${price.prices.length}개`);
    }
    if (tool === "sentiment") {
      const text = document.querySelector("#sentimentText").value || state.selectedSignal?.summary || "";
      const data = await apiPost("/api/sentiment/analyze", { text });
      setOutput("#sentimentOutput", `<strong>${escapeHtml(data.label_ko || koText(data.label))}</strong><br>점수 ${data.score}<br>${escapeHtml(data.reason)}`);
    }
    if (tool === "predict") {
      const ticker = document.querySelector("#predictTicker").value || state.selectedTicker || "005930.KS";
      const data = await apiGet(`/api/predict?ticker=${encodeURIComponent(ticker)}&days=5`);
      setOutput("#predictOutput", `<strong>${escapeHtml(data.name)} (${escapeHtml(data.ticker)})</strong><br>방식: ${escapeHtml(data.method)}<br>신뢰도: ${data.confidence}%<br>${data.forecast.map((point) => `${point.date}: ${point.close_krw ? `₩${point.close_krw.toLocaleString("ko-KR")}` : point.close}`).join("<br>")}`);
    }
    if (tool === "track") {
      const newInfo = document.querySelector("#trackText").value || "새 정보 없음";
      const data = await apiPost("/api/signal/track", { signal: state.selectedSignal, newInfo });
      setOutput("#trackOutput", `<strong>${escapeHtml(data.status)}</strong><br>신뢰도 ${Math.round(data.oldConfidence * 100)}% → ${Math.round(data.nextConfidence * 100)}%<br>${escapeHtml(data.sentiment.reason)}`);
    }
    if (tool === "visualize") {
      const data = await apiPost("/api/visualize/chain", { signal: state.selectedSignal || {} });
      setOutput("#visualOutput", data.svg || "시각화할 체인이 없습니다.");
    }
    if (tool === "report") {
      const data = await apiPost("/api/report/generate", { signals: state.signals, title: "Finance Signal Radar 리포트" });
      setOutput("#reportOutput", escapeHtml(data.markdown));
    }
  } catch (error) {
    setOutput(`#${tool}Output`, `오류: ${escapeHtml(error.message)}`);
  }
}

document.querySelectorAll("[data-tool]").forEach((button) => {
  button.addEventListener("click", () => runTool(button.dataset.tool));
});

[
  ["#polyQuery", "polymarket"],
  ["#searchQuery", "search"],
  ["#stockQuery", "stock"],
  ["#predictTicker", "predict"],
].forEach(([selector, tool]) => {
  const el = document.querySelector(selector);
  if (el) el.addEventListener("keydown", (e) => { if (e.key === "Enter") runTool(tool); });
});

checkApiHealth();
