# Epic-Studio — AI Event Design Fulfillment Platform

## 9 Teams — Agent Override (이 프로젝트 전용)

이 프로젝트에서는 글로벌 Lead(frontend.md, backend.md 등) 사용 금지.
반드시 `kv-*` 에이전트로 디스패치할 것.

| 팀 | 에이전트 파일 | 담당 |
|---|-------------|------|
| **프로덕트** | `kv-product.md` | 서비스 티어, 워크플로우, UX, 53종 카탈로그 |
| **엔지니어링** | `kv-eng.md` | Workers API, D1/R2/KV, Vite 빌드, 업스케일 |
| **AI** | `kv-ai.md` | Gemini/OpenRouter, 스타일 분류, 브릿지 영상, PPT |
| **마케팅** | `kv-marketing.md` | 랜딩 페이지, 케이스 스터디, 가격표 |
| **영업** | `kv-sales.md` | 파일럿 고객, 파이프라인, 가격 모델 |
| **운영** | `kv-ops.md` | GitHub 브랜치, 배포, 시크릿 관리 |
| **디자인** | `kv-design.md` | CSS 토큰, Cruip 템플릿, 다크 테마, 반응형 |
| **QA** | `kv-qa.md` | 전체 플로우 테스트, 업스케일 실물 테스트, DPI 검증 |
| **리서치** | `kv-research.md` | 레퍼런스 DB, 인쇄 파트너, 경쟁사 조사 |

### 라우팅 키워드
| 팀 | 트리거 |
|---|--------|
| 프로덕트 | 기능, 티어, 워크플로우, UX, 카탈로그, 서비스, 제작물 |
| 엔지니어링 | 버그, 에러, 빌드, API, Workers, D1, R2, 업스케일, 인프라 |
| AI | 생성, Gemini, OpenRouter, 스타일, 분류, 영상, 프롬프트 |
| 마케팅 | 랜딩, 홈페이지, 케이스, 가격표, 콘텐츠 |
| 영업 | 고객, 파일럿, 견적, 제안 |
| 운영 | 배포, 시크릿, cron, 모니터링 |
| 디자인 | 디자인, Cruip, 토큰, 색상, 반응형, 다크, CSS |
| QA | 테스트, 확인, 검증, 품질, DPI, 인쇄 |
| 리서치 | 조사, 비교, 레퍼런스, 시장 |

### 환경변수 관리
Epi가 `~/Documents/claude_code/secrets/.env.local`에서 중앙 관리.
각 에이전트 파일에 "필요 환경변수" 선언 -> 디스패치 시 Epi가 읽어서 주입.
절대 하드코딩 금지. 절대 로그 출력 금지.

### Epi 선제 제안 (이 프로젝트 한정)
세션 시작 시 Epi는:
1. `docs/handoff.md` 읽기 -- 지난 세션 상태
2. `docs/TODO.md` 읽기 -- High 항목 수 파악
3. 선제 보고: "High N건, 오늘 추천 작업: [팀명] [할일]"
4. CEO 승인 후 디스패치

### CEO 서포트 (이 프로젝트 한정)
- 할일이 많아 보일 때: "N건이지만 출시에 필요한 건 High X건뿐입니다"
- 완료 시: 구체적 진척 수치 ("High 11->8, 27% 해소")
- 절대 금지: "다 해야 합니다", "심각합니다", 불안 유발 표현
- 항상: "지금 가장 중요한 1가지"를 명확히 끊어주기

### 세션 핸드오프 (MANDATORY)
**컨텍스트 50% 도달 시 자동 핸드오프 -- 반드시 지켜야 함:**

1. 즉시 현재 작업 중단
2. `docs/handoff.md` 업데이트 (완료 작업 + 중단 지점 + 다음 할 일)
3. `docs/TODO.md` -- 완료 체크 + 신규 추가
4. `docs/next-session-prompt.md` 작성
5. CEO에게 보고: "컨텍스트 50% -- 핸드오프 완료"

**커밋만으로는 핸드오프를 대체할 수 없음.**

## Structure

```
src/          -- Vite frontend (main.js + style.css)
workers/      -- Hono + CF Workers backend (src/index.ts)
docs/         -- Plans, specs, references, handoff
legacy/       -- Old monolithic HTML (archived)
```

## Quick Start

```bash
npm install && npm run dev        # Frontend on :5173
cd workers && npm install && npm run dev  # API on :8787
```

## Infrastructure

- **D1**: `epic-studio-db` (d9d2f91e-0303-4479-bfac-91da125a3695)
- **R2**: `epic-studio-storage`
- **KV**: `EPIC_KV` (05f16e431a68467ca7c0dfc31ad9f77c)
- **Worker**: `epic-studio-api` -> epic-studio-api.kbm-32f.workers.dev
- **EpicSearch**: search.epicstage.co.kr (Cloudflare Tunnel -> VPS:8788)
- **AI**: OpenRouter (Nano Banana 2 = google/gemini-3.1-flash-image-preview)

## Key APIs

- `POST /api/generate` -- Image generation (OpenRouter proxy)
- `POST /api/search/smart-references` -- Reference image search
- `POST /api/analyze/style` -- AI style classification (10 categories)
- `POST /api/chat` -- Agent chat (design assistant)
- `POST /api/upscale` -- Upscale pipeline (Real-ESRGAN placeholder)
- `POST /api/upload` / `GET /api/images/:id` -- R2 storage
- `POST /api/projects` / `GET /api/projects` -- Project CRUD

## Design System

Cruip open-react-template 기반 (Next.js + Tailwind CSS 다크 테마).
커스텀 CSS 오버라이드 최소화, Cruip 원본 디자인 유지.

## Secrets (wrangler secret put)

GEMINI_API_KEY (routed through Seoul-pinned Supabase Edge proxy to bypass HKG colo block)

## Approval

Auto: file ops, bash, packages, build/test, safe git, MCP, browser
Block: `rm -rf`, `mkfs`, `dd`, `curl|bash`, `push --force`, `DROP`, `npm publish`
Confirm: production deploy, payment/auth, bulk delete, API keys

> TODO: `docs/TODO.md` | Handoff: `docs/handoff.md`
