# 개발 문서 (DEVNOTES.md)

## 서버 구조

```
awesome-finance-research-dashboard/
├── server.js       # 백엔드: Node.js ESM 순수 HTTP 서버
├── app.js          # 프론트엔드: Vanilla JS (모든 UI 로직)
├── index.html      # 단일 HTML 페이지
├── styles.css      # 스타일시트
├── assets/         # 정적 에셋
├── data/           # signals.json (신호 이력 저장)
└── package.json    # { "type": "module" }
```

## 서버 실행 환경

- **서버:** minipc (116.41.203.98:2222, user=reset980)
- **접속:** `ssh minipc`
- **프로세스:** PM2, ID=61, name=finance-dashboard
- **포트:** 3245 (127.0.0.1만 바인딩, nginx 리버스 프록시 → finance.xsw.kr)
- **재시작:** `pm2 restart finance-dashboard`
- **로그 확인:** `pm2 logs finance-dashboard --lines 30 --nostream`

## 주요 함수 설명

### server.js

#### `STOCK_ALIASES` (배열, 상단 정의)
모든 지원 종목 목록. 각 항목:
```js
{ code, ticker, name, market, keywords[] }
```
- `market`: `"KR"` | `"US"` | `"SH"` | `"SZ"`
- 새 종목 추가 시 이 배열에 항목 추가

#### `findStockByQuery(query)`
한글 이름·코드·티커·키워드로 STOCK_ALIASES에서 종목 검색.
Polymarket, getPrice, forecastTicker 등에서 공통으로 사용.

#### `getPrice(ticker, days)`
주가 데이터 조회. 우선순위:
1. DeepEar API (중국 주식 전용)
2. Yahoo Finance (KR/US)
3. EastMoney → Yahoo Finance fallback (CN)
한글 이름 입력 시 `findStockByQuery`로 티커로 변환.
한글/CJK 텍스트가 종목 매칭 실패 시 친절한 에러 메시지 반환.

#### `getPolymarketFinanceMarkets(query, limit)`
Polymarket Gamma API에서 금융 예측 시장 조회.
결과 0건 시 → `getMetaculusFallback()`으로 Manifold Markets 데이터 반환.
한글 쿼리는 `normalizePolymarketQuery()`로 영어 검색어 변환.

#### `getMetaculusFallback(searchTerm, _unused, limit)`
Manifold Markets 무료 API 사용. question_ko는 Google Translate로 번역.
```
https://api.manifold.markets/v0/search-markets?term=...
```

#### `visualizeChain(signal)`
`signal.transmission_chain` 배열을 SVG로 렌더링.
각 노드: node_name (굵게), impact_type (배지), logic (3줄 텍스트).
호재=초록, 악재=빨강, 중립=회색.

#### `searchStocks(q)`
쿼리가 없으면 KR 종목만 반환. 쿼리 있으면 모든 시장에서 검색.
(이전에는 KR만 검색하여 애플/테슬라 누락 버그 있었음 — 수정됨)

### app.js

#### `runTool(tool)`
메인 UI 핸들러. tool 값: `"polymarket"`, `"search"`, `"stock"`, `"sentiment"`, `"predict"`, `"track"`, `"visualize"`, `"report"`

#### Enter 키 지원
`#polyQuery`, `#searchQuery`, `#stockQuery`, `#predictTicker` — keydown Enter 리스너 등록.

#### Polymarket fallback 배너
`data.fallback === true`이면 노란 배너로 "Manifold Markets 대체 데이터" 안내.

## 수정 이력 (2026-05-18)

| # | 파일 | 수정 내용 |
|---|------|---------|
| 1 | server.js | `findStockByQuery()` 헬퍼 추가 — 한글 종목명 전역 지원 |
| 2 | server.js | `normalizePolymarketQuery()` — 종목 인식 시 영어 키워드 반환 |
| 3 | server.js | `strictPolymarketTerms()` — 종목 키워드 기반 strict 필터 |
| 4 | server.js | `mapPolymarket()` — 번역 Promise.all 병렬화 |
| 5 | server.js | `getPolymarketFinanceMarkets()` — 0건 시 Manifold fallback (주식/비주식 모두) |
| 6 | server.js | `getMetaculusFallback()` — Metaculus→Manifold Markets API 교체, 번역 추가 |
| 7 | server.js | `getPrice()` — 한글 이름 입력 지원, CJK 입력 에러 가이드 |
| 8 | server.js | `searchStocks()` — KR 전용 필터 제거, 모든 시장 검색 |
| 9 | server.js | `visualizeChain()` — impact_type·logic 텍스트 SVG에 포함 |
| 10 | app.js | Polymarket fallback 노란 배너 표시 |
| 11 | app.js | Enter 키 리스너 4개 입력칸에 추가 |
| 12 | index.html | `#predictTicker` placeholder 개선 |
| 13 | index.html | `#stockQuery` placeholder — 전체 시장 안내 |

## 자주 쓰는 SSH 명령어

```bash
# 서버 접속
ssh minipc

# 서버 재시작
pm2 restart finance-dashboard

# 에러 로그 확인
pm2 logs finance-dashboard --err --lines 30 --nostream

# 파일 편집 후 바로 테스트
python3 /tmp/patch_xxx.py && pm2 restart finance-dashboard

# API 테스트 (포트 3245)
curl -s 'http://127.0.0.1:3245/api/health'
curl -s 'http://127.0.0.1:3245/api/stock/search?q=삼성전자'

# 로컬에서 원격 파일 복사
scp D:/project/patch.py minipc:/tmp/patch.py
```

## 다음 개선 아이디어

- [ ] STOCK_ALIASES에 더 많은 한국·미국 종목 추가
- [ ] 종목 추가/제거 UI (관리자 페이지)
- [ ] WebSocket으로 실시간 주가 갱신
- [ ] 뉴스 감성과 주가를 연동한 자동 신호 생성
- [ ] 다크모드 지원
- [ ] 모바일 반응형 레이아웃 개선
