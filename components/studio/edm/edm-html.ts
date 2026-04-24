// Phase H — EDM HTML generator. Hybrid email layout: the production image is
// embedded as a max-width hero, and a CTA button is overlaid at the catalog's
// `safeZone` rectangle (0~1 fractions of the canvas, emitted as CSS %). The
// HTML uses table-based layout plus a `<style>` block for media-query-based
// dark mode.

import type { SafeZoneBox } from "../types";

export interface EdmFields {
  title: string;
  date: string;
  venue: string;
  ctaLabel: string;
  ctaUrl: string;
  /** Optional preheader — short snippet shown in inbox preview list. */
  preheader?: string;
}

export interface EdmHtmlInput {
  imageDataUrl: string;
  /** CTA placement as a fraction (0~1) of the hero image area. */
  ctaSafeZone: SafeZoneBox;
  fields: EdmFields;
  /** Optional individualization placeholder, e.g. `{{name}}님께`. */
  greeting?: string;
}

function escape(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * SafeZone is already stored as 0~1 fractions in the catalog/operator override,
 * so emitting CSS percentages is just a `* 100` — the CTA stays anchored to the
 * same visual region regardless of which client scales the hero image.
 */
function safeZoneToPercent(box: SafeZoneBox) {
  return {
    leftPct: box.x * 100,
    topPct: box.y * 100,
    widthPct: box.width * 100,
    heightPct: box.height * 100,
  };
}

export function buildEdmHtml(input: EdmHtmlInput): string {
  const { imageDataUrl, ctaSafeZone, fields, greeting } = input;
  const cta = safeZoneToPercent(ctaSafeZone);
  const preheader = fields.preheader?.trim() ?? `${fields.title} — ${fields.date}`;

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escape(fields.title)}</title>
<style>
  body { margin: 0; padding: 0; background: #f4f4f6; font-family: 'Pretendard', 'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; color: #111; }
  .preheader { display:none !important; visibility:hidden; opacity:0; height:0; width:0; overflow:hidden; mso-hide:all; }
  .container { width: 100%; max-width: 600px; margin: 0 auto; background: #ffffff; }
  .hero-wrap { position: relative; width: 100%; }
  .hero-img { display: block; width: 100%; height: auto; }
  .cta-overlay {
    position: absolute;
    left: ${cta.leftPct.toFixed(2)}%;
    top: ${cta.topPct.toFixed(2)}%;
    width: ${cta.widthPct.toFixed(2)}%;
    height: ${cta.heightPct.toFixed(2)}%;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .cta-btn {
    display: inline-block;
    padding: 14px 28px;
    font-size: 15px;
    font-weight: 700;
    color: #ffffff;
    background: #111111;
    text-decoration: none;
    border-radius: 8px;
    box-shadow: 0 6px 16px rgba(0,0,0,0.22);
  }
  .info { padding: 20px 24px; line-height: 1.55; }
  .info h2 { margin: 0 0 8px; font-size: 18px; }
  .info p { margin: 4px 0; font-size: 14px; color: #333; }
  .footer { padding: 16px 24px 24px; font-size: 11px; color: #888; text-align: center; }
  @media (prefers-color-scheme: dark) {
    body, .container { background: #0b0b0e !important; color: #e8e8ea !important; }
    .info p { color: #c8c8cc !important; }
    .info h2 { color: #ffffff !important; }
    .cta-btn { background: #ffffff !important; color: #111 !important; }
    .footer { color: #6a6a72 !important; }
  }
  /* Outlook fallback — cannot honor absolute positioning; show CTA below */
  /*[if mso]>
  .cta-overlay { display: none !important; }
  .cta-fallback { display: block !important; }
  <![endif]*/
  .cta-fallback { display: none; }
</style>
</head>
<body>
<div class="preheader">${escape(preheader)}</div>
<table role="presentation" class="container" cellpadding="0" cellspacing="0" border="0" width="100%">
  <tr>
    <td>
      <div class="hero-wrap">
        <img class="hero-img" src="${imageDataUrl}" alt="${escape(fields.title)}" width="600" />
        <div class="cta-overlay">
          <a class="cta-btn" href="${escape(fields.ctaUrl)}">${escape(fields.ctaLabel)}</a>
        </div>
      </div>
      <div class="cta-fallback" style="padding:16px 24px; text-align:center;">
        <a href="${escape(fields.ctaUrl)}" style="display:inline-block; padding:14px 28px; font-size:15px; font-weight:700; color:#fff; background:#111; text-decoration:none; border-radius:8px;">${escape(fields.ctaLabel)}</a>
      </div>
      <div class="info">
        ${greeting ? `<p style="font-size:13px;color:#666;">${escape(greeting)}</p>` : ""}
        <h2>${escape(fields.title)}</h2>
        <p><strong>일시</strong> · ${escape(fields.date)}</p>
        <p><strong>장소</strong> · ${escape(fields.venue)}</p>
      </div>
      <div class="footer">
        본 메일은 발신 전용입니다. 수신을 원하지 않으시면 수신거부를 클릭해 주세요.
      </div>
    </td>
  </tr>
</table>
</body>
</html>`;
}
