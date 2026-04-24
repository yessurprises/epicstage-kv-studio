import type { CatalogItem } from "./types";

// KV 전용 (Step 3에서만 사용)
export const KV_RATIOS = [
  { name: "메인 KV (가로)", ratio: "16:9" },
  { name: "메인 KV (세로)", ratio: "3:4" },
  { name: "메인 KV (정사각)", ratio: "1:1" },
] as const;

/**
 * Step 4 variation catalog — 29 entries (C01~C29).
 * Derived from the 84-item review in `docs/gpt-image-2-catalog-spec.md` section 6.
 * Flags listed per entry drive the GPT Image 2 prompt builder and Step 4 UI.
 */
export const MASTER_CATALOG: readonly CatalogItem[] = [
  // === 현장 — 무대 ===
  {
    id: "C01",
    sourceRefs: [1],
    name: "무대 배경",
    ratio: "5:3",
    category: "현장",
    group: "무대",
    displayDistance: "far",
  },
  {
    id: "C02",
    sourceRefs: [2],
    name: "무대 사이드 스크린",
    ratio: "9:16",
    category: "현장",
    group: "무대",
    displayDistance: "far",
    textToggleable: true,
  },
  {
    id: "C03",
    sourceRefs: [3],
    name: "무대 스카시",
    ratio: "5:3",
    category: "현장",
    group: "무대",
    displayDistance: "mid",
    textToggleable: true,
  },
  {
    id: "C04",
    sourceRefs: [4],
    name: "무대 큐브박스",
    ratio: "1:1",
    category: "현장",
    group: "무대",
    displayDistance: "far",
  },

  // === 현장 — 백월·포토월 ===
  {
    id: "C05",
    sourceRefs: [5, 6],
    name: "포토월",
    ratio: "3:2",
    category: "현장",
    group: "백월·포토월",
    displayDistance: "near",
    repeatPattern: true,
    customRatio: true,
  },
  {
    id: "C06",
    sourceRefs: [7],
    name: "리셉션 백월 배너",
    ratio: "3:4",
    category: "현장",
    group: "백월·포토월",
    displayDistance: "mid",
    customTextUI: true,
    customRatio: true,
  },
  {
    id: "C07",
    sourceRefs: [8],
    name: "허니콤 백월",
    ratio: "3:1",
    category: "현장",
    group: "백월·포토월",
    displayDistance: "mid",
    repeatPattern: true,
    customRatio: true,
  },
  {
    id: "C08",
    sourceRefs: [9],
    name: "측면 대형 현수막",
    ratio: "5:3",
    category: "현장",
    group: "백월·포토월",
    displayDistance: "far",
    customTextUI: true,
  },

  // === 현장 — 현수막 ===
  {
    id: "C09",
    sourceRefs: [11, 12, 13],
    name: "현수막 (기본)",
    ratio: "3:1",
    category: "현장",
    group: "현수막",
    displayDistance: "far",
    customTextUI: true,
    customRatio: true,
  },
  {
    id: "C10",
    sourceRefs: [14],
    name: "드롭 현수막 (계단형)",
    ratio: "1:3",
    category: "현장",
    group: "현수막",
    displayDistance: "far",
    customTextUI: true,
    customRatio: true,
  },
  {
    id: "C11",
    sourceRefs: [15],
    name: "기업별 휘장 (족자형)",
    ratio: "1:3",
    category: "현장",
    group: "현수막",
    displayDistance: "mid",
    logoCentric: true,
    customTextUI: true,
  },

  // === 현장 — X배너 ===
  {
    id: "C12",
    sourceRefs: [17, 18],
    name: "X배너",
    ratio: "1:3",
    category: "현장",
    group: "X배너·에어",
    displayDistance: "mid",
    customTextUI: true,
    customRatio: true,
    physicalSizeMm: { widthMm: 600, heightMm: 1800 },
  },

  // === 현장 — POP·보드 ===
  {
    id: "C13",
    sourceRefs: [21],
    name: "포디움 배너 (가로)",
    ratio: "5:3",
    category: "현장",
    group: "POP·보드",
    displayDistance: "near",
    customTextUI: true,
    customRatio: true,
  },
  {
    id: "C14",
    sourceRefs: [24],
    name: "리셉션 하단 보드",
    ratio: "5:3",
    category: "현장",
    group: "POP·보드",
    displayDistance: "near",
    textToggleable: true,
    subtextToggleable: true,
  },
  {
    id: "C15",
    sourceRefs: [25, 26],
    name: "안내 POP",
    ratio: "1:1.414",
    category: "현장",
    group: "POP·보드",
    displayDistance: "near",
    customTextUI: true,
    customSize: { widthMm: 210, heightMm: 297 },
    extraConstraints: [
      "render a keyvisual-style background only; the central area must remain open, low-contrast, and free of competing graphics so operator-supplied callout text composites cleanly",
    ],
  },

  // === 현장 — 사이니지 ===
  {
    id: "C16",
    sourceRefs: [28, 29, 30, 32],
    name: "안내 사이니지 (방향)",
    ratio: "16:9",
    category: "현장",
    group: "사이니지",
    displayDistance: "mid",
    directionSelector: true,
    customTextUI: true,
    customRatio: true,
  },

  // === 인쇄 — 명찰·명패 ===
  {
    id: "C17",
    sourceRefs: [42],
    name: "참가자 명찰 (카드형)",
    ratio: "4:5",
    category: "인쇄",
    group: "명찰·명패",
    displayDistance: "near",
    physicalSizeMm: { widthMm: 86, heightMm: 54 },
    safeZoneRequired: true,
    safeZone: [{ x: 0.06, y: 0.25, width: 0.88, height: 0.55 }],
    customTextUI: true,
    bulkCsvOverlay: true,
    csvSchema: [
      { key: "name", label: "이름", required: true },
      { key: "title", label: "직함" },
      { key: "org", label: "소속" },
    ],
  },
  {
    id: "C18",
    sourceRefs: [43],
    name: "명찰 (가로)",
    ratio: "5:3",
    category: "인쇄",
    group: "명찰·명패",
    displayDistance: "near",
    physicalSizeMm: { widthMm: 100, heightMm: 65 },
    safeZoneRequired: true,
    safeZone: [{ x: 0.06, y: 0.30, width: 0.88, height: 0.55 }],
    customTextUI: true,
    bulkCsvOverlay: true,
    csvSchema: [
      { key: "name", label: "이름", required: true },
      { key: "title", label: "직함" },
      { key: "org", label: "소속" },
    ],
  },
  {
    id: "C19",
    sourceRefs: [44],
    name: "명찰 (세로)",
    ratio: "3:5",
    category: "인쇄",
    group: "명찰·명패",
    displayDistance: "near",
    physicalSizeMm: { widthMm: 95, heightMm: 125 },
    safeZoneRequired: true,
    safeZone: [{ x: 0.10, y: 0.55, width: 0.80, height: 0.40 }],
    customTextUI: true,
    bulkCsvOverlay: true,
    csvSchema: [
      { key: "name", label: "이름", required: true },
      { key: "title", label: "직함" },
      { key: "org", label: "소속" },
    ],
  },
  {
    id: "C20",
    sourceRefs: [45, 46],
    name: "명패",
    ratio: "5:3",
    category: "인쇄",
    group: "명찰·명패",
    displayDistance: "near",
    physicalSizeMm: { widthMm: 200, heightMm: 100 },
    safeZoneRequired: true,
    safeZone: [{ x: 0.07, y: 0.25, width: 0.86, height: 0.55 }],
    customTextUI: true,
    customRatio: true,
    bulkCsvOverlay: true,
    csvSchema: [
      { key: "name", label: "이름", required: true },
      { key: "title", label: "직함" },
      { key: "org", label: "소속" },
    ],
  },

  // === 인쇄 — 카드류 ===
  {
    id: "C21",
    sourceRefs: [47],
    name: "초대장",
    ratio: "5:7",
    category: "인쇄",
    group: "카드류",
    displayDistance: "near",
    customTextUI: true,
    customRatio: true,
  },

  // === 디지털 — 운영 장표 ===
  {
    id: "C22",
    sourceRefs: [59, 60],
    name: "운영 장표",
    ratio: "16:9",
    category: "디지털",
    group: "운영 장표",
    displayDistance: "far",
    customRatio: true,
    safeZoneRequired: true,
    safeZone: [{ x: 0.08, y: 0.10, width: 0.84, height: 0.80 }],
    customTextUI: true,
  },

  // === 디지털 — 이벤터스 ===
  {
    id: "C23",
    sourceRefs: [61],
    name: "이벤터스 썸네일",
    ratio: "16:9",
    category: "디지털",
    group: "이벤터스",
    displayDistance: "mid",
    customTextUI: true,
  },
  {
    id: "C24",
    sourceRefs: [62],
    name: "이벤터스 상단 배너",
    ratio: "3:1",
    category: "디지털",
    group: "이벤터스",
    displayDistance: "mid",
    subtextToggleable: true,
    customTextUI: true,
  },
  {
    id: "C25",
    sourceRefs: [63],
    name: "이벤터스 메인 배너",
    ratio: "21:9",
    category: "디지털",
    group: "이벤터스",
    displayDistance: "mid",
    customTextUI: true,
  },

  // === 디지털 — LED·DID ===
  {
    id: "C26",
    sourceRefs: [64],
    name: "호텔 DID",
    ratio: "9:16",
    category: "디지털",
    group: "LED·DID",
    displayDistance: "far",
    customTextUI: true,
  },
  {
    id: "C27",
    sourceRefs: [65],
    name: "LED 정면 좌우 배너",
    ratio: "1:3",
    category: "디지털",
    group: "LED·DID",
    displayDistance: "far",
    subtextToggleable: true,
    customTextUI: true,
  },

  // === 인쇄 — 브로셔 ===
  {
    id: "C30",
    sourceRefs: [41],
    name: "브로셔 (A4 2단 접지)",
    ratio: "1.414:1",
    category: "인쇄",
    group: "브로셔",
    displayDistance: "near",
    customRatio: true,
    customTextUI: true,
    multilineTextUI: ["overview", "timeline", "speakers"],
    extraConstraints: [
      "이 산출물은 A4 2단 접지 브로셔의 펼친 내지 한 면이다. 좌측 패널은 행사 개요와 일정 표, 우측 패널은 세션·연사 목록을 양식 자유롭게 디자인해 텍스트 그대로 렌더하라.",
      "타임라인은 시간(좌)–세션명(우)으로 정렬된 표 또는 리스트로 렌더, 세션·연사는 카드 그리드 또는 정돈된 리스트로 렌더 — 양식은 GPT가 디자인 결정",
      "여백·폴드 라인을 고려하여 중앙 약 10mm 영역에는 핵심 콘텐츠를 배치하지 말 것",
    ],
  },

  // === 디지털 — SNS ===
  {
    id: "C28",
    sourceRefs: [67],
    name: "인스타그램 피드",
    ratio: "1:1",
    category: "디지털",
    group: "SNS·소셜",
    displayDistance: "near",
    customTextUI: true,
    cardNewsSlides: 3,
  },
  {
    id: "C29",
    sourceRefs: [68, 69],
    name: "인스타 세로",
    ratio: "9:16",
    category: "디지털",
    group: "SNS·소셜",
    displayDistance: "near",
    customTextUI: true,
    subtextToggleable: true,
    cardNewsSlides: 3,
  },

  // === 디지털 — EDM ===
  {
    id: "C31",
    sourceRefs: [75],
    name: "EDM 초청장",
    ratio: "4:5",
    category: "디지털",
    group: "EDM·이메일",
    displayDistance: "near",
    customTextUI: true,
    edmTemplate: true,
    safeZoneRequired: true,
    // 기본 CTA 영역 — 하단 12.5% 높이, 좌우 18.75% 마진의 가로 띠. 운영자가
    // plan-item-card에서 좌표를 덮어쓸 수 있다 (값은 0~1 비율).
    safeZone: [{ x: 0.1875, y: 0.80, width: 0.625, height: 0.125 }],
    extraConstraints: [
      "하단 약 18% 영역(safeZone)을 비워둘 것 — CTA 버튼이 HTML로 절대 위치 합성됨",
      "좌상단·우상단 모서리에는 핵심 시각 요소를 배치하지 말 것 (이메일 클라이언트 다크모드/이미지 차단 시 대체 텍스트 영역)",
    ],
  },
];

export const CATEGORIES = ["전체", "현장", "인쇄", "디지털"] as const;

/**
 * Phase D — Korean labels for `CatalogItem.multilineTextUI` keys. Add a row
 * here when introducing a new multiline field key in any catalog entry.
 */
export const MULTILINE_FIELD_LABELS: Record<string, string> = {
  overview: "행사 개요",
  timeline: "타임라인 (한 줄에 시간·세션 — 예: 09:00 등록)",
  speakers: "세션·연사",
};

export const STYLE_CATEGORIES = [
  "다크+네온", "화이트+미니멀", "우드+내추럴", "일러스트+플랫",
  "그라데이션+모던", "모노크롬", "레트로+빈티지", "럭셔리+골드",
  "테크+디지털", "캐주얼+팝",
] as const;

export const EVENT_TYPES = [
  "세미나", "컨퍼런스", "시상식", "전시", "네트워킹", "교육", "축제",
] as const;

export const SERVICE_TIERS = [
  {
    id: "self" as const,
    name: "셀프",
    desc: "파일만 받아서 직접 처리",
    price: "30~50만원",
    features: ["AI 생성", "업스케일", "레퍼런스 검색", "PPT 생성", "ZIP 다운로드"],
  },
  {
    id: "basic" as const,
    name: "기본",
    desc: "인쇄해서 배달까지",
    price: "80~150만원",
    features: ["AI 생성", "업스케일", "레퍼런스 검색", "PPT 생성", "ZIP 다운로드", "인쇄 제작", "행사장 배달"],
  },
  {
    id: "full" as const,
    name: "풀",
    desc: "리터치부터 설치까지 올인원",
    price: "200~500만원",
    features: ["AI 생성", "업스케일", "레퍼런스 검색", "PPT 생성", "ZIP 다운로드", "인쇄 제작", "행사장 배달", "디자이너 리터치", "현장 설치/철거"],
  },
] as const;
