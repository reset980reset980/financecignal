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
    sendJson(res, 200, makeKoreanSearch(q));
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
  const watchlist = STOCK_ALIASES.filter((stock) => stock.market === "KR").slice(0, 6);
  const priceResults = await Promise.allSettled(watchlist.map((stock) => getPrice(stock.ticker, 45)));
  const charts = {};
  const signals = [];
  const news = await getKoreanNews("korean_market", 6);

  priceResults.forEach((result, index) => {
    const stock = watchlist[index];
    if (result.status !== "fulfilled" || !result.value?.prices?.length) return;
    const price = result.value;
    const prices = price.prices.slice(-30).map((point) => ({
      ...point,
      close_krw: point.close_krw ?? (price.currency === "KRW" ? Math.round(Number(point.close)) : null)
    }));
    const closes = prices.map((point) => Number(point.close)).filter(Number.isFinite);
    const first = closes[0];
    const last = closes.at(-1);
    const change = first && last ? ((last - first) / first) * 100 : 0;
    const mood = change > 2 ? 0.35 : change < -2 ? -0.35 : 0;
    const confidence = clamp(0.55 + Math.min(Math.abs(change) / 20, 0.3), 0.5, 0.85);
    const source = news.items[index % Math.max(news.items.length, 1)];

    charts[stock.ticker] = {
      ticker: stock.ticker,
      name: stock.name,
      currency: price.currency || "KRW",
      display_currency: "KRW",
      prices,
      forecast: buildForecastFromPrices(prices, price.currency || "KRW"),
      prediction: {
        target_low: Number(Math.min(change * 0.3, change * 0.8).toFixed(2)),
        target_high: Number(Math.max(change * 0.3, change * 0.8).toFixed(2))
      },
      prediction_logic: "최근 한국 주식 가격 흐름과 한국어 뉴스 흐름을 결합한 경량 모멘텀 예측입니다."
    };

    signals.push({
      signal_id: `kr_${stock.code}_${Date.now()}_${index}`,
      title: `${stock.name}: 최근 1개월 ${change >= 0 ? "상승" : "하락"} 흐름과 한국 뉴스 점검`,
      summary: `${stock.name}은 최근 1개월 기준 ${change.toFixed(2)}% 변동했습니다. 한국어 뉴스와 가격 흐름을 함께 보며 단기 모멘텀을 확인합니다.`,
      reasoning: `가격 데이터 ${prices.length}개와 한국어 금융 기사 흐름을 기준으로 산출했습니다. 급격한 변동은 실적, 업황, 금리, 환율 뉴스와 함께 재확인이 필요합니다.`,
      sentiment_score: Number(mood.toFixed(2)),
      confidence: Number(confidence.toFixed(2)),
      intensity: Math.max(1, Math.min(5, Math.round(Math.abs(change) / 3) + 1)),
      timeliness: 0.85,
      expected_horizon: "T+5",
      price_in_status: "한국 시장 가격 기준",
      impact_tickers: [{ ticker: stock.ticker, code: stock.code, name: stock.name, weight: 1 }],
      transmission_chain: [
        { node_name: "한국어 뉴스", impact_type: mood >= 0 ? "호재" : "악재", logic: source?.title || "한국 금융시장 주요 뉴스 흐름을 확인합니다." },
        { node_name: "가격 모멘텀", impact_type: mood >= 0 ? "중립·강세" : "중립·약세", logic: `최근 1개월 변동률 ${change.toFixed(2)}%` },
        { node_name: "관심 종목", impact_type: "중립", logic: `${stock.name}의 단기 리스크와 수급을 함께 관찰합니다.` }
      ],
      sources: source ? [{ source_name: source.source_name, title: source.title, url: source.url }] : []
    });
  });

  return {
    generated_at: new Date().toISOString(),
    count: signals.length,
    locale: "ko-KR",
    base_market: "KR",
    signals,
    charts
  };
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
      meta: { query, origin: NEWS_SOURCES[source] || source }
    }));
    return { source: "korean-search", source_name: "한국어 뉴스 검색", query, count: items.length, items };
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
    const fallback = await getMetaculusFallback(manifoldTerm, null, limit);
    const fallbackReason = matchedStock
      ? `폴리마켓에 ${matchedStock.name} 종목의 예측 시장이 없어 Manifold Markets 대체 데이터를 표시합니다`
      : `폴리마켓에 관련 예측시장이 없어 Manifold Markets 대체 데이터를 표시합니다`;
    return {
      query,
      normalized_query: normalizedQuery,
      strict_terms: strictTerms,
      source: "manifold-fallback",
      fallback: true,
      fallback_reason: fallbackReason,
      count: fallback.length,
      markets: fallback
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

async function getMetaculusFallback(searchTerm, _unused, limit) {
  try {
    const url = `https://api.manifold.markets/v0/search-markets?term=${encodeURIComponent(searchTerm)}&limit=${limit}`;
    const raw = await fetchJson(url);
    const items = (Array.isArray(raw) ? raw : []).slice(0, limit);
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
  const positive = ["상승", "호재", "증가", "돌파", "개선", "매수", "성장", "수혜", "강세", "positive", "profit", "beat", "突破", "增长", "利好"];
  const negative = ["하락", "악재", "감소", "조사", "위험", "손실", "매도", "약세", "상장폐지", "negative", "loss", "risk", "调查", "退市", "利空"];
  const haystack = String(text || "").toLowerCase();
  const pos = positive.reduce((sum, word) => sum + (haystack.includes(word.toLowerCase()) ? 1 : 0), 0);
  const neg = negative.reduce((sum, word) => sum + (haystack.includes(word.toLowerCase()) ? 1 : 0), 0);
  const score = clamp((pos - neg) / Math.max(pos + neg, 1), -1, 1);
  const label = score > 0.15 ? "positive" : score < -0.15 ? "negative" : "neutral";
  const labelKo = label === "positive" ? "긍정" : label === "negative" ? "부정" : "중립";
  return { score: Number(score.toFixed(2)), label, label_ko: labelKo, reason: `긍정 키워드 ${pos}개, 부정 키워드 ${neg}개를 감지했습니다.` };
}

async function forecastTicker(ticker, days = 5) {
  const price = await getPrice(ticker, 60);
  const closes = price.prices.map((point) => point.close).filter(Number.isFinite);
  const last = closes.at(-1);
  const prev = closes.at(-6) || closes[0] || last;
  const dailyMomentum = last && prev ? ((last - prev) / prev) / 5 : 0;
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
    method: "크로노스 호환 경량 모멘텀 예측",
    confidence: Math.round(clamp(0.55 + Math.abs(dailyMomentum) * 10, 0.45, 0.78) * 100),
    prices: price.prices,
    forecast
  };
}

async function trackSignal(body) {
  const signal = body.signal || {};
  const newInfo = body.newInfo || body.text || "";
  const sentiment = analyzeSentiment(`${signal.summary || ""} ${newInfo}`);
  const oldConfidence = Number(signal.confidence || 0.5);
  const nextConfidence = clamp(oldConfidence + sentiment.score * 0.15, 0, 1);
  const status = sentiment.score > 0.2 ? "강화" : sentiment.score < -0.2 ? "약화" : "유지";
  const record = {
    id: signal.signal_id || `manual_${Date.now()}`,
    title: signal.title || "수동 신호",
    status,
    oldConfidence,
    nextConfidence: Number(nextConfidence.toFixed(2)),
    sentiment,
    updated_at: new Date().toISOString()
  };
  const store = await readSignalStore();
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
