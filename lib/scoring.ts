import type { Business, InsufficientItemSchema } from "@/lib/schema";
import type { z } from "zod";

type InsufficientItem = z.infer<typeof InsufficientItemSchema>;

/**
 * 仕様変更（docs/spec.md 6章）：充足率スコアを「AIの自己申告」から、
 * 8カテゴリ・配点100点の客観採点に切り替えた。属人性をなくすため、
 * スコアと必須ゲート判定は AI の出力をそのまま信用せず、この
 * ファイルが insufficient_items から決定的に算出し、サーバー側で
 * 上書きする（app/api/interview/chat/turn, process の各ルートで
 * applyDeterministicScoring を呼ぶ）。
 *
 * カテゴリ内に複数項目がある場合（例：実施時期と期限＝頻度＋期限）は、
 * 配点をその項目数で均等に按分し、不足していない項目の分だけ加点する。
 */
export interface ScoreCategory {
  key: string;
  label: string;
  weight: number;
  items: InsufficientItem[];
}

export const SCORE_CATEGORIES: ScoreCategory[] = [
  { key: "purpose", label: "業務の目的と範囲", weight: 10, items: ["purpose", "trigger"] },
  { key: "timing", label: "実施時期と期限", weight: 15, items: ["frequency", "deadline"] },
  { key: "steps", label: "手順の再現性", weight: 20, items: ["steps"] },
  { key: "deliverables", label: "成果物と保存場所", weight: 15, items: ["deliverables"] },
  { key: "stakeholders", label: "役割と承認ルート", weight: 15, items: ["stakeholders"] },
  { key: "judgment", label: "判断基準", weight: 10, items: ["judgment"] },
  { key: "exception", label: "例外・事故対応", weight: 10, items: ["exception", "failure"] },
  { key: "access_handover", label: "権限移管", weight: 5, items: ["access_handover"] },
];

/**
 * 必須ゲート（改善方針12章）：重要業務でこれらのいずれかが未確認の場合、
 * 総合点にかかわらず「引継未完了」と判定する。
 * 「承認者・決議機関」「実務担当者・提出者」は stakeholders 項目でまとめて判定する
 * （AIが承認者検出のクロスチェックを行っているため）。
 */
const MANDATORY_GATE_ITEMS: { item: InsufficientItem; label: string }[] = [
  { item: "deadline", label: "期限" },
  { item: "stakeholders", label: "承認者・実務担当者" },
  { item: "deliverables", label: "成果物の保存場所" },
  { item: "systems", label: "システム権限" },
  { item: "failure", label: "緊急時の初動と連絡先" },
];

/** 1業務分の insufficient_items から、カテゴリごとの充足率スコア（0〜100の整数）を算出する。 */
export function computeBusinessScore(insufficientItems: InsufficientItem[]): number {
  let earned = 0;
  for (const category of SCORE_CATEGORIES) {
    const perItem = category.weight / category.items.length;
    for (const item of category.items) {
      if (!insufficientItems.includes(item)) earned += perItem;
    }
  }
  return Math.round(earned);
}

/** 1業務分の insufficient_items から、必須ゲート未達の項目名（日本語ラベル）を算出する。 */
export function computeMandatoryGateMissing(insufficientItems: InsufficientItem[]): string[] {
  return MANDATORY_GATE_ITEMS.filter((g) => insufficientItems.includes(g.item)).map((g) => g.label);
}

/**
 * AIから返ってきた businesses 配列の score / mandatory_gate_missing を、
 * insufficient_items から決定的に算出した値で上書きする。
 * チャット版・バッチ版どちらも、完了時にこれを通してから保存すること。
 */
export function applyDeterministicScoring<T extends Pick<Business, "insufficient_items">>(
  businesses: T[]
): (T & { score: number; mandatory_gate_missing: string[] })[] {
  return businesses.map((b) => ({
    ...b,
    score: computeBusinessScore(b.insufficient_items),
    mandatory_gate_missing: computeMandatoryGateMissing(b.insufficient_items),
  }));
}

/** 全業務が必須ゲートを満たしている場合のみ true（＝納品可能な状態）。 */
export function isHandoverComplete(businesses: Pick<Business, "mandatory_gate_missing">[]): boolean {
  return businesses.every((b) => b.mandatory_gate_missing.length === 0);
}

export interface CategoryBreakdown {
  key: string;
  label: string;
  weight: number;
  /** そのカテゴリの充足率（0〜100の整数）。対象業務が0件の場合は null。 */
  rate: number | null;
}

/**
 * 仕様書8章 画面3「進捗」表示用に、業務横断でのカテゴリ別充足率を算出する。
 * 各カテゴリの充足率＝全業務×対象項目のうち insufficient_items に含まれない割合（％）。
 */
export function computeCategoryBreakdown(businesses: Business[]): CategoryBreakdown[] {
  return SCORE_CATEGORIES.map((category) => {
    if (businesses.length === 0) {
      return { key: category.key, label: category.label, weight: category.weight, rate: null };
    }
    const total = businesses.length * category.items.length;
    let covered = 0;
    for (const business of businesses) {
      for (const item of category.items) {
        if (!business.insufficient_items.includes(item)) covered += 1;
      }
    }
    return {
      key: category.key,
      label: category.label,
      weight: category.weight,
      rate: total === 0 ? null : Math.round((covered / total) * 100),
    };
  });
}

export function computeOverallScore(scores: number[]): number | null {
  if (scores.length === 0) return null;
  const sum = scores.reduce((acc, s) => acc + s, 0);
  return Math.round(sum / scores.length);
}
