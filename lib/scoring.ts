import type { Business, InsufficientItemSchema } from "@/lib/schema";
import type { z } from "zod";

type InsufficientItem = z.infer<typeof InsufficientItemSchema>;

/**
 * 仕様書8章 画面3「進捗」の表示例（業務把握100％、判断基準70％、例外対応40％）に
 * 対応するカテゴリ別充足率を、6.1の重要度分類に基づいて算出する。
 *
 * - 業務把握: 必須確認型のうち頻度・開始条件・具体的手順・関係者・使用ファイル
 * - 判断基準: 有無確認型の「判断ポイント」
 * - 例外対応: 有無確認型の「例外・イレギュラー対応」「失敗時対応」
 *
 * 各カテゴリの充足率 ＝ 全業務×対象項目のうち insufficient_items に含まれない
 * 割合（％）。対象業務が0件の場合は null を返す。
 */
export interface CategoryBreakdown {
  businessGrasp: number | null; // 業務把握
  judgmentCriteria: number | null; // 判断基準
  exceptionHandling: number | null; // 例外対応
}

const BUSINESS_GRASP_ITEMS: InsufficientItem[] = ["frequency", "trigger", "steps", "stakeholders", "systems"];
const JUDGMENT_ITEMS: InsufficientItem[] = ["judgment"];
const EXCEPTION_ITEMS: InsufficientItem[] = ["exception", "failure"];

function categoryRate(businesses: Business[], items: InsufficientItem[]): number | null {
  if (businesses.length === 0) return null;
  const total = businesses.length * items.length;
  if (total === 0) return null;
  let covered = 0;
  for (const business of businesses) {
    for (const item of items) {
      if (!business.insufficient_items.includes(item)) covered += 1;
    }
  }
  return Math.round((covered / total) * 100);
}

export function computeCategoryBreakdown(businesses: Business[]): CategoryBreakdown {
  return {
    businessGrasp: categoryRate(businesses, BUSINESS_GRASP_ITEMS),
    judgmentCriteria: categoryRate(businesses, JUDGMENT_ITEMS),
    exceptionHandling: categoryRate(businesses, EXCEPTION_ITEMS),
  };
}

export function computeOverallScore(scores: number[]): number | null {
  if (scores.length === 0) return null;
  const sum = scores.reduce((acc, s) => acc + s, 0);
  return Math.round(sum / scores.length);
}
