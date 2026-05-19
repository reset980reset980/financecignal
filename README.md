# Finance Signal Radar · 금융 신호 레이더

> 한국 주식·글로벌 금융 시장의 실시간 신호를 분석하는 대시보드

**로컬 운영 라이브:** https://finance.xsw.kr/

**Vercel 배포본:** https://awesome-finance-research-dashboard.vercel.app/

---

## 주요 기능

| 메뉴 | 설명 |
|------|------|
| **시장 예측** | 종목명 하나로 종목 검색, 가격 조회, 5거래일 예측, 일봉 차트를 통합 실행 |
| **필터 연동 요약** | 상단 표시 신호, 평균 확실성, 영향 종목 수가 현재 검색/필터 기준으로 자동 갱신 |
| **신호별 시각화 분석** | 선택 종목의 예측 요약, 판단 흐름, 영향 종목, 차트를 한 화면에 표시 |
| **뉴스 해석과 기사 검색** | 한국어 기사 검색 결과를 선택하면 원문 본문을 추출해 뉴스 해석 입력창에 자동 반영 |
| **AI 분석** | 로컬은 Codex CLI, Vercel은 접속자 브라우저에 저장한 OpenAI API 키로 기사와 종목 신호를 분석 |
| **AI 리포트** | 로컬은 Codex CLI, Vercel은 접속자 브라우저에 저장한 OpenAI API 키로 전체 신호 리포트 생성 |
| **고급 분석** | 뉴스 해석, 예측시장 조회, 기사 검색, 리포트 생성을 접이식 보조 분석 영역에서 실행 |
| **리포트 문서화** | 생성된 리포트를 Markdown으로 복사하거나 Markdown/HTML 문서로 다운로드 |
| **실시간 진행과정 UI** | 초기 로딩, 기사 검색, 시장 예측, AI 분석, 리포트 생성 단계가 카드별 진행률로 표시 |
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

로컬 실행본의 **AI 분석** 버튼과 리포트 영역의 **AI 리포트** 버튼은 서버에서 Codex CLI를 비대화형으로 실행합니다.

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

## Vercel AI 실행 방식

Vercel 배포본에서는 서버리스 환경에서 로컬 Codex CLI를 실행하지 않습니다.

대신 고급 분석의 **AI API 설정**에 접속자 본인의 OpenAI API 키를 저장하면, 그 브라우저의 `localStorage`에만 보관하고 AI 분석/AI 리포트 실행 시에만 `/api/openai/responses` 프록시로 전달합니다. 키는 서버에 저장하지 않습니다.

사용 순서:

1. 고급 분석을 연다.
2. AI API 설정 카드에서 OpenAI API 키를 입력한다.
3. 모델을 확인하거나 변경한다.
4. 저장을 누른다.
5. AI 분석 또는 AI 리포트를 실행한다.

로컬 `localhost`, `127.0.0.1`, `finance.xsw.kr`에서는 API 키가 없으면 기존처럼 Codex CLI를 사용합니다.

### 로컬과 Vercel 차이

| 환경 | URL | AI 실행 방식 | 비고 |
|------|-----|-------------|------|
| 로컬 운영 | https://finance.xsw.kr/ | OpenAI API 키가 있으면 BYOK, 없으면 Codex CLI fallback | PM2 + Caddy, 포트 3245 |
| Vercel | https://awesome-finance-research-dashboard.vercel.app/ | 접속자 브라우저에 저장한 OpenAI API 키만 사용 | Codex CLI 사용 불가, 서버리스 프록시는 키를 저장하지 않음 |

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

## Vercel 배포

이 프로젝트는 Vercel에서 정적 프론트엔드와 서버리스 API를 함께 사용합니다.

- `vercel.json`에서 `/api/*` 요청을 `api/index.js`로 라우팅합니다.
- `api/index.js`는 `server.js`의 `handleRequest()`를 재사용합니다.
- PM2 로컬 실행에서는 `server.js`가 직접 `server.listen()`을 수행합니다.
- Vercel에서는 `process.env.VERCEL` 분기로 상시 서버 실행을 하지 않습니다.
- Vercel 서버리스의 임시 데이터 저장 위치는 `/tmp`입니다.

배포:

```bash
vercel --prod --yes
```

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
| POST | `/api/codex/report` | Codex CLI 기반 전체 신호 AI 리포트 생성 |
| POST | `/api/openai/responses` | Vercel/BYOK용 OpenAI Responses API 프록시 |
| POST | `/api/visualize/chain` | 논리체인 SVG 시각화 |
| POST | `/api/report/generate` | 리포트 생성 |

---

## 라이선스

MIT
