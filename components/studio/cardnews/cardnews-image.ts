// Phase G — 카드뉴스 reference-chained generator. The first slide is generated
// using the master KV as its style anchor; every subsequent slide takes the
// PREVIOUS slide as its reference image, so palette/typography/composition
// stay coherent across the deck.
//
// We deliberately reuse `generateProductionImage` instead of forking the
// pipeline — this keeps provider switching, edit-block handling, and CI/brief
// wiring identical between single productions and cardnews series.

import { generateProductionImage, type ProductionInput } from "../generation";
import type {
  Guideline,
  ImageData,
  ImageProviderId,
} from "../types";

export interface CardNewsSlide {
  index: number;
  headline?: string;
  subtext?: string | null;
  imagePrompt?: string;
  layoutNote?: string;
}

export interface CardNewsJob {
  guideline: Guideline;
  baseProduction: Pick<
    ProductionInput,
    "name" | "ratio" | "category" | "renderInstruction" | "imageSize" | "temperature" | "catalog" | "userInput"
  >;
  slides: CardNewsSlide[];
  /** Master KV URL — used as the reference for slide 1 only. */
  masterKvUrl?: string;
  ciImages?: ImageData[];
  ciBrief?: string;
  refAnalysis?: string;
  provider?: ImageProviderId;
  /**
   * Called after each slide finishes — UI uses this to update progress and
   * thumbnails without waiting for the whole batch to complete.
   */
  onSlideDone?: (slide: { index: number; imageUrl: string }) => void;
  onSlideError?: (slide: { index: number; error: string }) => void;
}

export interface CardNewsResult {
  index: number;
  imageUrl?: string;
  error?: string;
}

/**
 * Generate every slide sequentially. Slide N takes slide N-1 as its KV
 * reference (slide 1 takes the original master KV). Errors on a slide do NOT
 * abort the batch — the failed slide is recorded and we move on with the last
 * known good reference, so a single bad prompt doesn't kill the whole run.
 */
export async function generateCardNewsSeries(job: CardNewsJob): Promise<CardNewsResult[]> {
  const results: CardNewsResult[] = [];
  let chainedRef: string | undefined = job.masterKvUrl;

  for (const slide of job.slides) {
    // Slide 1 carries the original master KV → "kv" mode (palette inheritance,
    // free recomposition). Slides 2+ chain off the previous slide image →
    // "previous-slide" mode forces strict layout/color preservation so the
    // series reads as one coherent deck instead of a style drift.
    const isFollowupSlide = slide.index > 0;
    const prod: ProductionInput = {
      ...job.baseProduction,
      headline: slide.headline,
      subtext: slide.subtext,
      imagePrompt: slide.imagePrompt,
      layoutNote: slide.layoutNote,
    };
    try {
      const imageUrl = await generateProductionImage(
        job.guideline,
        prod,
        job.ciImages,
        chainedRef,
        job.refAnalysis,
        {
          provider: job.provider ?? "gemini",
          ciBrief: job.ciBrief,
          referenceMode: isFollowupSlide ? "previous-slide" : "kv",
        },
      );
      results.push({ index: slide.index, imageUrl });
      chainedRef = imageUrl;
      job.onSlideDone?.({ index: slide.index, imageUrl });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      results.push({ index: slide.index, error });
      job.onSlideError?.({ index: slide.index, error });
    }
  }
  return results;
}
