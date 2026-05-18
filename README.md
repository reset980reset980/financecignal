# Finance Signal Radar · 금융 신호 레이더

> 한국 주식·글로벌 금융 시장의 실시간 신호를 분석하는 대시보드

**라이브:** https://finance.xsw.kr/

---

## 주요 기능

| 메뉴 | 설명 |
|------|------|
| 📊 **예측시장** | Polymarket 금융 예측 시장 조회. 결과가 없을 경우 Manifold Markets 대체 데이터 표시 |
| 🔍 **뉴스검색** | 네이버·구글·다음·빙 한국어 뉴스 통합 검색 링크 |
| 📈 **종목분석** | 한국·미국·중국 주식 가격·기본지표 조회 |
| 💬 **감성분석** | 금융 텍스트 긍정/부정/중립 감성 분석 |
| 🔮 **시장예측** | 모멘텀 기반 단기 주가 예측 |
| 📡 **신호추적** | 신호 신뢰도 업데이트 및 이력 추적 |
| 🕸️ **논리체인 시각화** | 신호 전달 체인 SVG 시각화 (영향유형·논리 포함) |
| 📝 **리포트 생성** | 분석 신호 마크다운 리포트 자동 생성 |

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
| POST | `/api/sentiment/analyze` | 감성 분석 |
| POST | `/api/visualize/chain` | 논리체인 SVG 시각화 |
| POST | `/api/report/generate` | 리포트 생성 |

---

## 라이선스

MIT
