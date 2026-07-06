/**
 * ta.js — OpenAI 심층 분석 통합 모듈 v3
 *
 * 기존 "예측 생성" 버튼 실행 완료 후,
 * #predictOutput 하단에 ta 심층 분석 결과를 자동으로 이어 붙입니다.
 * 별도 UI 없이 기존 시장 예측 흐름에 자연스럽게 통합됩니다.
 */

(function () {
  "use strict";

  const TA_SECTION_ID = "ta-deep-result";
  const OPENAI_STOCK_CACHE_TTL_MS = 4 * 60 * 60 * 1000;
  let currentTicker = null;

  // ── 예측 완료 이벤트 수신 — 화면 텍스트가 아닌 API 원본 데이터로 분석 시작 ──
  const predictOutput = document.getElementById("predictOutput");
  window.addEventListener("finance:prediction-ready", (event) => {
    const detail = event.detail || {};
    const ticker = normalizeTicker(detail.prediction?.ticker || detail.ticker || document.getElementById("predictTicker")?.value);
    startDeepAnalysis(ticker, detail);
  });

  // ── 심층 분석 컨테이너 생성/리셋 ─────────────────────────
  function getOrCreateSection() {
    let el = document.getElementById(TA_SECTION_ID);
    if (!el) {
      el = document.createElement("div");
      el.id = TA_SECTION_ID;
      el.className = "ta-deep-section";
      predictOutput?.insertAdjacentElement("afterend", el);
    }
    return el;
  }

  function setSection(html) {
    const el = getOrCreateSection();
    el.innerHTML = html;
    return el;
  }

  function markdownToHtml(md) {
    if (!md) return "";
    return md
      .replace(/^### (.*)$/gm, "<h3>$1</h3>")
      .replace(/^## (.*)$/gm,  "<h2>$1</h2>")
      .replace(/^# (.*)$/gm,   "<h1>$1</h1>")
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g,     "<em>$1</em>")
      .replace(/^[-*] (.*)$/gm,  "<li>$1</li>")
      .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
      .replace(/\n{2,}/g, "<br><br>")
      .trim();
  }

  // ── 분석 시작 ─────────────────────────────────────────────
  async function startDeepAnalysis(ticker, context = {}) {
    const normalizedTicker = normalizeTicker(ticker);
    if (!normalizedTicker || currentTicker === normalizedTicker) return;
    currentTicker = normalizedTicker;

    setSection(`
      <div class="ta-deep-header">
        <span class="live-dot"></span>
        <strong>심층 분석</strong>
        <span class="ta-deep-ticker">${escHtml(normalizedTicker)}</span>
        <span class="ta-deep-status" id="ta-deep-status-msg">OpenAI 분석 중…</span>
        <button type="button" class="secondary-action" id="ta-stop-btn" style="margin-left:auto;font-size:0.8rem">중단</button>
      </div>
      <div id="ta-deep-body" class="ta-deep-body">
        <p class="ta-waiting">OpenAI API로 예측 결과와 선택 종목 맥락을 요약 분석하는 중입니다.</p>
      </div>`);

    document.getElementById("ta-stop-btn")?.addEventListener("click", () => {
      const bodyEl = document.getElementById("ta-deep-body");
      if (bodyEl) bodyEl.innerHTML = `<p class="ta-waiting">분석을 중단했습니다.</p>`;
      const msgEl = document.getElementById("ta-deep-status-msg");
      if (msgEl) msgEl.textContent = "중단됨";
      currentTicker = null;
    });

    try {
      const r = await fetch("/api/openai/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cacheKey: `stock-deep-v3:${normalizedTicker}`,
          cacheTtlMs: OPENAI_STOCK_CACHE_TTL_MS,
          payload: {
            model: document.getElementById("openaiModel")?.value?.trim() || "gpt-5-mini",
            input: [
              {
                role: "system",
                content: "너는 한국어 금융시장 분석 보조 엔진이다. 투자 조언, 매수/매도 지시, 확정 수익 표현은 금지한다. 출력은 Markdown만 사용한다."
              },
              {
                role: "user",
                content: buildOpenAIPrompt(normalizedTicker, context)
              }
            ],
            max_output_tokens: 1800
          }
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error?.message || d.error || "분석 요청 실패");
      const report = extractOpenAIText(d);
      if (!report) throw new Error("OpenAI API가 빈 응답을 반환했습니다.");
      renderResult({ report, cached: Boolean(d._cache?.hit) });
    } catch (err) {
      const bodyEl = document.getElementById("ta-deep-body");
      if (bodyEl) bodyEl.innerHTML = `<p class="ta-error">심층 분석 실패: ${escHtml(err.message)}</p>`;
      currentTicker = null;
    }
  }

  function buildOpenAIPrompt(ticker, context = {}) {
    const structuredContext = buildStructuredContext(ticker, context);
    return [
      `분석 대상: ${ticker}`,
      "",
      "아래 JSON의 예측 원본값과 뉴스/신호 맥락만 근거로 한국어 심층 분석을 작성해라.",
      "화면 애니메이션, DOM 텍스트, 초기 표시값은 근거로 삼지 말고 JSON 숫자를 권위 있는 값으로 사용해라.",
      "",
      "포함할 섹션:",
      "## 핵심 요약",
      "## 상승 근거",
      "## 하락 또는 중립 리스크",
      "## 확인할 지표",
      "## 주의",
      "",
      "[구조화 입력 JSON]",
      JSON.stringify(structuredContext, null, 2)
    ].join("\n");
  }

  function buildStructuredContext(ticker, context = {}) {
    const prediction = context.prediction || {};
    const prices = Array.isArray(prediction.prices) ? prediction.prices : [];
    const forecast = Array.isArray(prediction.forecast) ? prediction.forecast : [];
    const latest = prices.at(-1) || null;
    const lastForecast = forecast.at(-1) || null;
    return {
      analysis_target: {
        ticker,
        name: prediction.name || context.name || "",
        generated_at: context.generated_at || new Date().toISOString()
      },
      market_prediction: {
        ticker: prediction.ticker || ticker,
        name: prediction.name || "",
        expected_horizon: prediction.expected_horizon || "",
        method: prediction.method || "",
        currency: prediction.display_currency || prediction.currency || "",
        latest_close: compactPricePoint(latest),
        forecast_close: compactPricePoint(lastForecast),
        forecast_change_percent: numberOrNull(prediction.forecast_change_percent),
        confidence_percent: numberOrNull(prediction.confidence),
        prediction_range: prediction.prediction || null,
        recent_prices: prices.slice(-10).map(compactPricePoint),
        forecast: forecast.map(compactPricePoint)
      },
      selected_signal: compactSignal(context.selected_signal),
      selected_article: compactArticle(context.selected_article),
      article_candidates: (context.article_candidates || []).slice(0, 8).map(compactArticle),
      stock_search_results: (context.search_results || []).slice(0, 8).map(compactStockResult),
      sentiment_text: String(context.sentiment_text || document.getElementById("sentimentText")?.value || "").slice(0, 4000)
    };
  }

  function compactPricePoint(point) {
    if (!point) return null;
    return {
      date: point.date || point.ds || null,
      close: numberOrNull(point.close),
      close_krw: numberOrNull(point.close_krw),
      lower: numberOrNull(point.lower),
      upper: numberOrNull(point.upper)
    };
  }

  function compactSignal(signal) {
    if (!signal) return null;
    const sourceArticles = Array.isArray(signal.source_articles) ? signal.source_articles
      : Array.isArray(signal.articles) ? signal.articles
      : Array.isArray(signal.sources) ? signal.sources
      : Array.isArray(signal.news) ? signal.news
      : [];
    return {
      title: signal.title || "",
      summary: signal.summary || "",
      reasoning: signal.reasoning || "",
      sentiment_score: numberOrNull(signal.sentiment_score),
      confidence: numberOrNull(signal.confidence),
      expected_horizon: signal.expected_horizon || "",
      prediction_summary: signal.prediction_summary || null,
      prediction_market_summary: signal.prediction_market_summary || null,
      impact_tickers: (signal.impact_tickers || []).slice(0, 8),
      source_articles: sourceArticles.slice(0, 8).map(compactArticle),
      transmission_chain: (signal.transmission_chain || []).slice(0, 8).map((node) => ({
        node_name: node.node_name || "",
        impact_type: node.impact_type || "",
        logic: node.logic || ""
      }))
    };
  }

  function compactArticle(article) {
    if (!article) return null;
    return {
      title: article.title || article.name || "",
      source_name: article.source_name || article.source || "",
      snippet: article.snippet || article.summary || article.extracted_summary || "",
      published_at: article.published_at || article.date || "",
      url: article.final_url || article.url || ""
    };
  }

  function compactStockResult(stock) {
    if (!stock) return null;
    return {
      name: stock.name || "",
      ticker: stock.ticker || "",
      code: stock.code || "",
      market: stock.market || stock.market_name || ""
    };
  }

  function numberOrNull(value) {
    const amount = Number(value);
    return Number.isFinite(amount) ? amount : null;
  }

  function normalizeTicker(value) {
    return String(value || "").trim().toUpperCase();
  }

  function extractOpenAIText(data) {
    if (typeof data.output_text === "string") return data.output_text.trim();
    return (data.output || [])
      .flatMap((item) => item.content || [])
      .map((part) => part.text || "")
      .join("")
      .trim();
  }

  // ── 결과 렌더링 ───────────────────────────────────────────
  function renderResult(d) {
    currentTicker = null;

    const report   = d.report || d.result || d.message || "";
    const decision = d.decision;

    let html = "";

    if (decision) {
      const cls = decision === "BUY" ? "ta-buy" : decision === "SELL" ? "ta-sell" : "ta-hold";
      const label = decision === "BUY" ? "매수" : decision === "SELL" ? "매도" : "관망";
      html += `<div class="ta-decision ${cls}">에이전트 최종 판단: <strong>${label} (${decision})</strong></div>`;
    }

    html += report
      ? `<div class="ta-report">${markdownToHtml(report)}</div>`
      : `<p class="ta-waiting">분석이 완료됐으나 리포트 내용이 없습니다.</p>`;

    if (d.cached) {
      html += `<p class="ta-cache-note">저장된 분석을 불러왔습니다.</p>`;
    }

    const bodyEl = document.getElementById("ta-deep-body");
    if (bodyEl) bodyEl.innerHTML = html;

    const msgEl = document.getElementById("ta-deep-status-msg");
    if (msgEl) msgEl.textContent = "분석 완료";

    const stopBtn = document.getElementById("ta-stop-btn");
    if (stopBtn) stopBtn.remove();
  }

  // ── 간단 이스케이프 ───────────────────────────────────────
  function escHtml(s) {
    return String(s || "").replace(/[<>&"]/g, (c) =>
      ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]);
  }
})();
