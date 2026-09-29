import type { Business } from "@/lib/schema";

/**
 * 業務ごとの「最初の一歩」カード（改善計画フェーズ0・提案Q16）。
 *
 * 新しい質問もAI呼び出しも増やさず、既存フィールド（trigger/systems/
 * stakeholders/deliverables/judgment等）を組み合わせて、後任者が最初に
 * 何をすればよいかを一目で分かる形に合成する。情報が無い項目は表示しない。
 */
export interface FirstStepSummary {
  when: string | null; // いつ始めるか
  whatToOpen: string | null; // 最初に開くもの
  whoToContact: string | null; // 最初に連絡する人
  doneWhen: string | null; // 何ができれば完了か
  watchOutFor: string | null; // 最も注意する点
}

function firstNonEmpty(...values: (string | null | undefined)[]): string | null {
  for (const v of values) {
    if (v && v.trim().length > 0) return v.trim();
  }
  return null;
}

export function buildFirstStepSummary(business: Business): FirstStepSummary | null {
  const when = firstNonEmpty(business.trigger, business.frequency);

  const firstSystemDetail = business.system_details.find((s) => s.name && s.name.trim().length > 0);
  const whatToOpen = firstNonEmpty(
    firstSystemDetail?.name,
    business.systems?.split(/[、,]/)[0]
  );

  const firstStakeholder = business.stakeholders[0];
  const whoToContact = firstStakeholder ? `${firstStakeholder.role}: ${firstStakeholder.name}` : null;

  const doneWhen = firstNonEmpty(business.deliverables);
  const watchOutFor = firstNonEmpty(business.judgment, business.exception);

  if (!when && !whatToOpen && !whoToContact && !doneWhen && !watchOutFor) return null;
  return { when, whatToOpen, whoToContact, doneWhen, watchOutFor };
}
