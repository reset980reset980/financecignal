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
  selectedArticle: null,
  articleSelections: [],
  chartRequests: new Set(),
  chartErrors: {},
  filter: "all",
  query: ""
};

const FILTER_LABELS = {
  all: "전체",
  positive: "긍정",
  neutral: "중립",
  negative: "부정"
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

function queryMatchedSignals() {
  const query = state.query.trim().toLowerCase();
  return state.signals.filter((signal) => !query || textCorpus(signal).includes(query));
}

function syncSelectionWithVisibleSignals() {
  const visible = filteredSignals();
  if (!visible.length) {
    state.selectedSignal = null;
    state.selectedTicker = null;
    return;
  }
  if (!visible.some((signal) => signal.signal_id === state.selectedSignal?.signal_id)) {
    state.selectedSignal = visible[0];
    state.selectedTicker = firstTicker(visible[0]);
  }
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
    syncToolInputsFromSelection(true);
    render();
    setSync("한국어 번역 중");
    localizeData(data).then(() => {
      syncToolInputsFromSelection(true);
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

function firstTickerInfo(signal = state.selectedSignal) {
  const tickers = signal?.impact_tickers || [];
  return tickers.find((ticker) => ticker.ticker === state.selectedTicker || ticker.code === state.selectedTicker) || tickers[0] || null;
}

function selectedStockName(signal = state.selectedSignal) {
  const ticker = firstTickerInfo(signal);
  return koText(ticker?.name || ticker?.code || ticker?.ticker || firstTicker(signal) || "");
}

function selectedNewsQuery(signal = state.selectedSignal) {
  if (!signal) return "한국 금융시장 뉴스";
  const ticker = firstTickerInfo(signal);
  const tags = (signal.industry_tags || []).slice(0, 2);
  return [koText(ticker?.name || ""), ...tags, "뉴스", "실적", "전망"].filter(Boolean).join(" ");
}

function setSyncedInput(selector, value, force = false) {
  const element = document.querySelector(selector);
  const next = String(value || "").trim();
  if (!element || !next) return;
  const canSync = force || !element.value.trim() || element.dataset.synced === "true";
  if (!canSync) return;
  element.value = next;
  element.dataset.synced = "true";
}

function syncToolInputsFromSelection(force = false) {
  if (!state.selectedSignal) return;
  const stockName = selectedStockName();
  setSyncedInput("#polyQuery", selectedPredictionQuery(), force);
  setSyncedInput("#searchQuery", selectedNewsQuery(), force);
  setSyncedInput("#predictTicker", stockName || state.selectedTicker, force);
}

function render() {
  renderSummary();
  renderFilterCounts();
  renderProgressFlow();
  renderVisualFeed();
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
      syncToolInputsFromSelection(true);
      render();
    });
    $("#signalList").appendChild(button);
  });
}

function renderFilterCounts() {
  const queryMatched = queryMatchedSignals();
  const counts = { all: queryMatched.length, positive: 0, neutral: 0, negative: 0 };
  queryMatched.forEach((signal) => {
    counts[moodOf(signal.sentiment_score).key] += 1;
  });
  document.querySelectorAll(".filters button").forEach((button) => {
    const filter = button.dataset.filter || "all";
    button.textContent = `${FILTER_LABELS[filter] || filter} ${counts[filter] ?? 0}`;
    button.classList.toggle("empty-filter", filter !== "all" && (counts[filter] ?? 0) === 0);
  });
}

function renderProgressFlow() {
  const container = $("#phaseFlow");
  if (!container) return;
  const steps = state.data?.workflow?.length ? state.data.workflow : [
    { label: "의도 파악", detail: "요청 분석 대기", progress: state.data ? 100 : 0 },
    { label: "한국어 뉴스 수집", detail: "국내 기사 기반 데이터 확인", progress: state.data ? 100 : 0 },
    { label: "ISQ 신호 점수화", detail: "5축 점수 산출", progress: state.data ? 100 : 0 },
    { label: "원화 차트·예측", detail: "가격 및 단기 예측 연결", progress: state.data ? 100 : 0 },
    { label: "리포트 준비", detail: "한글 결과 구성", progress: state.data ? 100 : 0 }
  ];
  const total = steps.length ? Math.round(steps.reduce((sum, step) => sum + (Number(step.progress) || 0), 0) / steps.length) : 0;
  $("#processSummary").textContent = state.data ? `분석 완료 ${total}% · ${state.signals.length}개 신호` : "데이터 수집 전";
  container.innerHTML = steps.map((step, index) => `
    <div class="phase-step-card ${Number(step.progress) >= 100 ? "done" : ""}">
      <div class="phase-index">${index + 1}</div>
      <div>
        <strong>${escapeHtml(step.label || `단계 ${index + 1}`)}</strong>
        <span>${escapeHtml(step.detail || "")}</span>
        <i><b style="width:${clamp(Number(step.progress) || 0, 0, 100)}%"></b></i>
      </div>
      <em>${Math.round(Number(step.progress) || 0)}%</em>
    </div>
  `).join("");
}

function renderVisualFeed() {
  const container = $("#visualFeed");
  if (!container) return;
  const list = filteredSignals();
  if (!list.length) {
    container.innerHTML = `<div class="empty">시각화할 신호가 없습니다.</div>`;
    return;
  }
  container.innerHTML = list.map((signal, index) => visualSignalCard(signal, index)).join("");
}

function visualSignalCard(signal, index) {
  const mood = moodOf(signal.sentiment_score);
  const chain = signal.transmission_chain || [];
  const tickers = signal.impact_tickers || [];
  const tags = signal.industry_tags || [];
  const metrics = signalMetrics(signal);
  const sources = signal.sources || [];
  const prediction = signal.prediction_summary || {};
  const predictionMarket = signal.prediction_market_summary;
  return `
    <article class="visual-signal-card ${mood.className}" data-signal-id="${escapeAttr(signal.signal_id || String(index))}">
      <div class="visual-card-top">
        <div>
          <div class="mini-row visual-meta">
            <span class="pill ${mood.className}">${mood.label}</span>
            <span class="pill">ISQ ${Math.round(metrics.quality * 100)}</span>
            ${prediction.direction ? `<span class="pill">예측 ${escapeHtml(prediction.direction)} ${Number(prediction.change_percent || 0).toFixed(2)}%</span>` : ""}
            ${predictionMarket ? `<span class="pill">예측시장 ${escapeHtml(predictionMarket.label || "")}</span>` : ""}
            <span class="pill">${escapeHtml(signal.expected_horizon || "T+N")}</span>
          </div>
          <h3>${escapeHtml(koText(signal.title || "금융 신호"))}</h3>
          <p>${escapeHtml(koText(signal.summary || "")).slice(0, 210)}${koText(signal.summary || "").length > 210 ? "..." : ""}</p>
        </div>
        <button type="button" class="visual-jump" onclick="window.openSignal('${escapeJs(signal.signal_id || "")}')">상세</button>
      </div>
      <div class="visual-card-body">
        <div class="radar-box">
          ${radarSvg(metrics, mood.className)}
          <div class="radar-caption">감성 · 신뢰도 · 강도 · 예상 괴리 · 시의성</div>
        </div>
        <div class="metric-stack">
          ${metricBar("감성", metrics.sentiment)}
          ${metricBar("신뢰도", metrics.confidence)}
          ${metricBar("강도", metrics.intensity)}
          ${metricBar("괴리", metrics.expectationGap)}
          ${metricBar("시의성", metrics.timeliness)}
          ${prediction.confidence ? `<div class="prediction-inline"><strong>예측 신뢰도 ${escapeHtml(String(prediction.confidence))}%</strong><span>범위 ${escapeHtml(String(prediction.target_low ?? "-"))}% ~ ${escapeHtml(String(prediction.target_high ?? "-"))}%</span></div>` : ""}
          ${predictionMarket ? `<div class="prediction-inline market"><strong>예측시장 ${escapeHtml(predictionMarket.matched ? "직접 반영" : "직접 매칭 없음")}</strong><span>${escapeHtml(predictionMarket.matched ? (predictionMarket.probability ? `대표 확률 ${predictionMarket.probability}%` : predictionMarket.question || "직접 관련 시장") : "관련 없는 검색 결과 배제")}</span></div>` : ""}
        </div>
        <div class="mini-chain-map">
          <div class="mini-chain-title">전달 그래프</div>
          ${chainGraphSvg(chain, mood.className)}
        </div>
      </div>
      <div class="visual-card-foot">
        <div class="visual-tags">
          ${[...tags, ...tickers.map((ticker) => koText(ticker.name || ticker.ticker || ticker.code || "종목"))].slice(0, 5).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("") || "<span>영향 종목 없음</span>"}
        </div>
        <div class="visual-source-list">
          ${sources.slice(0, 2).map((source) => `<a href="${escapeAttr(source.url || "#")}" target="_blank" rel="noopener noreferrer">${escapeHtml(koSourceName(source.source_name || source.source))} · ${escapeHtml(koText(source.title || ""))}</a>`).join("") || "<span>한국어 기사/시장 데이터 기반</span>"}
        </div>
      </div>
    </article>
  `;
}

function signalMetrics(signal) {
  const sentimentRaw = Number(signal.sentiment_score) || 0;
  const sentiment = Math.abs(sentimentRaw);
  const confidence = Number(signal.confidence) || 0;
  const intensity = clamp((Number(signal.intensity) || 0) / 5, 0, 1);
  const marketLift = signal.prediction_market_summary?.direct ? 0.08 : 0;
  const expectationGap = Number(signal.expectation_gap ?? signal.expectationGap ?? 0.5) + marketLift;
  const timeliness = Number(signal.timeliness) || 0;
  const marketQuality = signal.prediction_market_summary?.direct ? clamp(Number(signal.prediction_market_summary.probability || 50) / 100, 0, 1) : 0;
  const quality = (confidence * 0.31) + (intensity * 0.27) + (expectationGap * 0.18) + (timeliness * 0.14) + (marketQuality * 0.1);
  return {
    sentiment: clamp(sentiment, 0, 1),
    confidence: clamp(confidence, 0, 1),
    intensity,
    expectationGap: clamp(expectationGap, 0, 1),
    timeliness: clamp(timeliness, 0, 1),
    quality: clamp(quality, 0, 1)
  };
}

function radarSvg(metrics, moodClass) {
  const labels = ["감성", "신뢰", "강도", "괴리", "시의"];
  const values = [metrics.sentiment, metrics.confidence, metrics.intensity, metrics.expectationGap, metrics.timeliness];
  const cx = 96;
  const cy = 90;
  const maxR = 62;
  const points = values.map((value, index) => radarPoint(cx, cy, maxR * value, index, values.length));
  const rings = [0.33, 0.66, 1].map((ratio) => values.map((_, index) => radarPoint(cx, cy, maxR * ratio, index, values.length)).map((point) => point.join(",")).join(" "));
  const axes = values.map((_, index) => radarPoint(cx, cy, maxR, index, values.length));
  const labelNodes = axes.map((point, index) => `<text x="${point[0]}" y="${point[1] + (point[1] > cy ? 14 : -7)}" text-anchor="middle">${labels[index]}</text>`).join("");
  const fill = moodClass === "bad" ? "#b23a2f" : moodClass === "good" ? "#0f7b5f" : "#245f87";
  return `
    <svg class="radar-svg" viewBox="0 0 192 182" role="img" aria-label="ISQ 레이더 차트">
      ${rings.map((ring) => `<polygon points="${ring}" class="radar-ring"></polygon>`).join("")}
      ${axes.map((point) => `<line x1="${cx}" y1="${cy}" x2="${point[0]}" y2="${point[1]}" class="radar-axis"></line>`).join("")}
      <polygon points="${points.map((point) => point.join(",")).join(" ")}" fill="${fill}" class="radar-poly"></polygon>
      ${points.map((point) => `<circle cx="${point[0]}" cy="${point[1]}" r="3.3" fill="${fill}"></circle>`).join("")}
      ${labelNodes}
    </svg>
  `;
}

function radarPoint(cx, cy, radius, index, total) {
  const angle = -Math.PI / 2 + (Math.PI * 2 * index) / total;
  return [Number((cx + Math.cos(angle) * radius).toFixed(2)), Number((cy + Math.sin(angle) * radius).toFixed(2))];
}

function metricBar(label, value) {
  const percent = Math.round(clamp(value, 0, 1) * 100);
  return `
    <div class="metric-bar">
      <span>${escapeHtml(label)}</span>
      <strong>${percent}</strong>
      <i style="--value:${percent}%"></i>
    </div>
  `;
}

function miniChain(chain) {
  if (!chain.length) return `<div class="empty mini-empty">체인 데이터 없음</div>`;
  return `
    <div class="chain-nodes">
      ${chain.slice(0, 4).map((node, index) => `
        <div class="chain-node">
          <b>${index + 1}</b>
          <span>${escapeHtml(koText(node.node_name || "단계"))}</span>
          <small>${escapeHtml(impactLabel(node.impact_type))}</small>
        </div>
      `).join("")}
    </div>
  `;
}

function chainGraphSvg(chain, moodClass) {
  if (!chain.length) return `<div class="empty mini-empty">체인 데이터 없음</div>`;
  const nodes = chain.slice(0, 4);
  const width = 360;
  const height = 150;
  const step = nodes.length > 1 ? (width - 70) / (nodes.length - 1) : 0;
  const colorFor = (impact) => {
    const text = String(impact || "");
    if (/호재|강세|상승|利多/.test(text)) return "#17a77d";
    if (/악재|약세|하락|利空/.test(text)) return "#d24b3f";
    return moodClass === "bad" ? "#b85b52" : "#64748b";
  };
  const edges = nodes.slice(1).map((_, index) => {
    const x1 = 34 + index * step + 26;
    const x2 = 34 + (index + 1) * step - 26;
    return `<path d="M${x1} 70 C${x1 + 18} 52 ${x2 - 18} 52 ${x2} 70" class="graph-edge"></path>`;
  }).join("");
  const nodeSvg = nodes.map((node, index) => {
    const x = 34 + index * step;
    const color = colorFor(node.impact_type);
    const name = truncateLabel(koText(node.node_name || `단계 ${index + 1}`), 7);
    const impact = truncateLabel(impactLabel(node.impact_type), 6);
    return `
      <g class="graph-node">
        <circle cx="${x}" cy="70" r="${index === 0 ? 25 : 22}" fill="${color}"></circle>
        <text x="${x}" y="74" text-anchor="middle">${index + 1}</text>
        <text x="${x}" y="116" text-anchor="middle" class="graph-label">${escapeHtml(name)}</text>
        <text x="${x}" y="132" text-anchor="middle" class="graph-impact">${escapeHtml(impact)}</text>
      </g>
    `;
  }).join("");
  return `
    <svg class="chain-graph-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="투자 논리 전달 그래프">
      <defs>
        <marker id="graphArrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L0,6 L7,3 z" fill="#8ea4b8"></path>
        </marker>
      </defs>
      ${edges}
      ${nodeSvg}
    </svg>
  `;
}

function truncateLabel(value, max) {
  const text = String(value || "");
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function renderDetail() {
  const signal = state.selectedSignal;
  if (!signal) {
    $("#detailSource").textContent = "필터 결과";
    $("#detailTitle").textContent = "조건에 맞는 신호가 없습니다";
    $("#detailMood").textContent = "-";
    $("#detailMood").className = "mood neutral";
    setMetric("sentiment", 0, "0.00");
    setMetric("confidence", 0, "0%");
    setMetric("intensity", 0, "0");
    setMetric("timeliness", 0, "0%");
    $("#summaryText").textContent = "검색어 또는 긍정·중립·부정 필터를 바꾸면 결과가 다시 표시됩니다.";
    $("#reasoningText").textContent = "-";
    $("#chainCount").textContent = "0단계";
    $("#chainList").innerHTML = "";
    $("#tickerHint").textContent = "없음";
    $("#tickerList").innerHTML = `<div class="empty">영향 종목 정보가 없습니다.</div>`;
    $("#sourceLinks").innerHTML = `<div class="empty">링크 없음</div>`;
    $("#searchLinks").innerHTML = `<div class="empty">검색 결과 없음</div>`;
    renderChart();
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
    const error = state.chartErrors[state.selectedTicker];
    $("#chartMeta").textContent = error || "선택 종목의 실제 가격·예측 데이터를 불러오는 중입니다.";
    $("#predictionRange").textContent = "-";
    drawEmpty(ctx, canvas, error ? "차트 로딩 실패" : "차트 로딩 중");
    ensureChartForSelectedTicker();
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

function ensureChartForSelectedTicker() {
  const ticker = state.selectedTicker;
  if (!ticker || state.data?.charts?.[ticker] || state.chartRequests.has(ticker) || state.chartErrors[ticker]) return;
  state.chartRequests.add(ticker);
  delete state.chartErrors[ticker];
  apiGet(`/api/predict?ticker=${encodeURIComponent(ticker)}&days=5`)
    .then((data) => {
      applyPredictionToSignal(data);
    })
    .catch((error) => {
      state.chartErrors[ticker] = `차트 데이터를 불러오지 못했습니다: ${error.message}`;
      if (state.selectedTicker === ticker) renderChart();
    })
    .finally(() => {
      state.chartRequests.delete(ticker);
    });
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
$("#searchInput")?.addEventListener("input", (event) => {
  state.query = event.target.value;
  syncSelectionWithVisibleSignals();
  syncToolInputsFromSelection(true);
  render();
});

$("#tickerList").addEventListener("click", (event) => {
  const button = event.target.closest(".ticker-button");
  if (!button) return;
  state.selectedTicker = button.dataset.ticker;
  syncToolInputsFromSelection(true);
  renderDetail();
});

window.selectTicker = (ticker) => {
  if (!ticker) return;
  state.selectedTicker = ticker;
  syncToolInputsFromSelection(true);
  renderDetail();
};

window.openSignal = (signalId) => {
  const signal = state.signals.find((item) => String(item.signal_id || "") === String(signalId));
  if (!signal) return;
  state.selectedSignal = signal;
  state.selectedTicker = firstTicker(signal);
  syncToolInputsFromSelection(true);
  render();
  document.querySelector(".detail")?.scrollIntoView({ behavior: "smooth", block: "start" });
};

document.querySelectorAll(".filters button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".filters button").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    state.filter = button.dataset.filter;
    syncSelectionWithVisibleSignals();
    syncToolInputsFromSelection(true);
    render();
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

function articleInputText(article) {
  if (!article) return "";
  return [
    `[선택 기사] ${article.title || ""}`,
    article.snippet || "",
    article.url ? `원문: ${article.url}` : ""
  ].filter(Boolean).join("\n");
}

function setHybridTextarea(selector, text) {
  const element = document.querySelector(selector);
  if (!element || !text) return;
  const current = element.value.trim();
  const marker = "\n\n[직접 입력]\n";
  const direct = current.includes(marker)
    ? current.slice(current.indexOf(marker) + marker.length).trim()
    : (current.startsWith("[선택 기사]") ? "" : current);
  if (!current) {
    element.value = `${text}\n\n[직접 입력]\n`;
    return;
  }
  element.value = `${text}\n\n[직접 입력]\n${direct}`;
}

function renderSearchResults(data) {
  state.articleSelections = data.articles || [];
  const engines = `
    <div class="search-engine-links">
      <strong>검색 엔진 링크</strong>
      ${linkList(data.engines || [])}
    </div>
  `;
  const articles = state.articleSelections.map((article, index) => `
    <article class="article-result-card">
      <div>
        <strong>${escapeHtml(article.title || "기사 제목 없음")}</strong>
        <span>${escapeHtml(article.source_name || "한국어 기사")} · ${escapeHtml(formatDate(article.published_at))}</span>
      </div>
      <p>${escapeHtml(article.snippet || "")}</p>
      <div class="article-actions">
        <a href="${escapeAttr(article.url || "#")}" target="_blank" rel="noopener noreferrer">원문 열기</a>
        <button type="button" data-article-action="sentiment" data-article-index="${index}">감성 입력</button>
        <button type="button" data-article-action="track" data-article-index="${index}">추적 입력</button>
        <button type="button" data-article-action="sentiment-run" data-article-index="${index}">바로 감성분석</button>
      </div>
    </article>
  `).join("");
  return `
    ${engines}
    <div class="article-result-list">
      <strong>분석할 기사 선택</strong>
      ${articles || `<div class="empty">선택 가능한 기사 결과가 없습니다. 검색 엔진 링크에서 원문을 확인한 뒤 직접 입력할 수 있습니다.</div>`}
    </div>
  `;
}

function renderStockLookup(found, price, fundamentals, ticker) {
  const candidates = (found.results || []).slice(0, 8).map((stock, index) => `
    <span class="pill ${index === 0 ? "strong" : ""}">
      ${escapeHtml(stock.name || stock.ticker)} · ${escapeHtml(stock.ticker || stock.code)} · ${escapeHtml(stock.market || stock.market_name || "")}
    </span>
  `).join("");
  const latest = fundamentals.latest_close_krw ? formatWon(fundamentals.latest_close_krw) : fundamentals.latest_close;
  return `
    <strong>${escapeHtml(fundamentals.name)} (${escapeHtml(ticker)})</strong><br>
    최근 종가: ${escapeHtml(String(latest ?? "데이터 없음"))}<br>
    1개월 변화율: ${escapeHtml(String(fundamentals.one_month_change_percent ?? 0))}%<br>
    가격 데이터: ${price.prices.length}개
    ${candidates ? `<div class="candidate-list"><small>검색 후보</small><div>${candidates}</div></div>` : ""}
  `;
}

function formatMarketValue(value, currency) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "데이터 없음";
  if (currency === "KRW") return formatWon(amount);
  return `${amount.toLocaleString("ko-KR", { maximumFractionDigits: 2 })} ${currency || ""}`.trim();
}

function renderMarketPredictionResult(found, data, linkedSignal) {
  const candidates = (found.results || []).slice(0, 6).map((stock, index) => `
    <span class="pill ${index === 0 ? "strong" : ""}">
      ${escapeHtml(stock.name || stock.ticker)} · ${escapeHtml(stock.ticker || stock.code)} · ${escapeHtml(stock.market || stock.market_name || "")}
    </span>
  `).join("");
  const latest = data.prices?.at(-1);
  const forecast = data.forecast || [];
  const lastForecast = forecast.at(-1);
  const currency = data.display_currency || data.currency || "";
  const latestText = latest?.close_krw ? formatWon(latest.close_krw) : formatMarketValue(latest?.close, currency);
  const targetText = lastForecast?.close_krw ? formatWon(lastForecast.close_krw) : formatMarketValue(lastForecast?.close, currency);
  const change = Number(data.forecast_change_percent || 0);
  return `
    <strong>${escapeHtml(data.name)} (${escapeHtml(data.ticker)})</strong>
    <div class="prediction-summary">
      <div><span>최근 종가</span><strong>${escapeHtml(latestText)}</strong></div>
      <div><span>${escapeHtml(data.expected_horizon || "T+5")} 예상</span><strong>${escapeHtml(targetText)}</strong></div>
      <div><span>예측 변화율</span><strong>${change >= 0 ? "+" : ""}${change.toFixed(2)}%</strong></div>
      <div><span>신뢰도</span><strong>${Number(data.confidence || 0)}%</strong></div>
    </div>
    <div class="tool-notice good">차트와 신호 상세가 아래 패널에 반영됐습니다.${linkedSignal ? ` 선택 신호: ${escapeHtml(koText(linkedSignal.title || data.name))}` : ""}</div>
    ${candidates ? `<div class="candidate-list"><small>검색 후보</small><div>${candidates}</div></div>` : ""}
  `;
}

function selectedPredictionQuery() {
  const signal = state.selectedSignal;
  if (!signal) return "금융 경제 주식 비트코인 금리";
  const ticker = firstTickerInfo(signal);
  const prediction = signal.prediction_summary || {};
  const stock = koText(ticker?.name || ticker?.ticker || ticker?.code || "");
  const horizon = signal.expected_horizon === "예측시장" ? "" : signal.expected_horizon;
  return [...new Set([stock, prediction.direction, horizon, "주가 예측시장"].filter(Boolean))].join(" ");
}

function formatMarketPrice(market) {
  if (!Array.isArray(market.outcomePrices) || !market.outcomePrices.length) return "";
  const outcomes = Array.isArray(market.outcomes_ko) ? market.outcomes_ko : market.outcomes || [];
  return market.outcomePrices.slice(0, 3).map((price, index) => {
    const percent = Math.round(Number(price) * 100);
    if (!Number.isFinite(percent)) return "";
    return `${escapeHtml(outcomes[index] || `결과 ${index + 1}`)} ${percent}%`;
  }).filter(Boolean).join(" · ");
}

function renderPredictionMarkets(data) {
  const directMarkets = (data.markets || []).filter((market) => market.source !== "search-link");
  const notice = directMarkets.length
    ? `<div class="tool-notice good">선택 신호와 직접 관련된 예측시장 ${directMarkets.length}개</div>`
    : `<div class="tool-notice">${escapeHtml(data.fallback_reason || "선택 신호와 직접 관련된 외부 예측시장을 찾지 못했습니다. 관련 없는 검색 결과는 시각화에 반영하지 않습니다.")}</div>`;
  const cards = directMarkets.map((market) => {
    const price = formatMarketPrice(market);
    const volume = Number(market.volume || 0);
    const volumeText = volume > 0 ? `거래량 ${Math.round(volume).toLocaleString("ko-KR")}` : "직접 결과";
    const source = market.event_title_ko || market.event_title || market.source || data.source || "예측시장";
    return `
      <a class="prediction-market-card" href="${escapeAttr(market.url || "#")}" target="_blank" rel="noopener noreferrer">
        <strong>${escapeHtml(market.question_ko || market.question || "예측시장 검색")}</strong>
        <span>${escapeHtml(source)} · ${escapeHtml(volumeText)}</span>
        ${price ? `<small>${price}</small>` : ""}
        <em>${(market.tags_ko || []).slice(0, 4).map((tag) => `<b>${escapeHtml(tag)}</b>`).join("")}</em>
      </a>
    `;
  }).join("");
  return `${notice}<div class="prediction-market-list">${cards || "직접 연동 가능한 예측시장 결과가 없습니다. 검색 링크나 범용 시장은 시각화 분석에 사용하지 않습니다."}</div>`;
}

function summarizePredictionMarket(data) {
  const markets = (data.markets || []).filter((market) => market.source !== "search-link");
  const first = markets[0] || {};
  const prices = Array.isArray(first.outcomePrices) ? first.outcomePrices.map(Number).filter(Number.isFinite) : [];
  const probability = prices.length ? Math.round(Math.max(...prices) * 100) : null;
  return {
    direct: Boolean(data.direct_match && markets.length),
    matched: Boolean(data.direct_match && markets.length),
    source: data.source || "prediction-market",
    count: markets.length,
    question: first.question_ko || first.question || "",
    probability,
    label: markets.length ? `직접 ${markets.length}개` : "직접 매칭 없음"
  };
}

function signalMatchesMarketStock(signal, stock) {
  if (!stock) return true;
  const code = normalizeTicker(stock.ticker || stock.code);
  const name = normalizeStockText(stock.name);
  return (signal?.impact_tickers || []).some((ticker) =>
    normalizeTicker(ticker.ticker) === code ||
    normalizeTicker(ticker.code) === code ||
    normalizeStockText(ticker.name) === name
  );
}

function applyPredictionMarketToSelectedSignal(data) {
  if (!state.selectedSignal) return false;
  if (data.matched_stock && !signalMatchesMarketStock(state.selectedSignal, data.matched_stock)) return false;
  const summary = summarizePredictionMarket(data);
  state.selectedSignal.prediction_market_summary = summary;
  mergePredictionMarketChain(state.selectedSignal, summary);
  renderVisualFeed();
  renderDetail();
  return true;
}

function mergePredictionMarketChain(signal, summary) {
  const chain = Array.isArray(signal.transmission_chain) ? [...signal.transmission_chain] : [];
  const node = {
    node_name: "예측시장 검증",
    impact_type: summary.matched ? "보강" : "중립",
    logic: summary.matched
      ? `외부 예측시장 ${summary.count}개 직접 매칭${summary.probability ? `, 대표 확률 ${summary.probability}%` : ""}: ${summary.question || "관련 시장"}`
      : "선택 종목과 직접 관련된 외부 예측시장이 없어 관련 없는 검색 결과는 배제했습니다"
  };
  const index = chain.findIndex((item) => /예측시장/.test(String(item.node_name || "")));
  if (index >= 0) chain[index] = node;
  else chain.push(node);
  signal.transmission_chain = chain;
}

function applyStandalonePredictionMarketSignal(data) {
  if (!state.data || !data.matched_stock) return null;
  const stock = data.matched_stock;
  const summary = summarizePredictionMarket(data);
  const signalId = `pm_${normalizeTicker(stock.ticker || stock.code)}`;
  let signal = state.signals.find((item) => item.signal_id === signalId);
  if (!signal) {
    signal = {
      signal_id: signalId,
      title: `${stock.name}: 예측시장 ${summary.matched ? "직접 매칭" : "직접 매칭 없음"}`,
      summary: `${stock.name} 종목 기준으로 외부 예측시장을 검증했습니다. ${summary.matched ? `직접 관련 시장 ${summary.count}개를 찾았습니다.` : "직접 관련 시장을 찾지 못해 범용 검색 결과를 배제했습니다."}`,
      reasoning: summary.matched
        ? `대표 예측시장: ${summary.question || "관련 시장"}`
        : "종목명·종목코드 기준 필터를 통과한 외부 예측시장이 없습니다.",
      sentiment_score: 0,
      confidence: summary.matched ? 0.62 : 0.48,
      intensity: summary.matched ? 3 : 1,
      timeliness: 1,
      expectation_gap: summary.matched ? 0.35 : 0.1,
      expected_horizon: "예측시장",
      price_in_status: "예측시장 검증 결과",
      industry_tags: ["예측시장", "KRX"],
      impact_tickers: [{ ticker: stock.ticker, code: stock.code, name: stock.name, weight: 1 }],
      sources: [],
      transmission_chain: []
    };
    state.signals.unshift(signal);
    state.data.count = state.signals.length;
  }
  signal.prediction_market_summary = summary;
  mergePredictionMarketChain(signal, summary);
  state.selectedSignal = signal;
  state.selectedTicker = stock.ticker;
  syncToolInputsFromSelection(true);
  render();
  return signal;
}

function normalizeTicker(value) {
  return String(value || "").toUpperCase().replace(/\.(KS|KQ|KOSPI|KOSDAQ)$/i, "");
}

function signalMatchesPrediction(signal, prediction) {
  const code = normalizeTicker(prediction.ticker);
  const name = normalizeStockText(prediction.name);
  return (signal.impact_tickers || []).some((ticker) =>
    normalizeTicker(ticker.ticker) === code ||
    normalizeTicker(ticker.code) === code ||
    normalizeStockText(ticker.name) === name
  );
}

function normalizeStockText(value) {
  return String(value || "").replace(/\s+/g, "").toLowerCase();
}

function predictionDirection(change) {
  const value = Number(change) || 0;
  if (value > 0.35) return "상승";
  if (value < -0.35) return "하락";
  return "횡보";
}

function applyPredictionToSignal(data) {
  if (!state.data) return null;
  const direction = predictionDirection(data.forecast_change_percent);
  const tickerCode = normalizeTicker(data.ticker);
  const tickerInfo = { ticker: data.ticker, code: tickerCode, name: data.name, weight: 1 };
  const prediction = {
    direction,
    change_percent: Number(data.forecast_change_percent || 0),
    confidence: data.confidence,
    target_low: data.prediction?.target_low,
    target_high: data.prediction?.target_high,
    updated_at: new Date().toISOString()
  };

  state.data.charts = state.data.charts || {};
  state.data.charts[data.ticker] = {
    ticker: data.ticker,
    name: data.name,
    currency: data.currency || "KRW",
    display_currency: data.display_currency || data.currency || "KRW",
    prices: (data.prices || []).slice(-30),
    forecast: data.forecast || [],
    prediction: data.prediction || {},
    prediction_confidence: data.confidence,
    prediction_change_percent: prediction.change_percent,
    prediction_direction: direction,
    prediction_logic: data.method
  };

  let signal = state.selectedSignal && signalMatchesPrediction(state.selectedSignal, data)
    ? state.selectedSignal
    : state.signals.find((item) => signalMatchesPrediction(item, data));

  if (!signal) {
    signal = {
      signal_id: `predict_${tickerCode}`,
      title: `${data.name}: 시장 예측 ${direction}`,
      summary: `${data.name}의 실제 가격 데이터로 ${data.expected_horizon || "T+5"} 예측을 갱신했습니다. 예측 변화율은 ${prediction.change_percent.toFixed(2)}%입니다.`,
      reasoning: `시장 예측 도구 실행 결과를 신호 시각화에 반영했습니다. 방식: ${data.method}, 예측 신뢰도: ${data.confidence}%`,
      sentiment_score: clamp(prediction.change_percent / 10, -1, 1),
      confidence: clamp(Number(data.confidence || 0) / 100, 0, 1),
      intensity: Math.max(1, Math.min(5, Math.ceil(Math.abs(prediction.change_percent) / 2))),
      expectation_gap: clamp(Math.abs(prediction.change_percent) / 12, 0.05, 0.95),
      timeliness: 1,
      expected_horizon: data.expected_horizon || "T+5",
      price_in_status: "시장 예측 도구에서 실시간 반영",
      industry_tags: ["시장 예측"],
      impact_tickers: [tickerInfo],
      transmission_chain: []
    };
    state.signals.unshift(signal);
    state.data.count = state.signals.length;
  }

  signal.prediction_summary = prediction;
  signal.price_in_status = "시장 예측 도구와 동기화됨";
  signal.confidence = clamp(Math.max(Number(signal.confidence) || 0, Number(data.confidence || 0) / 100), 0, 1);
  signal.expectation_gap = clamp(Math.max(Number(signal.expectation_gap) || 0, Math.abs(prediction.change_percent) / 12), 0, 1);
  signal.expected_horizon = data.expected_horizon || signal.expected_horizon || "T+5";
  if (!signal.impact_tickers?.length) signal.impact_tickers = [tickerInfo];
  mergePredictionChain(signal, data, direction);
  state.selectedSignal = signal;
  state.selectedTicker = data.ticker;
  syncToolInputsFromSelection(true);
  render();
  return signal;
}

function mergePredictionChain(signal, data, direction) {
  const chain = Array.isArray(signal.transmission_chain) ? [...signal.transmission_chain] : [];
  const node = {
    node_name: "시장 예측",
    impact_type: direction === "상승" ? "상승" : direction === "하락" ? "하락" : "중립",
    logic: `${data.name} ${data.expected_horizon || "T+5"} 예측 ${Number(data.forecast_change_percent || 0).toFixed(2)}%, 신뢰도 ${data.confidence}%`
  };
  const index = chain.findIndex((item) => /시장 예측|가격·예측|예측/.test(String(item.node_name || "")));
  if (index >= 0) chain[index] = node;
  else chain.splice(Math.min(chain.length, 2), 0, node);
  signal.transmission_chain = chain;
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
      const q = document.querySelector("#polyQuery").value || selectedPredictionQuery();
      const data = await apiGet(`/api/polymarket/markets?limit=8&q=${encodeURIComponent(q)}`);
      setOutput("#polyOutput", renderPredictionMarkets(data));
      if (!applyPredictionMarketToSelectedSignal(data)) applyStandalonePredictionMarketSignal(data);
    }
    if (tool === "search") {
      const q = document.querySelector("#searchQuery").value || state.selectedSignal?.title || "금융 시장 뉴스";
      const data = await apiGet(`/api/search?q=${encodeURIComponent(q)}`);
      setOutput("#searchOutput", renderSearchResults(data));
    }
    if (tool === "stock") {
      const q = document.querySelector("#stockQuery").value || "삼성전자";
      const found = await apiGet(`/api/stock/search?q=${encodeURIComponent(q)}`);
      if (!found.results?.length) {
        setOutput("#stockOutput", `검색 결과가 없습니다: ${escapeHtml(q)}<br><small>종목명, 티커, 영문 회사명으로 다시 검색해보세요.</small>`);
        return;
      }
      const ticker = found.results[0]?.ticker || q;
      const [price, fundamentals] = await Promise.all([
        apiGet(`/api/stock/price?ticker=${encodeURIComponent(ticker)}&days=30`),
        apiGet(`/api/stock/fundamentals?ticker=${encodeURIComponent(ticker)}`)
      ]);
      setOutput("#stockOutput", renderStockLookup(found, price, fundamentals, ticker));
    }
    if (tool === "sentiment") {
      const text = document.querySelector("#sentimentText").value || articleInputText(state.selectedArticle) || state.selectedSignal?.summary || "";
      const data = await apiPost("/api/sentiment/analyze", { text });
      const matched = [
        data.matched_positive?.length ? `긍정: ${data.matched_positive.join(", ")}` : "",
        data.matched_negative?.length ? `부정: ${data.matched_negative.join(", ")}` : ""
      ].filter(Boolean).map(escapeHtml).join("<br>");
      setOutput("#sentimentOutput", `<strong>${escapeHtml(data.label_ko || koText(data.label))}</strong><br>감성 점수 ${data.score_percent ?? Math.round(Number(data.score || 0) * 100)} / 100<br>${escapeHtml(data.reason)}${matched ? `<br>${matched}` : ""}`);
    }
    if (tool === "predict") {
      const rawTicker = document.querySelector("#predictTicker").value || state.selectedTicker || "005930.KS";
      setOutput("#predictOutput", "종목을 찾고 예측 차트를 생성하는 중입니다.");
      let ticker = rawTicker;
      let found = { results: [] };
      try {
        found = await apiGet(`/api/stock/search?q=${encodeURIComponent(rawTicker)}`);
        if (!found.results?.length) {
          setOutput("#predictOutput", `검색 결과가 없습니다: ${escapeHtml(rawTicker)}<br><small>종목명, 티커, 영문 회사명으로 다시 입력해보세요.</small>`);
          return;
        }
        ticker = found.results?.[0]?.ticker || rawTicker;
      } catch {
        ticker = rawTicker;
      }
      const data = await apiGet(`/api/predict?ticker=${encodeURIComponent(ticker)}&days=5`);
      const linkedSignal = applyPredictionToSignal(data);
      setOutput("#predictOutput", renderMarketPredictionResult(found, data, linkedSignal));
    }
    if (tool === "track") {
      const newInfo = document.querySelector("#trackText").value || articleInputText(state.selectedArticle) || "새 정보 없음";
      const data = await apiPost("/api/signal/track", { signal: state.selectedSignal, newInfo });
      if (state.selectedSignal) state.selectedSignal.confidence = data.nextConfidence;
      const matched = [
        data.evidence?.matched_positive?.length ? `강화 근거 키워드: ${data.evidence.matched_positive.join(", ")}` : "",
        data.evidence?.matched_negative?.length ? `약화 근거 키워드: ${data.evidence.matched_negative.join(", ")}` : ""
      ].filter(Boolean).map(escapeHtml).join("<br>");
      const rationale = (data.rationale || []).map((line) => `<div>${escapeHtml(line)}</div>`).join("");
      setOutput("#trackOutput", `<strong>${escapeHtml(data.status)} · ${escapeHtml(data.directionAlignment || "방향 유지")}</strong><br>신뢰도 ${Math.round(data.oldConfidence * 100)}% → ${Math.round(data.nextConfidence * 100)}% (${Number(data.confidenceDelta || 0) >= 0 ? "+" : ""}${Math.round(Number(data.confidenceDelta || 0) * 100)}%p)<br>기존 방향 ${Math.round(Number(data.baseSentiment || 0) * 100)} / 새 근거 ${Math.round(Number(data.newEvidenceScore || 0) * 100)}<br>${rationale}${matched ? `<br>${matched}` : ""}`);
      renderVisualFeed();
      renderDetail();
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
    const outputMap = {
      polymarket: "#polyOutput",
      news: "#newsOutput",
      search: "#searchOutput",
      stock: "#stockOutput",
      sentiment: "#sentimentOutput",
      predict: "#predictOutput",
      track: "#trackOutput",
      visualize: "#visualOutput",
      report: "#reportOutput"
    };
    setOutput(outputMap[tool] || `#${tool}Output`, `오류: ${escapeHtml(error.message)}`);
  }
}

document.querySelectorAll("[data-tool]").forEach((button) => {
  button.addEventListener("click", () => runTool(button.dataset.tool));
});

$("#searchOutput")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-article-action]");
  if (!button) return;
  const article = state.articleSelections[Number(button.dataset.articleIndex)];
  if (!article) return;
  state.selectedArticle = article;
  const text = articleInputText(article);
  if (button.dataset.articleAction === "sentiment" || button.dataset.articleAction === "sentiment-run") {
    setHybridTextarea("#sentimentText", text);
    setOutput("#sentimentOutput", `<strong>기사 선택됨</strong><br>${escapeHtml(article.title || "")}<br>직접 문장을 더 입력한 뒤 감성 점수를 실행할 수 있습니다.`);
  }
  if (button.dataset.articleAction === "track") {
    setHybridTextarea("#trackText", text);
    setOutput("#trackOutput", `<strong>기사 선택됨</strong><br>${escapeHtml(article.title || "")}<br>직접 문장을 더 입력한 뒤 강화·약화 판정을 실행할 수 있습니다.`);
  }
  if (button.dataset.articleAction === "sentiment-run") runTool("sentiment");
});

[
  ["#polyQuery", "polymarket"],
  ["#searchQuery", "search"],
  ["#stockQuery", "stock"],
  ["#predictTicker", "predict"],
].forEach(([selector, tool]) => {
  const el = document.querySelector(selector);
  if (!el) return;
  el.addEventListener("input", () => { el.dataset.synced = "false"; });
  el.addEventListener("keydown", (e) => { if (e.key === "Enter") runTool(tool); });
});

checkApiHealth();
