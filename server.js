import http from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3245);
const CNY_TO_KRW = 218.59;
const DATA_DIR = path.join(__dirname, "data");
const SIGNAL_STORE = path.join(DATA_DIR, "signals.json");

const NEWS_SOURCES = {
  korean_market: "한국 금융시장",
  kospi: "코스피",
  kosdaq: "코스닥",
  semiconductor: "반도체",
  battery: "2차전지",
  ai_platform: "AI·플랫폼",
  fx_rate: "환율·금리",
  global: "글로벌 증시",
  cls: "중국 차이롄서",
  wallstreetcn: "중국 화얼제젠원",
  xueqiu: "중국 쉐치우",
  weibo: "중국 웨이보",
  zhihu: "중국 즈후",
  baidu: "중국 바이두",
  toutiao: "중국 터우탸오",
  thepaper: "중국 펑파이",
  "36kr": "중국 36Kr",
  hackernews: "Hacker News"
};

const STOCK_ALIASES = [
  { code: "005930", ticker: "005930.KS", name: "삼성전자", market: "KR", keywords: ["삼성", "samsung", "반도체"] },
  { code: "000660", ticker: "000660.KS", name: "SK하이닉스", market: "KR", keywords: ["하이닉스", "sk hynix", "hynix", "반도체"] },
  { code: "373220", ticker: "373220.KS", name: "LG에너지솔루션", market: "KR", keywords: ["lg에너지", "엘지에너지", "배터리", "2차전지"] },
  { code: "005380", ticker: "005380.KS", name: "현대차", market: "KR", keywords: ["현대", "hyundai", "자동차"] },
  { code: "035420", ticker: "035420.KS", name: "네이버", market: "KR", keywords: ["naver", "플랫폼", "ai"] },
  { code: "035720", ticker: "035720.KS", name: "카카오", market: "KR", keywords: ["kakao", "플랫폼"] },
  { code: "068270", ticker: "068270.KS", name: "셀트리온", market: "KR", keywords: ["celltrion", "바이오"] },
  { code: "105560", ticker: "105560.KS", name: "KB금융", market: "KR", keywords: ["kb", "은행", "금융"] },
  { code: "600745", ticker: "600745", name: "윙텍기술", market: "SH", keywords: ["wingtech", "闻泰", "윙텍"] },
  { code: "300274", ticker: "300274", name: "선그로우", market: "SZ", keywords: ["sungrow", "阳光电源", "선그로우"] },
  { code: "603516", ticker: "603516", name: "천중기술", market: "SH", keywords: ["淳中", "천중"] },
  { code: "601899", ticker: "601899", name: "쯔진광업", market: "SH", keywords: ["zijin", "紫金", "쯔진"] },
  { code: "601006", ticker: "601006", name: "다친철도", market: "SH", keywords: ["大秦", "다친"] },
  { code: "601333", ticker: "601333", name: "광선철도", market: "SH", keywords: ["广深", "광선"] },
  { code: "002342", ticker: "002342", name: "줄리삭구", market: "SZ", keywords: ["巨力", "줄리"] },
  { code: "AAPL", ticker: "AAPL", name: "애플", market: "US", keywords: ["apple", "애플"] },
  { code: "TSLA", ticker: "TSLA", name: "테슬라", market: "US", keywords: ["tesla", "테슬라"] }
];

function findStockByQuery(query) {
  const text = String(query || "").toLowerCase();
  return STOCK_ALIASES.find((stock) =>
    stock.name.toLowerCase() === text ||
    stock.code.toLowerCase() === text ||
    stock.ticker.toLowerCase() === text ||
    text.includes(stock.name.toLowerCase()) ||
    stock.keywords.some((kw) => text.includes(kw.toLowerCase()))
  ) || null;
}

await mkdir(DATA_DIR, { recursive: true });

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      await routeApi(req, res, url);
      return;
    }
    await serveStatic(res, url.pathname);
  } catch (error) {
    sendJson(res, 500, { error: "서버 오류", detail: error.message });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Finance dashboard listening on http://127.0.0.1:${PORT}`);
});

async function routeApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true, service: "finance-dashboard", time: new Date().toISOString() });
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/deepear/latest") {
    const data = await fetchJson("https://deepear.vercel.app/latest.json");
    sendJson(res, 200, data);
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/korea/dashboard") {
    sendJson(res, 200, await getKoreaDashboard());
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/news/hot") {
    const source = url.searchParams.get("source") || "korean_market";
    const count = Number(url.searchParams.get("count") || 10);
    const data = await getHotNews(source, count);
    sendJson(res, 200, data);
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/news/trends") {
    const sources = (url.searchParams.get("sources") || "korean_market,kospi,semiconductor,battery").split(",");
    const batches = await Promise.all(sources.map((source) => getHotNews(source.trim(), 8)));
    sendJson(res, 200, {
      generated_at: new Date().toISOString(),
      sources: batches,
      items: batches.flatMap((batch) => batch.items || [])
    });
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/polymarket/markets") {
    const limit = Number(url.searchParams.get("limit") || 12);
    const query = url.searchParams.get("q") || url.searchParams.get("query") || "finance economy stocks crypto IPO interest rates";
    const data = await getPolymarketFinanceMarkets(query, limit);
    sendJson(res, 200, data);
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/search") {
    const q = url.searchParams.get("q") || "";
    sendJson(res, 200, await makeKoreanSearchWithArticles(q));
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/stock/search") {
    const q = url.searchParams.get("q") || "";
    sendJson(res, 200, { query: q, results: searchStocks(q) });
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/stock/price") {
    const ticker = url.searchParams.get("ticker") || "005930.KS";
    const days = Number(url.searchParams.get("days") || 60);
    sendJson(res, 200, await getPrice(ticker, days));
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/stock/fundamentals") {
    const ticker = url.searchParams.get("ticker") || "005930.KS";
    sendJson(res, 200, await getFundamentals(ticker));
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/sentiment/analyze") {
    const body = await readBody(req);
    sendJson(res, 200, analyzeSentiment(body.text || ""));
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/predict") {
    const ticker = url.searchParams.get("ticker") || "005930.KS";
    const days = Number(url.searchParams.get("days") || 5);
    sendJson(res, 200, await forecastTicker(ticker, days));
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/signal/track") {
    const body = await readBody(req);
    sendJson(res, 200, await trackSignal(body));
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/visualize/chain") {
    const body = await readBody(req);
    sendJson(res, 200, visualizeChain(body.signal || body));
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/report/generate") {
    const body = await readBody(req);
    sendJson(res, 200, generateReport(body.signals || [], body.title || "금융 신호 리포트"));
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/translate") {
    const text = url.searchParams.get("text") || "";
    sendJson(res, 200, { text, translated: await translate(text) });
    return;
  }
  sendJson(res, 404, { error: "API를 찾을 수 없습니다." });
}

async function serveStatic(res, pathname) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(__dirname, safePath));
  if (!filePath.startsWith(__dirname)) {
    sendText(res, 403, "Forbidden");
    return;
  }
  const target = existsSync(filePath) ? filePath : path.join(__dirname, "index.html");
  const content = await readFile(target);
  const ext = path.extname(target).toLowerCase();
  const type = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml"
  }[ext] || "application/octet-stream";
  res.writeHead(200, { "content-type": type, "cache-control": "no-cache" });
  res.end(content);
}

async function getHotNews(source, count) {
  const korean = await getKoreanNews(source, count);
  if (korean.items.length) return korean;
  try {
    const raw = await fetchJson(`https://newsnow.busiyi.world/api/s?id=${encodeURIComponent(source)}`);
    const items = (raw.items || []).slice(0, count).map((item, index) => ({
      id: item.id || `${source}_${index}`,
      source,
      source_name: NEWS_SOURCES[source] || source,
      rank: index + 1,
      title: item.title || "",
      title_ko: item.title || "",
      url: item.url || "",
      published_at: item.publish_time || null,
      meta: item.extra || {}
    }));
    return { source, source_name: NEWS_SOURCES[source] || source, count: items.length, items };
  } catch {
    return getGdeltNews(source, count);
  }
}

async function getKoreaDashboard() {
  const charts = {};
  const newsBatches = await Promise.allSettled([
    getKoreanNews("korean_market", 18),
    getKoreanNews("semiconductor", 12),
    getKoreanNews("battery", 10),
    getKoreanNews("ai_platform", 10),
    getKoreanNews("fx_rate", 8)
  ]);
  const newsItems = dedupeNewsItems(newsBatches.flatMap((result) => result.status === "fulfilled" ? result.value.items || [] : []));
  const stockNewsMap = mapNewsToStocks(newsItems, STOCK_ALIASES.filter((stock) => stock.market === "KR"));
  const signalResults = await Promise.allSettled(
    [...stockNewsMap.entries()].map(([stock, items]) => buildSignalFromRealData(stock, items, charts))
  );
  const signals = signalResults
    .filter((result) => result.status === "fulfilled" && result.value)
    .map((result) => result.value)
    .sort((a, b) => (b.confidence * b.intensity) - (a.confidence * a.intensity));

  return {
    generated_at: new Date().toISOString(),
    count: signals.length,
    locale: "ko-KR",
    base_market: "KR",
    workflow: buildWorkflow(newsItems, stockNewsMap, signals, charts),
    analyzed_sources: [
      `한국어 뉴스 ${newsItems.length}건`,
      `뉴스에서 감지된 국내 종목 ${stockNewsMap.size}개`,
      `실제 가격·예측 생성 종목 ${Object.keys(charts).length}개`
    ],
    signals,
    charts
  };
}

async function buildSignalFromRealData(stock, newsItems, charts) {
  const forecast = await forecastTicker(stock.ticker, 5);
  if (!forecast?.prices?.length || !forecast?.forecast?.length) return null;
  const prices = forecast.prices.slice(-30).map((point) => ({
    ...point,
    close_krw: point.close_krw ?? (forecast.currency === "KRW" ? Math.round(Number(point.close)) : null)
  }));
  const priceChange = priceChangePercent(prices);
  const forecastChange = forecast.forecast_change_percent ?? priceChangePercent([prices.at(-1), forecast.forecast.at(-1)]);
  const articleText = newsItems.map((item) => `${item.title || ""} ${item.description || ""}`).join("\n");
  const articleSentiment = analyzeSentiment(articleText);
  const forecastDirection = clamp(forecastChange / 8, -1, 1);
  const sentiment = clamp((articleSentiment.score * 0.45) + (forecastDirection * 0.55), -1, 1);
  const directionLabel = forecastChange > 0.35 ? "상승" : forecastChange < -0.35 ? "하락" : "횡보";
  const confidence = clamp((forecast.confidence / 100) * 0.7 + Math.min(newsItems.length / 8, 1) * 0.2 + Math.min(Math.abs(forecastChange) / 10, 0.1), 0.2, 0.92);
  const intensity = Math.max(1, Math.min(5, Math.ceil(Math.abs(forecastChange) / 1.8) + Math.min(newsItems.length, 2)));
  const expectationGap = clamp(Math.abs(forecastChange - priceChange) / 10, 0.05, 0.95);
  const timeliness = latestNewsTimeliness(newsItems);
  const mainSource = newsItems[0];
  const impactType = sentiment > 0.08 ? "호재" : sentiment < -0.08 ? "악재" : "중립";
  const prediction = {
    target_low: forecast.prediction?.target_low ?? Number(Math.min(0, forecastChange).toFixed(2)),
    target_high: forecast.prediction?.target_high ?? Number(Math.max(0, forecastChange).toFixed(2))
  };

  charts[stock.ticker] = {
    ticker: forecast.ticker,
    name: forecast.name,
    currency: forecast.currency || "KRW",
    display_currency: "KRW",
    prices,
    forecast: forecast.forecast,
    prediction,
    prediction_confidence: forecast.confidence,
    prediction_change_percent: Number(forecastChange.toFixed(2)),
    prediction_direction: directionLabel,
    prediction_logic: forecast.method
  };

  return {
    signal_id: `kr_${stock.code}_${stableSignalId(mainSource?.url || mainSource?.title || stock.ticker)}`,
    title: `${stock.name}: 실제 뉴스 ${newsItems.length}건과 ${forecast.expected_horizon || "T+5"} 예측 ${directionLabel}`,
    summary: `${stock.name} 관련 한국어 뉴스 ${newsItems.length}건과 실제 가격 데이터를 결합했습니다. 최근 1개월 변화율은 ${priceChange.toFixed(2)}%, 예측 변화율은 ${forecastChange.toFixed(2)}%입니다.`,
    reasoning: `주요 기사: ${mainSource?.title || "기사 제목 없음"} / 예측 방식: ${forecast.method} / 예측 신뢰도: ${forecast.confidence}% / 기사 감성 점수: ${articleSentiment.score}`,
    sentiment_score: Number(sentiment.toFixed(2)),
    confidence: Number(confidence.toFixed(2)),
    intensity,
    expectation_gap: Number(expectationGap.toFixed(2)),
    timeliness: Number(timeliness.toFixed(2)),
    expected_horizon: forecast.expected_horizon || "T+5",
    price_in_status: "실제 가격·실제 뉴스 기반",
    prediction_summary: {
      direction: directionLabel,
      change_percent: Number(forecastChange.toFixed(2)),
      confidence: forecast.confidence,
      target_low: prediction.target_low,
      target_high: prediction.target_high
    },
    industry_tags: stockTags(stock),
    impact_tickers: [{ ticker: stock.ticker, code: stock.code, name: stock.name, weight: 1 }],
    transmission_chain: [
      { node_name: "한국어 기사", impact_type: impactType, logic: mainSource?.title || "실제 기사 없음" },
      { node_name: "기사 감성", impact_type: articleSentiment.label_ko, logic: articleSentiment.reason },
      { node_name: "가격·예측", impact_type: directionLabel === "상승" ? "중립·강세" : directionLabel === "하락" ? "중립·약세" : "중립", logic: `1개월 ${priceChange.toFixed(2)}%, 예측 ${forecastChange.toFixed(2)}%` },
      { node_name: "영향 종목", impact_type: impactType, logic: `${stock.name} (${stock.ticker})` }
    ],
    sources: newsItems.slice(0, 3).map((item) => ({ source_name: item.source_name, title: item.title, url: item.url, published_at: item.published_at })),
    search_results: makeKoreanSearch(`${stock.name} ${stockNewsKeyword(stock)} 뉴스`).engines
  };
}

function dedupeNewsItems(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item.url || item.title;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mapNewsToStocks(items, stocks) {
  const map = new Map();
  for (const item of items) {
    const text = `${item.title || ""} ${item.description || ""}`.toLowerCase();
    for (const stock of stocks) {
      const terms = [stock.name, stock.code, stock.ticker, ...stock.keywords].map((term) => String(term).toLowerCase());
      if (!terms.some((term) => text.includes(term))) continue;
      if (!map.has(stock)) map.set(stock, []);
      map.get(stock).push(item);
    }
  }
  return new Map([...map.entries()].filter(([, matchedItems]) => matchedItems.length > 0));
}

function buildWorkflow(newsItems, stockNewsMap, signals, charts) {
  return [
    {
      id: "news",
      label: "한국어 뉴스 수집",
      detail: `RSS에서 실제 기사 ${newsItems.length}건 수집`,
      progress: newsItems.length ? 100 : 0
    },
    {
      id: "detect",
      label: "종목 감지",
      detail: `기사에서 국내 종목 ${stockNewsMap.size}개 감지`,
      progress: stockNewsMap.size ? 100 : 0
    },
    {
      id: "forecast",
      label: "가격·예측 계산",
      detail: `실제 가격 기반 예측 ${Object.keys(charts).length}개 생성`,
      progress: Object.keys(charts).length ? 100 : 0
    },
    {
      id: "score",
      label: "ISQ 신호 점수화",
      detail: `뉴스 감성, 예측 방향, 신뢰도 결합 신호 ${signals.length}개`,
      progress: signals.length ? 100 : 0
    },
    {
      id: "visualize",
      label: "시각화 연결",
      detail: "신호 카드가 예측 변화율·예측 신뢰도·전달 체인을 직접 사용",
      progress: signals.length && Object.keys(charts).length ? 100 : 0
    }
  ];
}

function stableSignalId(value) {
  let hash = 0;
  for (const char of String(value || "")) {
    hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function priceChangePercent(points) {
  const values = (points || []).map((point) => Number(point?.close)).filter(Number.isFinite);
  const first = values[0];
  const last = values.at(-1);
  if (!first || !last) return 0;
  return ((last - first) / first) * 100;
}

function latestNewsTimeliness(items) {
  const latest = Math.max(...items.map((item) => new Date(item.published_at || 0).getTime()).filter(Number.isFinite));
  if (!Number.isFinite(latest) || latest <= 0) return 0.5;
  const ageHours = Math.max(0, (Date.now() - latest) / 3600000);
  return clamp(1 - ageHours / (24 * 7), 0.2, 1);
}

function stockTags(stock) {
  const byCode = {
    "005930": ["반도체", "대형주", "코스피"],
    "000660": ["반도체", "AI 메모리", "코스피"],
    "373220": ["2차전지", "배터리", "코스피"],
    "005380": ["자동차", "수출", "코스피"],
    "035420": ["플랫폼", "AI", "코스피"],
    "035720": ["플랫폼", "콘텐츠", "코스피"]
  };
  return byCode[stock.code] || [stock.market === "KR" ? "국내주식" : "글로벌", stock.market];
}

function stockNewsKeyword(stock) {
  const tags = stockTags(stock);
  return tags[0] || "금융시장";
}

function topicParticle(value) {
  const text = String(value || "");
  const last = text.charCodeAt(text.length - 1);
  if (last < 0xac00 || last > 0xd7a3) return "는";
  return (last - 0xac00) % 28 === 0 ? "는" : "은";
}

function buildForecastFromPrices(prices, currency) {
  const closes = prices.map((point) => Number(point.close)).filter(Number.isFinite);
  const last = closes.at(-1);
  const prev = closes.at(-6) || closes[0] || last;
  const dailyMomentum = last && prev ? ((last - prev) / prev) / 5 : 0;
  return Array.from({ length: 5 }, (_, index) => {
    const close = last * (1 + dailyMomentum * (index + 1));
    return {
      date: new Date(Date.now() + (index + 1) * 86400000).toISOString().slice(0, 10),
      close: Number(close.toFixed(2)),
      close_krw: currency === "KRW" ? Math.round(close) : null
    };
  });
}

async function getKoreanNews(source, count) {
  const queryBySource = {
    korean_market: "한국 금융시장 증시 뉴스",
    kospi: "코스피 증시 뉴스",
    kosdaq: "코스닥 증시 뉴스",
    semiconductor: "삼성전자 SK하이닉스 반도체 뉴스",
    battery: "LG에너지솔루션 2차전지 배터리 뉴스",
    ai_platform: "네이버 카카오 AI 플랫폼 뉴스",
    fx_rate: "환율 금리 한국 금융시장 뉴스",
    global: "글로벌 증시 한국 투자 뉴스",
    cls: "중국 증시 금융 뉴스",
    wallstreetcn: "글로벌 금융 시장 증시 뉴스",
    xueqiu: "주식 시장 투자 뉴스",
    weibo: "기술주 금융 시장 뉴스",
    zhihu: "경제 금융 산업 뉴스",
    baidu: "중국 경제 증시 뉴스",
    toutiao: "아시아 금융 시장 뉴스",
    thepaper: "중국 경제 정책 뉴스",
    "36kr": "스타트업 기술주 투자 뉴스",
    hackernews: "AI 기술 스타트업 투자 뉴스"
  };
  const query = queryBySource[source] || "금융 시장 증시 뉴스";
  try {
    const rss = await fetchText(`https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR:ko`);
    const items = parseGoogleNewsRss(rss).slice(0, count).map((item, index) => ({
      id: item.link || `${source}_${index}`,
      source: "google-news-kr",
      source_name: "구글 뉴스 한국",
      rank: index + 1,
      title: item.title,
      title_ko: item.title,
      url: item.link,
      published_at: item.pubDate,
      meta: { query, origin: NEWS_SOURCES[source] || source }
    }));
    return { source: "google-news-kr", source_name: "한국어 기사", query, count: items.length, items };
  } catch {
    return { source: "google-news-kr", source_name: "한국어 기사", query, count: 0, items: [] };
  }
}

async function getGdeltNews(source, count) {
  const queryBySource = {
    wallstreetcn: "finance market stock",
    xueqiu: "stock market",
    weibo: "technology finance",
    cls: "china finance"
  };
  const query = queryBySource[source] || "finance market";
  try {
    const raw = await fetchJson(`https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=artlist&format=json&maxrecords=${count}&sort=hybridrel`);
    const items = (raw.articles || []).slice(0, count).map((item, index) => ({
      id: item.url || `${source}_${index}`,
      source: "gdelt",
      source_name: "GDELT 글로벌 뉴스",
      rank: index + 1,
      title: item.title || "",
      title_ko: item.title || "",
      url: item.url || "",
      published_at: item.seendate || null,
      meta: { domain: item.domain, language: item.language }
    }));
    return { source: "gdelt", source_name: "GDELT 글로벌 뉴스", count: items.length, items };
  } catch {
    const search = makeKoreanSearch(query);
    const items = search.engines.slice(0, count).map((engine, index) => ({
      id: engine.url,
      source: "korean-search",
      source_name: engine.name,
      rank: index + 1,
      title: `${query} - ${engine.name}에서 최신 기사 보기`,
      title_ko: `${query} - ${engine.name}에서 최신 기사 보기`,
      url: engine.url,
      published_at: new Date().toISOString(),
      meta: {}
    }));
    return { source: "korean-search", source_name: "한국어 뉴스 검색", count: items.length, items };
  }
}

async function mapPolymarket(market) {
  const outcomes = parseMaybeJson(market.outcomes);
  const tags = market.event?.tags || [];
  const [questionKo, eventTitleKo, outcomesKo] = await Promise.all([
    translateWithFallback(market.question || ""),
    market.event?.title ? translateWithFallback(market.event.title) : Promise.resolve(""),
    Array.isArray(outcomes) ? Promise.all(outcomes.map((outcome) => translateOutcome(outcome))) : Promise.resolve(outcomes)
  ]);
  return {
    id: market.id,
    question: market.question,
    question_ko: questionKo,
    slug: market.slug,
    event_title: market.event?.title || "",
    event_title_ko: eventTitleKo,
    tags: tags.map((tag) => tag.slug || tag.label).filter(Boolean),
    tags_ko: tags.map((tag) => translatePolymarketTag(tag.slug || tag.label)).filter(Boolean),
    outcomes,
    outcomes_ko: outcomesKo,
    outcomePrices: parseMaybeJson(market.outcomePrices),
    volume: Number(market.volume || 0),
    liquidity: Number(market.liquidity || 0),
    url: market.event?.slug ? `https://polymarket.com/event/${market.event.slug}` : market.slug ? `https://polymarket.com/event/${market.slug}` : "https://polymarket.com"
  };
}

function translatePolymarketTag(tag) {
  const value = String(tag || "").toLowerCase();
  const map = {
    finance: "금융",
    economy: "경제",
    business: "비즈니스",
    crypto: "가상자산",
    stocks: "주식",
    ipos: "IPO",
    tech: "기술",
    exchange: "거래소"
  };
  return map[value] || "";
}

async function getPolymarketFinanceMarkets(query, limit) {
  const matchedStock = findStockByQuery(query);
  const isStockQuery = Boolean(matchedStock);
  const normalizedQuery = normalizePolymarketQuery(query);
  const strictTerms = strictPolymarketTerms(query);
  const events = await fetchJson("https://gamma-api.polymarket.com/events?active=true&closed=false&limit=160");
  const candidates = events
    .map((event) => ({ event, score: scorePolymarketEvent(event, normalizedQuery, strictTerms) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || Number(b.event.volume || 0) - Number(a.event.volume || 0));

  const markets = [];
  for (const { event } of candidates) {
    for (const market of event.markets || []) {
      if (markets.length >= limit) break;
      if (market.closed || market.active === false) continue;
      markets.push(await mapPolymarket({ ...market, event }));
    }
    if (markets.length >= limit) break;
  }

  if (markets.length === 0) {
    const manifoldTerm = matchedStock
      ? (matchedStock.keywords.find((kw) => /^[a-z]/i.test(kw)) || matchedStock.name)
      : (strictTerms.length > 0 ? [...strictTerms].sort((a, b) => b.length - a.length)[0] : query);
    const fallback = shouldUseManifoldFallback(strictTerms, matchedStock)
      ? await getMetaculusFallback(manifoldTerm, strictTerms, limit)
      : [];
    const fallbackReason = matchedStock
      ? `폴리마켓에 ${matchedStock.name} 종목의 직접 예측시장이 없어 예측시장 검색 링크를 제공합니다`
      : fallback.length
        ? `폴리마켓 직접 결과가 부족해 Manifold Markets의 관련 예측시장을 함께 표시합니다`
        : `폴리마켓에 직접 매칭되는 금융 예측시장이 없어 예측시장 검색 링크를 제공합니다`;
    return {
      query,
      normalized_query: normalizedQuery,
      strict_terms: strictTerms,
      source: fallback.length ? "manifold-fallback" : "prediction-search-links",
      fallback: true,
      fallback_reason: fallbackReason,
      count: fallback.length || Math.min(limit, predictionSearchLinks(query, matchedStock).length),
      markets: fallback.length ? fallback : predictionSearchLinks(query, matchedStock).slice(0, limit)
    };
  }

  return {
    query,
    normalized_query: normalizedQuery,
    strict_terms: strictTerms,
    source: "polymarket-events-finance-filter",
    fallback: false,
    count: markets.length,
    markets
  };
}

function shouldUseManifoldFallback(strictTerms, matchedStock) {
  if (matchedStock) return false;
  const usefulTerms = new Set(["bitcoin", "btc", "ethereum", "eth", "ipo", "listing", "kraken", "microstrategy", "nasdaq"]);
  return strictTerms.some((term) => usefulTerms.has(term));
}

function predictionSearchLinks(query, matchedStock) {
  const search = matchedStock
    ? `${matchedStock.name} ${matchedStock.keywords.find((kw) => /^[a-z]/i.test(kw)) || matchedStock.ticker} stock forecast`
    : normalizePolymarketQuery(query);
  const encoded = encodeURIComponent(search);
  return [
    {
      id: "polymarket-search",
      question: `Polymarket에서 "${search}" 검색`,
      question_ko: `폴리마켓에서 "${search}" 검색`,
      event_title: "Polymarket",
      event_title_ko: "폴리마켓",
      tags: ["search", "prediction-market"],
      tags_ko: ["예측시장", "직접검색"],
      outcomes: ["Open"],
      outcomes_ko: ["열기"],
      outcomePrices: null,
      volume: 0,
      liquidity: 0,
      url: `https://polymarket.com/search?query=${encoded}`,
      source: "search-link"
    },
    {
      id: "manifold-search",
      question: `Manifold Markets에서 "${search}" 검색`,
      question_ko: `매니폴드 마켓에서 "${search}" 검색`,
      event_title: "Manifold Markets",
      event_title_ko: "매니폴드 마켓",
      tags: ["search", "prediction-market"],
      tags_ko: ["예측시장", "직접검색"],
      outcomes: ["Open"],
      outcomes_ko: ["열기"],
      outcomePrices: null,
      volume: 0,
      liquidity: 0,
      url: `https://manifold.markets/search?term=${encoded}`,
      source: "search-link"
    },
    {
      id: "metaculus-search",
      question: `Metaculus에서 "${search}" 검색`,
      question_ko: `메타큘러스에서 "${search}" 검색`,
      event_title: "Metaculus",
      event_title_ko: "메타큘러스",
      tags: ["search", "forecasting"],
      tags_ko: ["예측", "직접검색"],
      outcomes: ["Open"],
      outcomes_ko: ["열기"],
      outcomePrices: null,
      volume: 0,
      liquidity: 0,
      url: `https://www.metaculus.com/questions/?search=${encoded}`,
      source: "search-link"
    },
    {
      id: "kalshi-search",
      question: `Kalshi에서 "${search}" 검색`,
      question_ko: `칼시에서 "${search}" 검색`,
      event_title: "Kalshi",
      event_title_ko: "칼시",
      tags: ["search", "prediction-market"],
      tags_ko: ["예측시장", "직접검색"],
      outcomes: ["Open"],
      outcomes_ko: ["열기"],
      outcomePrices: null,
      volume: 0,
      liquidity: 0,
      url: `https://kalshi.com/markets?search=${encoded}`,
      source: "search-link"
    }
  ];
}

async function getMetaculusFallback(searchTerm, strictTerms, limit) {
  try {
    const url = `https://api.manifold.markets/v0/search-markets?term=${encodeURIComponent(searchTerm)}&limit=${limit}`;
    const raw = await fetchJson(url);
    const items = (Array.isArray(raw) ? raw : [])
      .filter((item) => scoreFallbackPrediction(item, strictTerms) > 0)
      .slice(0, limit);
    return await Promise.all(items.map(async (item) => ({
      id: `manifold-${item.id}`,
      question: item.question,
      question_ko: await translateWithFallback(item.question || ""),
      event_title: "Manifold Markets",
      event_title_ko: "매니폴드 마켓",
      tags: ["forecast", "prediction"],
      tags_ko: ["예측", "전망"],
      outcomes: ["Yes", "No"],
      outcomes_ko: ["예", "아니오"],
      outcomePrices: item.probability != null ? [String(Math.round(item.probability * 100) / 100), String(Math.round((1 - item.probability) * 100) / 100)] : null,
      volume: Number(item.volume || 0),
      liquidity: Number(item.totalLiquidity || 0),
      url: item.url || "https://manifold.markets",
      source: "manifold"
    })));
  } catch {
    return [];
  }
}

function scoreFallbackPrediction(item, strictTerms) {
  const haystack = [
    item.question,
    item.description,
    item.textDescription,
    item.url,
    ...(item.tags || [])
  ].join(" ").toLowerCase();
  if (/milky way|galaxy|album|gta|nba|nhl|movie|music|celebrity|sport|football|baseball/.test(haystack)) return 0;
  if (strictTerms?.length && !strictTerms.some((term) => hasSearchTerm(haystack, term))) return 0;
  return Number(item.volume || 0) > 0 ? 1 : 0;
}

function normalizePolymarketQuery(query) {
  const matchedStock = findStockByQuery(query);
  if (matchedStock) {
    const terms = [matchedStock.name, ...matchedStock.keywords].join(" ");
    return `${terms} stock equity market forecast prediction`;
  }
  const text = String(query || "").toLowerCase();
  const pairs = [
    ["금리", "interest rates fed rates"],
    ["연준", "fed interest rates"],
    ["인플레이션", "inflation cpi"],
    ["물가", "inflation cpi"],
    ["비트코인", "bitcoin btc crypto"],
    ["이더리움", "ethereum eth crypto"],
    ["가상자산", "crypto bitcoin ethereum"],
    ["암호화폐", "crypto bitcoin ethereum"],
    ["주식", "stocks equity market"],
    ["증시", "stocks market"],
    ["나스닥", "nasdaq stocks"],
    ["s&p", "s&p stocks"],
    ["ipo", "ipo listing stocks"],
    ["상장", "ipo listing"],
    ["달러", "dollar usd"],
    ["환율", "dollar usd fx"],
    ["유가", "oil crude"],
    ["금값", "gold"],
    ["경제", "economy business finance"],
    ["금융", "finance economy business"]
  ];
  const additions = pairs.filter(([ko]) => text.includes(ko)).map(([, en]) => en);
  const base = additions.length ? additions.join(" ") : text;
  return `${base} finance economy business stocks crypto ipo market fed inflation rates`.trim();
}

function strictPolymarketTerms(query) {
  const matchedStock = findStockByQuery(query);
  if (matchedStock) {
    return matchedStock.keywords.filter((kw) => /^[a-z]/i.test(kw));
  }
  const text = String(query || "").toLowerCase();
  const groups = [];
  if (/금리|연준|fed|rate|rates|interest|fomc/.test(text)) groups.push("fed", "rate", "rates", "interest", "fomc");
  if (/인플레이션|물가|inflation|cpi/.test(text)) groups.push("inflation", "cpi");
  if (/비트코인|btc|bitcoin/.test(text)) groups.push("bitcoin", "btc", "microstrategy");
  if (/이더리움|eth|ethereum/.test(text)) groups.push("ethereum", "eth");
  if (/ipo|상장|listing|크라켄|kraken/.test(text)) groups.push("ipo", "listing", "kraken");
  if (/주식|증시|나스닥|stock|stocks|nasdaq|s&p/.test(text)) groups.push("stock", "stocks", "nasdaq", "equity", "microstrategy");
  return [...new Set(groups)];
}

function scorePolymarketEvent(event, normalizedQuery, strictTerms = []) {
  const financeTags = new Set(["finance", "economy", "business", "crypto", "stocks", "ipos", "tech", "exchange"]);
  const badTags = new Set(["sports", "music", "culture", "pop-culture", "movies", "celebrities", "nba", "nhl", "nfl"]);
  const tags = (event.tags || []).map((tag) => String(tag.slug || tag.label || "").toLowerCase());
  if (tags.some((tag) => badTags.has(tag))) return 0;

  let score = tags.reduce((sum, tag) => sum + (financeTags.has(tag) ? 5 : 0), 0);
  const haystack = [
    event.title,
    event.description,
    event.ticker,
    event.slug,
    ...tags,
    ...(event.markets || []).map((market) => market.question)
  ].join(" ").toLowerCase();
  if (strictTerms.length && !strictTerms.some((term) => hasSearchTerm(haystack, term))) return 0;
  const tokens = normalizedQuery.split(/\s+/).filter((token) => token.length > 2);
  score += tokens.reduce((sum, token) => sum + (hasSearchTerm(haystack, token) ? 2 : 0), 0);
  if (/gta|album|stanley cup|nba finals|pregnant|prison|movie|music|sports event/i.test(haystack)) score -= 20;
  return score;
}

function hasSearchTerm(haystack, term) {
  const escaped = String(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(haystack);
}

function makeKoreanSearch(q) {
  const query = q.trim() || "금융 시장 뉴스";
  const encoded = encodeURIComponent(query);
  return {
    query,
    engines: [
      { name: "네이버 뉴스", url: `https://search.naver.com/search.naver?where=news&query=${encoded}` },
      { name: "구글 뉴스 한국", url: `https://news.google.com/search?q=${encoded}&hl=ko&gl=KR&ceid=KR:ko` },
      { name: "다음 뉴스", url: `https://search.daum.net/search?w=news&q=${encoded}` },
      { name: "빙 뉴스 한국어", url: `https://www.bing.com/news/search?q=${encoded}&setlang=ko-KR` }
    ]
  };
}

async function makeKoreanSearchWithArticles(q) {
  const base = makeKoreanSearch(q);
  const articles = await getKoreanArticlesForQuery(base.query, 8);
  return { ...base, articles };
}

async function getKoreanArticlesForQuery(query, count) {
  try {
    const rss = await fetchText(`https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR:ko`);
    return parseGoogleNewsRss(rss).slice(0, count).map((item, index) => ({
      id: item.link || `article_${index}`,
      source: "google-news-kr",
      source_name: "구글 뉴스 한국",
      rank: index + 1,
      title: item.title,
      url: item.link,
      published_at: item.pubDate,
      snippet: item.description || ""
    }));
  } catch {
    return [];
  }
}

function searchStocks(q) {
  const query = q.toLowerCase().trim();
  if (!query) return STOCK_ALIASES.filter((stock) => stock.market === "KR");
  const normalizedQuery = query.replace(/^(cn:|us:|global:)/, "").trim();
  return STOCK_ALIASES.filter((stock) =>
    [stock.code, stock.ticker, stock.name, stock.market, ...stock.keywords]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery)
  );
}

async function getPrice(ticker, days = 60) {
  let known = STOCK_ALIASES.find((stock) => stock.ticker === ticker || stock.code === ticker);
  if (!known) {
    const byName = findStockByQuery(ticker);
    if (byName) { known = byName; ticker = byName.ticker; }
  }
  if (known && (known.market === "KR" || known.market === "US")) {
    ticker = known.ticker;
  }
  if (!known && /[가-힯一-鿿]/.test(String(ticker))) {
    const names = STOCK_ALIASES.map((s) => s.name).join(", ");
    throw new Error(`'${ticker}'은(는) 지원되지 않는 종목입니다. 지원 종목: ${names}`);
  }
  const deepear = await getDeepEarChart(ticker, known);
  if (deepear) return deepear;
  if (known?.market === "US" || known?.market === "KR") return getYahooPrice(ticker, days, known);
  try {
    return await getEastMoneyPrice(ticker, days, known);
  } catch {
    const suffix = String(ticker).startsWith("6") ? ".SS" : ".SZ";
    return getYahooPrice(`${String(ticker).replace(/\.(SH|SZ)$/i, "")}${suffix}`, days, known);
  }
}

async function getDeepEarChart(ticker, known) {
  try {
    const raw = await fetchJson("https://deepear.vercel.app/latest.json");
    const code = String(ticker).replace(/\.(SH|SZ|SS)$/i, "");
    const chart = raw.charts?.[code];
    if (!chart) return null;
    return {
      ticker: chart.ticker,
      name: known?.name || chart.name,
      currency: "CNY",
      display_currency: "KRW",
      cny_to_krw: CNY_TO_KRW,
      prices: (chart.prices || []).map((point) => ({ ...point, close_krw: Math.round(Number(point.close) * CNY_TO_KRW) })),
      forecast: (chart.forecast || []).map((point) => ({ ...point, close_krw: Math.round(Number(point.close) * CNY_TO_KRW) })),
      prediction: chart.prediction,
      source: "DeepEar Lite"
    };
  } catch {
    return null;
  }
}

async function getEastMoneyPrice(ticker, days, known) {
  const code = String(ticker).replace(/\.(SH|SZ|HK)$/i, "");
  const secid = code.length === 5 ? `116.${code}` : code.startsWith("6") ? `1.${code}` : `0.${code}`;
  const end = ymd(new Date());
  const startDate = new Date(Date.now() - days * 2 * 86400000);
  const start = ymd(startDate);
  const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=101&fqt=1&beg=${start}&end=${end}&lmt=${days}&ut=fa5fd1943c7b386f172d6893dbfba10b`;
  const raw = await fetchJson(url);
  const rows = raw?.data?.klines || [];
  const prices = rows.map((row) => {
    const [date, open, close, high, low, volume] = row.split(",");
    return {
      date,
      open: Number(open),
      high: Number(high),
      low: Number(low),
      close: Number(close),
      volume: Number(volume),
      close_krw: Math.round(Number(close) * CNY_TO_KRW)
    };
  });
  return { ticker: code, name: known?.name || code, currency: "CNY", display_currency: "KRW", cny_to_krw: CNY_TO_KRW, prices };
}

async function getYahooPrice(ticker, days, known) {
  const raw = await fetchJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${Math.max(days, 5)}d&interval=1d`);
  const result = raw.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0] || {};
  const timestamps = result?.timestamp || [];
  const currency = result?.meta?.currency || "USD";
  const prices = timestamps.map((ts, index) => ({
    date: new Date(ts * 1000).toISOString().slice(0, 10),
    open: quote.open?.[index],
    high: quote.high?.[index],
    low: quote.low?.[index],
    close: quote.close?.[index],
    volume: quote.volume?.[index],
    close_krw: currency === "KRW" ? Math.round(Number(quote.close?.[index])) : null
  })).filter((point) => Number.isFinite(point.close));
  return { ticker, name: known?.name || ticker, currency, display_currency: currency, prices };
}

async function getFundamentals(ticker) {
  const price = await getPrice(ticker, 30);
  const latest = price.prices.at(-1);
  const first = price.prices[0];
  const change = first && latest ? ((latest.close - first.close) / first.close) * 100 : 0;
  return {
    ticker: price.ticker,
    name: price.name,
    currency: price.display_currency,
    latest_close: latest?.close,
    latest_close_krw: latest?.close_krw ?? (price.display_currency === "KRW" ? Math.round(Number(latest?.close)) : null),
    one_month_change_percent: Number(change.toFixed(2)),
    sector: "공개 데이터 기반 추정",
    summary: `${price.name}의 최근 ${price.prices.length}개 거래일 가격 데이터 기준 요약입니다.`
  };
}

function analyzeSentiment(text) {
  const positive = ["상승", "호재", "증가", "돌파", "개선", "매수", "성장", "수혜", "강세", "반등", "호황", "흑자", "최대", "확대", "수주", "개발", "회복", "상향", "급등", "실적 개선", "positive", "profit", "beat", "突破", "增长", "利好"];
  const negative = ["하락", "악재", "감소", "조사", "위험", "손실", "매도", "약세", "상장폐지", "사망", "죽음", "위기", "적자", "부진", "급락", "폭락", "충격", "우려", "논란", "제재", "파업", "총파업", "추락", "악화", "둔화", "축소", "하향", "negative", "loss", "risk", "调查", "退市", "利空"];
  const haystack = String(text || "").toLowerCase();
  const positiveHits = keywordMatches(haystack, positive);
  const negativeHits = keywordMatches(haystack, negative);
  const pos = positiveHits.reduce((sum, item) => sum + item.count, 0);
  const neg = negativeHits.reduce((sum, item) => sum + item.count, 0);
  const score = clamp((pos - neg) / Math.max(pos + neg, 1), -1, 1);
  const label = score > 0.15 ? "positive" : score < -0.15 ? "negative" : "neutral";
  const labelKo = label === "positive" ? "긍정" : label === "negative" ? "부정" : "중립";
  return {
    score: Number(score.toFixed(2)),
    score_percent: Math.round(score * 100),
    label,
    label_ko: labelKo,
    positive_count: pos,
    negative_count: neg,
    matched_positive: positiveHits.map((item) => item.word),
    matched_negative: negativeHits.map((item) => item.word),
    analyzed_length: haystack.length,
    reason: `분석 텍스트 ${haystack.length.toLocaleString("ko-KR")}자에서 긍정 키워드 ${pos}개, 부정 키워드 ${neg}개를 감지했습니다.`
  };
}

function keywordMatches(haystack, words) {
  return words.map((word) => {
    const escaped = String(word).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return { word, count: (haystack.match(new RegExp(escaped, "g")) || []).length };
  }).filter((item) => item.count > 0);
}

async function forecastTicker(ticker, days = 5) {
  const price = await getPrice(ticker, 60);
  const closes = price.prices.map((point) => point.close).filter(Number.isFinite);
  const last = closes.at(-1);
  const prev = closes.at(-6) || closes[0] || last;
  const dailyMomentum = last && prev ? ((last - prev) / prev) / 5 : 0;
  const forecastChange = dailyMomentum * days * 100;
  const forecast = Array.from({ length: days }, (_, index) => {
    const close = last * (1 + dailyMomentum * (index + 1));
    const date = new Date(Date.now() + (index + 1) * 86400000).toISOString().slice(0, 10);
    return {
      date,
      close: Number(close.toFixed(3)),
      close_krw: price.currency === "CNY" ? Math.round(close * CNY_TO_KRW) : price.currency === "KRW" ? Math.round(close) : null
    };
  });
  return {
    ticker: price.ticker,
    name: price.name,
    currency: price.currency || price.display_currency || "KRW",
    display_currency: price.display_currency || price.currency || "KRW",
    method: "실제 가격 기반 단기 모멘텀 예측",
    confidence: Math.round(clamp(0.55 + Math.abs(dailyMomentum) * 10, 0.45, 0.78) * 100),
    expected_horizon: `T+${days}`,
    forecast_change_percent: Number(forecastChange.toFixed(2)),
    prediction: {
      target_low: Number(Math.min(0, forecastChange * 0.75).toFixed(2)),
      target_high: Number(Math.max(0, forecastChange * 1.25).toFixed(2))
    },
    prices: price.prices,
    forecast
  };
}

async function trackSignal(body) {
  const signal = body.signal || {};
  const newInfo = body.newInfo || body.text || "";
  const newSentiment = analyzeSentiment(newInfo);
  const baseSentiment = Number.isFinite(Number(signal.sentiment_score)) ? clamp(Number(signal.sentiment_score), -1, 1) : 0;
  const effectiveScore = newSentiment.positive_count + newSentiment.negative_count > 0 ? newSentiment.score : baseSentiment;
  const directionDelta = effectiveScore - baseSentiment;
  const directionAlignment = directionDelta > 0.12 ? "강화 방향" : directionDelta < -0.12 ? "약화 방향" : "방향 유지";
  const impactMagnitude = clamp(Math.abs(directionDelta) + Math.min((newSentiment.positive_count + newSentiment.negative_count) / 12, 0.35), 0, 1);
  const store = await readSignalStore();
  const signalId = signal.signal_id || `manual_${stableSignalId(signal.title || newInfo)}`;
  const previous = store.find((item) => item.id === signalId);
  const oldConfidence = Number(previous?.nextConfidence ?? signal.confidence ?? 0.5);
  const confidenceDelta = directionDelta * 0.18 + (directionAlignment === "방향 유지" ? 0 : Math.sign(directionDelta) * impactMagnitude * 0.07);
  const nextConfidence = clamp(oldConfidence + confidenceDelta, 0, 1);
  const status = confidenceDelta > 0.025 ? "강화" : confidenceDelta < -0.025 ? "약화" : "유지";
  const record = {
    id: signalId,
    title: signal.title || "수동 신호",
    status,
    oldConfidence,
    nextConfidence: Number(nextConfidence.toFixed(2)),
    confidenceDelta: Number(confidenceDelta.toFixed(3)),
    directionDelta: Number(directionDelta.toFixed(2)),
    directionAlignment,
    baseSentiment: Number(baseSentiment.toFixed(2)),
    newEvidenceScore: Number(effectiveScore.toFixed(2)),
    impactMagnitude: Number(impactMagnitude.toFixed(2)),
    evidence: {
      analyzed_length: newSentiment.analyzed_length,
      positive_count: newSentiment.positive_count,
      negative_count: newSentiment.negative_count,
      matched_positive: newSentiment.matched_positive,
      matched_negative: newSentiment.matched_negative
    },
    rationale: [
      `기존 신호 감성 ${baseSentiment.toFixed(2)} 대비 새 근거 점수 ${effectiveScore.toFixed(2)}입니다.`,
      `방향 판정은 ${directionAlignment}이며 신뢰도 변화량은 ${(confidenceDelta * 100).toFixed(1)}%p입니다.`,
      newSentiment.positive_count + newSentiment.negative_count > 0
        ? `새 근거에서 긍정 ${newSentiment.positive_count}개, 부정 ${newSentiment.negative_count}개 키워드를 감지했습니다.`
        : "새 근거에 직접 감성 키워드가 없어 기존 신호 방향을 유지 기준으로 사용했습니다."
    ],
    updated_at: new Date().toISOString()
  };
  store.unshift(record);
  await writeFile(SIGNAL_STORE, JSON.stringify(store.slice(0, 200), null, 2));
  return record;
}

function visualizeChain(signal) {
  const chain = signal.transmission_chain || signal.chain || [];
  if (!chain.length) {
    return {
      nodes: [], edges: [], drawio_xml: "",
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="90"><text x="160" y="50" text-anchor="middle" font-size="13" fill="#888">선택된 신호에 체인 데이터가 없습니다.</text></svg>`
    };
  }
  const nodes = chain.map((node, index) => ({
    id: `n${index + 1}`,
    label: node.node_name || `단계 ${index + 1}`,
    impact: node.impact_type || "영향",
    logic: node.logic || ""
  }));
  const edges = nodes.slice(1).map((node, index) => ({ from: nodes[index].id, to: node.id }));
  const nodeW = 165;
  const nodeH = 116;
  const gapX = 56;
  const totalW = Math.max(420, nodes.length * (nodeW + gapX) + 40);
  const totalH = nodeH + 86;
  function impactColor(v) {
    if (!v) return "#6c757d";
    if (/호재|강세|상승/.test(v)) return "#0f7b5f";
    if (/악재|약세|하락/.test(v)) return "#b23a2f";
    return "#5a6a7a";
  }
  function wrapText(text, maxLen) {
    const s = String(text || "");
    const out = [];
    let cur = "";
    for (const c of s) {
      cur += c;
      if (cur.length >= maxLen) { out.push(cur); cur = ""; }
    }
    if (cur) out.push(cur);
    return out.slice(0, 3);
  }
  const svgNodes = nodes.map((node, i) => {
    const x = 20 + i * (nodeW + gapX);
    const y = 28;
    const col = impactColor(node.impact);
    const logLines = wrapText(node.logic, 17);
    return [
      `<g>`,
      `<rect x="${x}" y="${y}" width="${nodeW}" height="${nodeH}" rx="10" fill="#fffaf0" stroke="${col}" stroke-width="2"/>`,
      `<text x="${x + nodeW / 2}" y="${y + 23}" text-anchor="middle" font-size="13" font-weight="bold" fill="${col}">${escapeXml(node.label)}</text>`,
      `<rect x="${x + 10}" y="${y + 31}" width="${nodeW - 20}" height="18" rx="4" fill="${col}" opacity="0.13"/>`,
      `<text x="${x + nodeW / 2}" y="${y + 44}" text-anchor="middle" font-size="11" fill="${col}">${escapeXml(node.impact.slice(0, 10))}</text>`,
      ...logLines.map((ln, li) => `<text x="${x + nodeW / 2}" y="${y + 63 + li * 16}" text-anchor="middle" font-size="10" fill="#444">${escapeXml(ln)}</text>`),
      `</g>`
    ].join("");
  }).join("");
  const svgEdges = edges.map((_, i) => {
    const x1 = 20 + i * (nodeW + gapX) + nodeW;
    const x2 = 20 + (i + 1) * (nodeW + gapX);
    const my = 28 + nodeH / 2;
    return `<path d="M${x1} ${my} L${x2} ${my}" stroke="#b23a2f" stroke-width="2.5" marker-end="url(#arr)"/>`;
  }).join("");
  const stepLabels = nodes.map((_, i) =>
    `<text x="${20 + i * (nodeW + gapX) + nodeW / 2}" y="${28 + nodeH + 20}" text-anchor="middle" font-size="11" fill="#aaa">${i + 1}단계</text>`
  ).join("");
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}">`,
    `<defs><marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">`,
    `<path d="M0,0 L0,6 L7,3 z" fill="#b23a2f"/></marker></defs>`,
    svgEdges, svgNodes, stepLabels,
    `</svg>`
  ].join("");
  const xml = [
    `<mxGraphModel><root>`,
    ...nodes.map((node, i) =>
      `<mxCell id="${node.id}" value="${escapeXml(node.label + " [" + node.impact + "]\\n" + node.logic)}" vertex="1" parent="1">` +
      `<mxGeometry x="${80 + i * 220}" y="80" width="${nodeW}" height="${nodeH}" as="geometry"/></mxCell>`
    ),
    ...edges.map((edge, i) =>
      `<mxCell id="e${i}" edge="1" parent="1" source="${edge.from}" target="${edge.to}">` +
      `<mxGeometry relative="1" as="geometry"/></mxCell>`
    ),
    `</root></mxGraphModel>`
  ].join("");
  return { nodes, edges, drawio_xml: xml, svg };
}

function generateReport(signals, title) {
  const rows = signals.map((signal, index) => `${index + 1}. ${signal.title || "신호"}\n   - 요약: ${signal.summary || "-"}\n   - 신뢰도: ${Math.round(Number(signal.confidence || 0) * 100)}%\n   - 강도: ${signal.intensity || "-"}\n`).join("\n");
  const markdown = `# ${title}\n\n생성시각: ${new Date().toLocaleString("ko-KR")}\n\n## 요약\n총 ${signals.length}개 신호를 분석했습니다.\n\n## 신호 목록\n${rows || "- 신호 없음"}\n## 주의\n본 리포트는 공개 데이터 기반 자동 생성 결과이며 투자 조언이 아닙니다.\n`;
  return { title, markdown, html: markdownToHtml(markdown) };
}

async function translate(text) {
  if (!text) return "";
  const params = new URLSearchParams({ client: "gtx", sl: "auto", tl: "ko", dt: "t", q: text });
  const raw = await fetchJson(`https://translate.googleapis.com/translate_a/single?${params.toString()}`);
  return (raw?.[0] || []).map((part) => part?.[0] || "").join("");
}

async function translateWithFallback(text) {
  try {
    return await translate(text);
  } catch {
    return text;
  }
}

async function translateOutcome(outcome) {
  const normalized = String(outcome || "").trim().toLowerCase();
  if (normalized === "yes") return "예";
  if (normalized === "no") return "아니오";
  return translateWithFallback(String(outcome || ""));
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { "user-agent": "FinanceDashboard/1.0" }, signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`${url} ${response.status}`);
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { "user-agent": "FinanceDashboard/1.0" }, signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`${url} ${response.status}`);
  return response.text();
}

function parseGoogleNewsRss(xml) {
  const itemMatches = String(xml || "").match(/<item>[\s\S]*?<\/item>/g) || [];
  return itemMatches.map((item) => ({
    title: decodeHtml(readXmlTag(item, "title")).replace(/\s+-\s+[^-]+$/, ""),
    link: decodeHtml(readXmlTag(item, "link")),
    pubDate: decodeHtml(readXmlTag(item, "pubDate"))
  })).filter((item) => item.title && item.link);
}

function readXmlTag(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  return match?.[1] || "";
}

function decodeHtml(value) {
  return String(value || "")
    .replaceAll("<![CDATA[", "")
    .replaceAll("]]>", "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    for (let end = text.length - 1; end >= 0; end -= 1) {
      if (text[end] !== "}" && text[end] !== "]") continue;
      try {
        return JSON.parse(text.slice(0, end + 1));
      } catch {
        // keep trimming until a valid JSON document is found
      }
    }
    throw new Error("JSON 요청 본문을 파싱할 수 없습니다.");
  }
}

function sendJson(res, status, data) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" });
  res.end(JSON.stringify(data));
}

function sendText(res, status, text) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  res.end(text);
}

function parseMaybeJson(value) {
  if (Array.isArray(value)) return value;
  try { return JSON.parse(value || "[]"); } catch { return value; }
}

function ymd(date) {
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

async function readSignalStore() {
  try { return JSON.parse(await readFile(SIGNAL_STORE, "utf8")); } catch { return []; }
}

function markdownToHtml(markdown) {
  return markdown
    .replace(/^# (.*)$/gm, "<h1>$1</h1>")
    .replace(/^## (.*)$/gm, "<h2>$1</h2>")
    .replace(/\n/g, "<br>");
}

function escapeXml(value) {
  return String(value || "").replace(/[<>&"']/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "\"": "&quot;", "'": "&apos;" })[char]);
}
