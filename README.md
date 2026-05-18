# Finance Signal Radar · 금융 신호 레이더

> 한국 주식·글로벌 금융 시장의 실시간 신호를 분석하는 대시보드

**라이브:** https://finance.xsw.kr/

---

## 주요 기능

| 메뉴 | 설명 |
|------|------|
| **시장 예측** | 종목명 하나로 종목 검색, 가격 조회, 5거래일 예측, 일봉 차트를 통합 실행 |
| **신호별 시각화 분석** | 선택 종목의 예측 요약, 판단 흐름, 영향 종목, 차트를 한 화면에 표시 |
| **뉴스 해석과 기사 검색** | 한국어 기사 검색 결과를 선택하면 원문 본문을 추출해 뉴스 해석 입력창에 자동 반영 |
| **Codex AI 분석** | Codex CLI를 호출해 선택 기사와 종목 신호의 맥락, 핵심 근거, 리스크, 확인 지표를 LLM으로 정리 |
| **고급 분석** | 뉴스 해석, 예측시장 조회, 기사 검색, 리포트 생성을 접이식 보조 분석 영역에서 실행 |
| **리포트 문서화** | 생성된 리포트를 Markdown으로 복사하거나 Markdown/HTML 문서로 다운로드 |
| **스크롤 리빌 UI** | 섹션 진입 시 페이드인·슬라이드업, 수치 카운트업, 상단 진행 게이지 제공 |

---

## 뉴스 본문 추출 흐름

한국어 기사 검색에서 기사를 선택하면 다음 순서로 동작합니다.

1. Google News RSS 링크를 실제 원문 기사 URL로 해석합니다.
2. 원문 HTML의 `articleBody`, `article` 태그, 메타 설명을 순서대로 확인합니다.
3. 본문 요약을 찾으면 뉴스 해석 입력창의 `[본문 추출 중]` 상태를 `[본문 요약]`으로 자동 교체합니다.
4. 본문을 충분히 가져오지 못한 경우에는 `[제목 기준]`과 실패 사유를 표시해 임시 상태로 남지 않게 합니다.

예: Google News 링크로 들어온 `"낸드 가격 45% 폭등" SK하이닉스...` 기사도 실제 리드경제 원문 URL과 본문 요약으로 변환됩니다.

---

## Codex CLI 연동

뉴스 해석 영역의 **Codex AI 분석** 버튼은 서버에서 Codex CLI를 비대화형으로 실행합니다.

사용 명령 형태:

```bash
codex exec --ephemeral --sandbox read-only -c 'approval_policy="never"' -m "$CODEX_MODEL" -C "$PROJECT_DIR" -o "$TMP_OUTPUT" -
```

환경변수:

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `CODEX_COMMAND` | `codex` | 실행할 Codex CLI 바이너리 |
| `CODEX_MODEL` | `gpt-5.4-mini` | Codex CLI 분석에 사용할 모델 |
| `CODEX_TIMEOUT_MS` | `90000` | 분석 타임아웃 |

서버는 쉘 문자열을 조합하지 않고 `child_process.spawn()` 인자 배열로 실행합니다. Codex 실패 시에는 기존 키워드 기반 해석을 대체 결과로 표시합니다.

---

## 기술 스택

- **Backend:** Node.js (ESM, `node:http` 순수 서버, 프레임워크 없음)
- **Frontend:** Vanilla JS + Canvas API
- **데이터 소스:**
  - [Polymarket Gamma API](https://gamma-api.polymarket.com) — 예측시장
  - [Manifold Markets API](https://api.manifold.markets) — Polymarket 대체 fallback
  - [Yahoo Finance](https://finance.yahoo.com) — 주가 데이터
  - [DeepEar](https://deepear.vercel.app) — 중국 주식 데이터
  - [Google News RSS](https://news.google.com) — 한국어 뉴스
  - [Google Translate (gtx)](https://translate.googleapis.com) — 자동 번역
- **프로세스 관리:** PM2 (ID: 61, port: 3245)

---

## 지원 종목

### 한국 (KRX)
KRX 상장 종목 전체를 최신 상장 CSV 캐시에서 검색합니다.

예: 삼성전자, SK하이닉스, 현대차, 한화오션, 두산에너빌리티, 한미반도체

### 글로벌
Yahoo Finance 검색 API로 미국·해외 종목을 조회합니다.

예: 엔비디아, 애플, 테슬라, 마이크로소프트, 팔란티어, NVDA, AAPL, PLTR

> 한글 해외 종목명은 영어로 자동 번역한 뒤 Yahoo Finance 검색을 함께 수행합니다.

---

## 로컬 실행

```bash
# Node.js 18+ 필요
node server.js

# 또는 PM2 사용
pm2 start server.js --name finance-dashboard
```

기본 포트: `3245` (환경변수 `PORT`로 변경 가능)

---

## API 엔드포인트

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/korea/dashboard` | 한국 주식 대시보드 데이터 |
| GET | `/api/polymarket/markets?q=검색어` | 예측시장 조회 (Manifold fallback 포함) |
| GET | `/api/news/hot?source=korean_market` | 주요 뉴스 |
| GET | `/api/stock/search?q=종목명` | 종목 검색 |
| GET | `/api/stock/price?ticker=005930.KS` | 주가 데이터 |
| GET | `/api/stock/fundamentals?ticker=005930.KS` | 기본지표 |
| GET | `/api/predict?ticker=삼성전자&days=5` | 단기 예측 |
| POST | `/api/article/extract` | Google News 또는 원문 기사 URL에서 본문 요약 추출 |
| POST | `/api/sentiment/analyze` | 감성 분석 |
| POST | `/api/codex/analyze` | Codex CLI 기반 기사·종목 AI 분석 |
| POST | `/api/visualize/chain` | 논리체인 SVG 시각화 |
| POST | `/api/report/generate` | 리포트 생성 |

---

## 라이선스

MIT
