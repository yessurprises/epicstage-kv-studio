# Post Phase-B 로드맵 (Phase C ~ G)

> Phase A·B(카탈로그 단순화 + OpenAI 분기 위젯 5종)는 완료됨.
> 이 문서는 그 이후 작업을 **순차 Phase**로 다시 묶어 관리한다.
> 모든 Phase는 본 로드맵에 추가만 되며, 결정/완료 사항은 각 Phase 섹션에 인라인으로 기록한다.
>
> 결정·환산 출처:
> - Phase B 결과 → `gpt-image-2-catalog-spec.md` (legacy 보류 3건은 8-1/8-5/8-6으로 이관)
> - 명찰 mm 실측 → 본 문서 Phase E

---

## 진행 상태 요약

| Phase | 주제 | 상태 | 비고 |
|---|---|---|---|
| **C** | 생성 이미지 2차 수정 (사각형 좌표 + 지시문) | 📐 plan only | 두 provider 모두 지원, B안(좌표-텍스트) |
| **D** | #41 브로셔 — 텍스트 기반 멀티 필드 입력 | 📐 plan only | 타임라인까지 텍스트로 prompt에 박아 GPT Image 2가 양식 결정 |
| **E** | 명찰·명패 실측 mm 확정 | ✅ 즉시 반영 가능 (수치만 갱신) | 본 문서 Phase E 표 참조 |
| **F** | `bulkCsvOverlay` — CSV 일괄 명찰/명패 파이프라인 | 📐 plan only | 별도 제품 기능, 1~2주 |
| **G** | #66 SNS 카드뉴스 (다중 슬라이드) | 📐 plan only | 별도 프로젝트, 기획 재시작 필요 |
| **H** | #75 EDM 초청장 (이메일 매체 재설계) | 📐 plan only | 별도 프로젝트 |

`physicalSizeMm` vs `customSize` 정리(구 8-3): Phase E 부속 결정. 본 문서 Phase E 하단 참조.

---

## Phase C — 생성 이미지 2차 수정 (rectangle + 지시문 → LMM 재호출)

### C-1. 목적
Step 4에서 생성된 이미지를 보고 "여기 빨간 박스 안 글자만 더 크게", "이 영역의 색만 보라색으로" 같은 **국소 수정**을 빠르게 반복할 수 있게 한다. 마스크 기반 inpainting은 정밀하지만 UI/구현 부담이 크므로, **B안 — 좌표·지시문을 prompt에 텍스트로 박아 LMM이 그 영역을 다시 그리게 하는 방식**을 채택한다(정밀도는 떨어지지만 두 provider 동일 코드 경로).

### C-2. UX 흐름
1. Production 카드의 결과 이미지 위에 "수정" 버튼.
2. 클릭하면 이미지 위에 **드래그로 사각형 1~N개 그릴 수 있는 오버레이**가 뜬다.
3. 각 사각형마다 **수정 지시문 입력**(짧은 자연어, 예: "이 영역 글자만 더 크게").
4. "재생성" 누르면 새 production 카드를 생성(원본은 보존, 새 버전이 옆에 붙음).

### C-3. 데이터 모델
```ts
interface EditRegion {
  // 픽셀 좌표 — 표시 해상도가 아닌 원본 이미지 해상도 기준
  x: number;
  y: number;
  width: number;
  height: number;
  instruction: string;
}

interface ProductionEditRequest {
  sourceProductionId: string;
  regions: EditRegion[];
  /** 전체에 대한 수정 지시 (영역 외 변경) — 옵션 */
  globalInstruction?: string;
}
```

기존 `Production` 타입에 `parentId?: string`(원본 추적용) + `editRegions?: EditRegion[]`(이력) 추가.

### C-4. 프롬프트 합성 (양 provider 공통)
원본 production의 `imagePrompt` + 다음 블록을 append:

```
=== EDIT INSTRUCTIONS ===
The attached image is the current artwork. Modify only the listed rectangular regions; preserve the rest pixel-for-pixel where possible.
Region 1 at (x=120px, y=440px, width=300px, height=160px): "이 영역 글자만 더 크게"
Region 2 at (x=...): "..."
Global: "(globalInstruction이 있으면)"
Output the full modified image at the same dimensions.
```

원본 production 이미지를 reference로 첨부:
- **OpenAI**: `/v1/images/edits` 엔드포인트 + `image` 파라미터로 원본 첨부 (mask 없이 호출, 좌표는 prompt 텍스트로만 전달)
- **Gemini**: `inlineData`로 원본 이미지 첨부, 같은 prompt

### C-5. 파일 변경 범위
- `components/studio/types.ts` — `EditRegion`, `Production.parentId`, `Production.editRegions`
- `components/studio/generation/api/production-image.ts` — `regenerateProductionImage(request)` dispatcher 신설
- `components/studio/generation/api/production-image-openai.ts` — edits 엔드포인트 호출 분기
- `components/studio/production-card.tsx` — 수정 버튼 + 오버레이 컴포넌트
- 신규 `components/studio/edit-overlay.tsx` — 사각형 드래그 + 지시문 입력
- `components/studio/use-store.ts` — `addProductionVariant(parentId, ...)` 액션

### C-6. 구현 위험
- 사각형 좌표를 화면 표시 해상도 → 원본 해상도로 정확히 환산해야 한다 (이미지 `naturalWidth/Height` 기준).
- B안의 한계: LMM이 "그 영역만" 정확히 다시 그리지 않을 수 있다 — 실제 사용 후 결과 보면서 prompt 문구를 튜닝.
- OpenAI edits는 PNG 입력만 받음 — 원본이 JPEG이면 변환 필요.

---

## Phase D — #41 브로셔 (A4 2단 접지)

### D-1. 채택 방향 (사용자 확정)
**Option B 변형**: 표지 + 내지 정보(타임라인·세션·연사 목록)를 **모두 prompt 텍스트로 박아** GPT Image 2에게 양식까지 맡긴다. 코드 측 오버레이 없음.

### D-2. 카탈로그 등록
- ID 신규: `C30` (혹은 다음 ID), `name: "브로셔 (A4 2단 접지)"`, `ratio: "1.414:1"`
- 플래그: `customTextUI` + 신규 `multilineTextUI` (textarea 다중 입력)
- `extraConstraints` 예: "이 산출물은 A4 2단 접지 브로셔의 펼친 내지 한 면이다. 좌측 패널은 행사 개요/일정 표, 우측 패널은 세션·연사 목록을 양식 자유롭게 디자인해 텍스트 그대로 렌더하라."

### D-3. UI (plan-item-card에 추가)
브로셔 카드만 보이는 추가 textarea 3종:
- "행사 개요" — 자유 텍스트
- "타임라인" — 줄바꿈 단위로 시간/세션명 (예: `09:00 등록\n09:30 키노트 ...`)
- "세션·연사" — 줄바꿈 단위로 항목

저장 시 `userInput.multilineFields = { overview, timeline, speakers }` 형태로 저장.

### D-4. 프롬프트 합성
`buildTexts()` 외에, 브로셔(C30) 한정 분기에서 `multilineFields` 값을 `Text:` 섹션에 다음 형태로 주입:

```
Text (render EXACTLY and ONLY these, verbatim):
  - HEADLINE (Korean): "..."
  - OVERVIEW (Korean, multi-paragraph):
      "..."
  - TIMELINE (Korean, render as a 2-column table or aligned list):
      09:00  등록 및 명찰 수령
      09:30  개회사
      ...
  - SPEAKERS (Korean, render as a card grid or list):
      ...
```

`extraConstraints`에 "타임라인은 시간이 좌측 정렬되도록 표/리스트로 렌더, 세션·연사는 카드 그리드 또는 정돈된 리스트로 렌더, 양식은 GPT가 디자인 결정"을 추가.

### D-5. 파일 변경 범위
- `types.ts` — `ProductionUserInput.multilineFields?: Record<string, string>`, `CatalogItem` 신규 플래그 `multilineTextUI?: string[]` (필드 키 배열)
- `constants.ts` — C30 엔트리 추가 (`multilineTextUI: ["overview","timeline","speakers"]`)
- `production-image-openai.ts` — `buildTexts()`에 multilineFields 주입 분기
- `plan-item-card.tsx` — `multilineTextUI` 키 배열을 받아 textarea 동적 생성
- 라벨 한국어 매핑 테이블(constants에 같이 둠)

### D-6. 검증
- 첫 호출 결과 보고 prompt 문구(특히 "양식은 자유" vs "표 정렬 강제") 튜닝.
- GPT Image 2가 한글 다중 라인 표를 깨뜨리는 빈도가 높으면 D-7로 진행.

### D-7. 폴백 (검증 실패 시)
배경만 GPT Image 2로 + 타임라인 표는 코드(Canvas)로 오버레이. Phase F의 `bulkCsvOverlay` 인프라를 그대로 재사용.

---

## Phase E — 명찰·명패 실측 mm 확정 (즉시 반영)

### E-1. 한국 시장 조사 결과 (검색 기준 — 출처는 본 응답 Sources)

**카드형 (C17)**: ISO/IEC 7810 ID-1 카드 표준 = **86 × 54 mm**. 일반 사원증·국제 표준 ID 케이스 그대로. 현재 값 OK.

**가로형 명찰 케이스 (C18) — 한국 일반 등급**

| 등급 | 외부 케이스 | 내지(인쇄물) |
|---|---|---|
| 소형(S) | 77 × 52 | 약 70 × 45 |
| 중형(M) | 90 × 62 | 약 85 × 55 |
| **대형(L) — 가장 흔한 컨퍼런스 가로형** | **110 × 72** | **약 100 × 65** |
| 가로형 별형 | 96 × 65 | 약 90 × 58 |

**세로형 명찰 케이스 (C19) — 한국 컨퍼런스 표준**

| 등급 | 외부 케이스 | 내지(인쇄물) |
|---|---|---|
| 세미나 세로 | 약 105 × 132 | **95 × 122** |
| **미디어 세로 — 가장 흔한 컨퍼런스 세로형** | 약 105 × 135 | **95 × 125** |
| 그랜드 세로 | 약 132 × 154 | 122 × 144 |
| 관광 세로 | 약 125 × 160 | 115 × 150 |

**명패 (C20)**: 좌석 명패 약 200 × 80 mm, 심사위원/연사 명패 약 200 × 125 mm. 통합 엔트리 기본값은 **200 × 100 mm**(중간값) 추천하고, `customRatio`로 현장 조정.

### E-2. 적용 (constants.ts 수정안)

| ID | 현재 | 권장 | 비고 |
|---|---|---|---|
| C17 | 86 × 54 | **유지** | ISO ID-1 |
| C18 | 100 × 70 | **100 × 65** | 가로형 대형(L) 내지 기준 |
| C19 | 70 × 100 | **95 × 125** | 미디어 세로 내지 기준 (현재값은 너무 작음) |
| C20 | 200 × 125 | **200 × 100** | 좌석/심사위원 중간값. customRatio로 조정 |

> 주의: `physicalSizeMm`은 **내지(인쇄물)** 기준이지 케이스 외부가 아니다. AI가 만드는 건 인쇄물이므로 내지 mm가 맞다.

### E-3. `physicalSizeMm` vs `customSize` 정리 (구 8-3 결정)

| 필드 | 의미 | 적용 아이템 | UI |
|---|---|---|---|
| `physicalSizeMm` | **카탈로그 고정** mm — 한국 인쇄 표준 규격, 운영자가 바꿀 일이 거의 없음 | 명찰(C17~C19), 명패(C20) | **숨김**(고정값) |
| `customSize` | **사용자 지정** mm — 현장마다 사이즈가 다른 아이템 | 안내 POP(C15), X배너(C12) | **노출**(width/height 입력) |

**결론**: 두 필드는 **분리 유지**. 통합하지 않는다. 이유:
1. UI 노출 여부가 다르다 (고정 vs 편집).
2. 우선순위 충돌 시 `customSize`(사용자 입력)가 `physicalSizeMm`(카탈로그)을 덮어쓰지 않도록 분리 표현이 명확함 — 명찰처럼 규격이 본질인 아이템에 사용자가 임의 사이즈를 넣으면 인쇄 파이프라인이 깨짐.
3. 프롬프트 빌더 측 처리는 이미 `physicalSizeMm ?? userInput?.customSize ?? catalog?.customSize` 우선순위로 동일 출력으로 합쳐진다.

별도 작업 불필요. 본 결정을 `gpt-image-2-catalog-spec.md`에도 반영(섹션 8-3 → "분리 유지로 확정"으로 갱신).

### E-4. 즉시 반영 작업
- [ ] `constants.ts` C18·C19·C20의 `physicalSizeMm` 값 갱신
- [ ] 스펙 문서 섹션 8-4·8-3 닫기

---

## Phase F — `bulkCsvOverlay` (CSV 일괄 명찰/명패 파이프라인)

### F-1. 목적
참가자 100명 이상 행사에서 명찰을 한 장씩 생성하면 의미가 없다. 템플릿 1장만 LLM으로 생성하고, **이름·직함은 코드로 일괄 오버레이**.

### F-2. 흐름
1. 카탈로그에서 명찰/명패 선택 → 템플릿 1장 생성 (Step 4 본체와 동일).
2. **safeZone 픽셀 좌표** 입력(또는 카탈로그 기본값) — "이름이 들어갈 자리".
3. CSV 업로드 (컬럼: `name, title, org` 등 아이템별 스키마).
4. 서버에서 행마다 템플릿 복제 + safeZone 좌표에 한글 폰트 렌더.
5. ZIP 다운로드 또는 인쇄용 PDF(A4 페이지당 N장).

### F-3. 데이터 모델
- `CatalogItem.csvSchema?: Array<{ key, label, required?: boolean }>` — 아이템별 CSV 컬럼 정의
- 신규 모듈 `components/studio/bulk-overlay/`:
  - `csv-parser.ts` — Papaparse 기반 파싱·검증
  - `font-loader.ts` — Pretendard / Noto Sans KR 내장
  - `renderer.ts` — `@napi-rs/canvas` (서버) 또는 클라이언트 OffscreenCanvas

### F-4. UI
- production-card에 "대량 제작" 액션 버튼 (catalog의 `bulkCsvOverlay`가 true일 때만 노출).
- 클릭 → 모달:
  - safeZone 픽셀 좌표 편집 (Phase C 사각형 UI 재사용)
  - CSV 파일 드래그
  - 첫 3행 미리보기
  - "전체 N명 일괄 생성" 버튼

### F-5. 출력 옵션
- 개별 PNG ZIP
- A4 인쇄용 PDF (8장/면 또는 10장/면 자동 배치)
- 디지털 단일 PNG 시리즈

### F-6. 파일 변경 범위 (예상)
- `types.ts` — `csvSchema`, `BulkRenderRequest`
- `constants.ts` — C17~C20에 `csvSchema` 추가
- 신규 `components/studio/bulk-overlay/*`
- `app/api/bulk-render/route.ts` — 서버 사이드 일괄 렌더 엔드포인트
- 폰트 파일 `public/fonts/Pretendard-*.ttf`

### F-7. 외부 의존성
- `papaparse`
- `@napi-rs/canvas` 또는 `sharp`
- `pdf-lib` (PDF 출력 시)

### F-8. 우선순위
Phase E(실측 mm) 직후. 예상 1~2주.

---

## Phase G — #66 SNS 카드뉴스 (다중 슬라이드)

### G-1. 본질
인스타 카드뉴스는 **N장(3~10장) 슬라이드 시퀀스**. 단일 production 모델로는 표현 불가. 이는 카탈로그 플래그 추가가 아니라 **별도 제품 기능**이다.

### G-2. 데이터 모델
```ts
interface SlideSeries {
  id: string;
  versionId: string;            // 어느 Step 2 버전에서 파생
  title: string;
  ratio: "4:5" | "1:1" | "9:16";
  slides: Slide[];
}

interface Slide {
  id: string;
  num: number;
  role: "cover" | "body" | "cta";
  headline?: string;
  subtext?: string;
  imagePrompt?: string;
  imageUrl?: string;
  status: ProductionStatus;
}
```

### G-3. 일관성 엔진
첫 슬라이드(표지) = KV 기반 마스터로 생성 → 이후 슬라이드는 **첫 슬라이드 결과를 reference로 체이닝**:
- OpenAI: 매 슬라이드 호출에 첫 슬라이드를 ref로 첨부
- Gemini: 같음 (inlineData)
- 추가로 `design-system-openai.ts` 출력을 강제 락 (palette/typography 변동 금지)

### G-4. UI 신설 화면
경로: `/studio/cardnews/[seriesId]`
- 좌측: 슬라이드 트랙 (썸네일 N개, 추가/삭제/순서 변경)
- 우측: 선택 슬라이드 편집 (role, H/S, prompt)
- 상단: "전체 일괄 생성" / "1장씩 생성" 토글
- 비용 표시: "예상 호출 N회 — 약 $X"

### G-5. 출력
- 개별 PNG ZIP
- 인스타 캐러셀 미리보기 (스와이프 시뮬레이션)
- 시리즈 캐러셀 GIF (옵션)

### G-6. 파일 변경 범위
- 신규 `app/studio/cardnews/[seriesId]/page.tsx` 등 라우트 일체
- 신규 `components/studio/cardnews/*`
- `types.ts` — SlideSeries / Slide
- `use-store.ts` — slide series CRUD
- 신규 `generation/api/cardnews-image.ts` — reference 체이닝 호출 래퍼

### G-7. 우선순위 / 위험
- Phase F 이후. 별도 기획 검토 필요.
- 위험: 슬라이드 일관성이 reference 체이닝만으로 충분치 않을 수 있음 — 필요 시 첫 슬라이드를 background로 강제하고 텍스트만 변경하는 "동일 배경 시리즈" 모드 추가.

---

## Phase H — #75 EDM 초청장 (이메일 매체 재설계)

### H-1. 본질
EDM은 단순 이미지가 아니라 **이미지 + HTML 오버레이 + 개별화 + 다크모드**가 얽힌 매체. Step 4 카탈로그 1엔트리로 다루는 건 무리.

### H-2. 매체 결정 (선택지)
- **(a) 단일 이미지 EDM**: 가장 단순. Gmail/Outlook 호환은 이미지로만 처리. CTA는 이미지 위 `<a>` 영역으로.
- **(b) 하이브리드 (권장)**: 배경·비주얼은 이미지(GPT Image 2), CTA·날짜·장소는 HTML 텍스트로 오버레이. 다크모드 대응·접근성 양호.

H-2 (b)로 가정하고 이하 설계.

### H-3. 데이터 모델
```ts
interface EdmTemplate {
  id: string;
  versionId: string;
  ratio: "1:1" | "4:5";
  bgImagePrompt: string;    // GPT Image 2로 생성할 배경
  bgImageUrl?: string;
  fields: {
    title: string;
    date: string;
    venue: string;
    ctaLabel: string;
    ctaUrl: string;
  };
  ctaSafeZone: SafeZoneBox;  // 이미지 내 CTA 자리 픽셀 좌표
}
```

### H-4. 출력
- HTML 이메일 (이미지 + 절대 위치 CTA 버튼)
- 개별화: `{{name}}` 머지 태그 → Phase F 인프라 재사용
- 미리보기: Gmail / Outlook / 모바일 / 다크모드 4개 뷰

### H-5. 파일 변경 범위
- 신규 `app/studio/edm/[templateId]/page.tsx`
- 신규 `components/studio/edm/*`
- `generation/api/edm-bg.ts` — 배경 이미지 단독 생성 (CTA safeZone 강제)
- HTML 생성기 + 다크모드 CSS

### H-6. 우선순위
Phase G와 같은 후순위. Phase F의 머지 인프라 완성 후 착수가 효율적.

---

## 변경 이력

- 2026-04-24 — Phase B 완료 직후 작성. C/D/E/F/G/H로 재번호. legacy 보류 3건(8-1/8-5/8-6)을 D/G/H로 이관, 8-3/8-4를 E로 흡수.
