# GPT Image 2 — Step 4 프롬프트 리팩토링 계획

> Step 4(바리에이션 생성)의 OpenAI 분기를 Gemini식 프롬프트에서 GPT Image 2 전용 프롬프트로 전환. 기존 파일 수정 최소화, OpenAI 전용 파일 신설.

---

## 1. 배경

현재 `components/studio/generation/` 밑의 프롬프트 빌더는 Gemini(Nano Banana 2) 기준으로 작성됨. OpenAI GPT Image 2 분기는 동일 프롬프트를 `buildOpenAiPrompt`로 얇게 감싸서 재사용 중이나, 내용이 Gemini식(장문 산문, 무드 형용사, 역할 레이블 부재)이라 GPT Image 2 강점(정확 텍스트 렌더링, 구조화 프롬프트 반응성)을 살리지 못함.

---

## 2. 원칙

1. 기존 파일 수정 최소화 — OpenAI 블록만 디스패처로 교체
2. OpenAI 전용 로직은 신규 파일에 격리
3. Gemini 경로 무회귀 보장
4. V1(`buildOpenAiPrompt`)은 당분간 공존 — A/B 비교 후 제거

---

## 3. 파일 구조

```
components/studio/generation/
├── prompts.ts                         [유지]
├── prompts-openai.ts                  [신규]
├── design-system.ts                   [유지]
├── design-system-openai.ts            [신규]
└── api/
    ├── production-image.ts            [디스패처만 수정]
    ├── production-image-openai.ts     [신규]
    ├── master-kv.ts                   [디스패처만 수정]
    └── master-kv-openai.ts            [신규]
```

---

## 4. 파일 상세

### 4-1. `prompts-openai.ts` (신규)

- `buildProductionPromptOpenAI(input)` — Step 4 바리에이션 템플릿
- `buildMasterKvPromptOpenAI(input)` — Step 3 마스터 KV 템플릿
- `BASELINE_CONSTRAINTS_OPENAI` — 한글 필러 금지, 중복 텍스트 금지, verbatim-only 포함

**템플릿 구조** (OpenAI Cookbook 기준):

```
Artifact: {포스터/현수막/티켓…}
Use case: {한국 행사 키 비주얼}
Scene: {배경·조명·분위기 — 시각 사실만}
Subject: {핵심 시각 주제}
Design system:
  - Palette: {hex}
  - Motif: {시각 모티프 1개}
  - Mood: {구체 단어 2–3개}
  - Typography mood: {두께/비율}
Text (render EXACTLY and ONLY these):
  - Korean headline: "..."
  - Latin date: "..."
Layout: {구도 방향, 여백}
Constraints: {불릿 제약}
```

---

### 4-2. `design-system-openai.ts` (신규)

- `extractDesignSystemForOpenAI(guideline): { palette, motif, mood, typographyMood }` — 구조화 객체 반환
- 기존 `extractDesignSystemForProduction`(산문 블록)은 Gemini 전용화

---

### 4-3. `api/production-image-openai.ts` (신규)

- `generateProductionImageOpenAI(guideline, prod, masterKvUrl, refAnalysis, ciBrief, resolution): Promise<string>`
- 현재 `production-image.ts` 132–189 라인 로직 이관
- 내부에서 V2 프롬프트 빌더 호출, `resolveRatio`, `openai.generate`까지 완결

**변경 포인트**:
1. `designSystem` 산문 → 구조화 객체
2. 무드 형용사(stunning, premium 등) 제거, 시각 사실만
3. 텍스트 블록에 스크립트 라벨(`Korean headline:`, `Latin date:`)
4. "한글 필러 금지" 제약 추가
5. Reference 역할 명시 강화 — `Image 1: Master KV. Apply palette/motif; recompose for new aspect.`
6. `PRINT_SPEC_INSTRUCTION` 문단 → 불릿 분해

---

### 4-4. `api/master-kv-openai.ts` (신규)

- `generateMasterKVOpenAI(guideline, ratio, kvName, refAnalysis, guideImages, overridePrompt, ciBrief, resolution): Promise<string>`
- `master-kv.ts` 194–231 라인 로직 이관
- `buildMasterKvOpenAiPrompt`도 여기(또는 `prompts-openai.ts`)로 이동

---

### 4-5. 기존 파일 수정 (디스패처화)

**`production-image.ts`** — OpenAI 블록(132–189)을 1줄 호출로 축소:

```ts
if (provider === "openai") {
  return generateProductionImageOpenAI(
    guideline, prod, masterKvUrl, refAnalysis, options?.ciBrief,
    (prod.imageSize as ImageSize) ?? "2K"
  );
}
```

Gemini 분기(191–237)는 완전 무변경. `master-kv.ts`도 동일 패턴.

---

## 5. 적용 순서

1. `prompts-openai.ts` + `design-system-openai.ts` 생성 (순수함수)
2. 스냅샷 테스트 추가
3. `production-image-openai.ts` 생성
4. `production-image.ts` 디스패처화
5. `master-kv-openai.ts` 생성 + `master-kv.ts` 디스패처화
6. `tsc` + `vitest` 통과 확인
7. 고위험 5종(1:1 포스터, 5:1 현수막, 9:16 세로, 명함, 티켓) A/B 생성 비교

---

## 6. 변경 사항 요약

| 항목 | Before (Gemini식) | After (GPT Image 2식) |
|---|---|---|
| Design system | 산문 블록 | `{palette, motif, mood, typographyMood}` 객체 |
| 무드 형용사 | "stunning, premium, bold" 다수 | 시각 사실만 ("overcast daylight", "heavy sans-serif") |
| 텍스트 블록 | `{label, value}` | `{role, script, value}` — Korean/Latin 분리 |
| 제약 | 문단 형태 | 불릿 리스트, 한글 필러 금지 포함 |
| Reference 역할 | `Master KV — preserve palette` | `Image 1: Master KV. Apply palette/motif; recompose.` |
| Font 지정 | 폰트명 | 두께/비율 묘사 |
| Aspect ratio 서술 | 프롬프트에 명시 | `size` 파라미터로만 |

---

## 7. 리스크 & 대응

- **회귀 리스크**: Gemini 분기 무변경 → 리스크 0
- **OpenAI 품질 회귀**: V1(`buildOpenAiPrompt`) 1주일 공존 → 문제 시 즉시 롤백
- **테스트**: 신규 순수함수 스냅샷, 통합은 `openai.generate` mock 캡처로 최종 프롬프트 검증

---

## 8. 참고

- [OpenAI Cookbook — Image Gen Prompting Guide](https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide)
- [fal.ai — GPT Image 2 Prompting](https://fal.ai/learn/tools/prompting-gpt-image-2)
- [Segmind — GPT Image 2 Multilingual Text](https://blog.segmind.com/gpt-image-2-is-now-on-segmind-multilingual-text-that-actually-renders/)
- [OpenAI Community — Tips & Bugs](https://community.openai.com/t/collection-of-gpt-image-generator-2-0-prompting-tips-issues-and-bugs/1379535)
