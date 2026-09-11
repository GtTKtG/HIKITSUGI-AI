import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
} from "docx";
import type { InterviewResult, SystemDetail, UnfinishedCase } from "@/lib/schema";
import { isHandoverComplete } from "@/lib/scoring";

/**
 * 引継書パッケージをWord（.docx）として生成する。
 * 仕様書2章「納品完了」の定義に沿い、業務一覧・各項目・未完了案件・後任者への
 * メッセージを含める。仕様変更（5.2章）により、目的・期限・成果物・権限移管状況を
 * 追加し、必須ゲート未達（引継未完了）の業務を明示する。
 */
export async function buildHandoverDocx(params: {
  companyName: string | null;
  employeeName: string | null;
  result: InterviewResult;
}): Promise<Buffer> {
  const { companyName, employeeName, result } = params;

  const complete = result.businesses.length > 0 && isHandoverComplete(result.businesses);

  const children: (Paragraph | Table)[] = [
    new Paragraph({
      text: "引継書",
      heading: HeadingLevel.TITLE,
    }),
    new Paragraph({
      children: [
        new TextRun(`対象者: ${employeeName ?? "未設定"}　/　所属: ${companyName ?? "未設定"}`),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: complete ? "引継完了（必須項目を充足）" : "引継未完了（必須項目が未確認の業務があります）",
          bold: true,
          color: complete ? "2E7D32" : "C62828",
        }),
      ],
    }),
    new Paragraph({ text: "" }),
  ];

  for (const business of result.businesses) {
    children.push(
      new Paragraph({ text: business.name, heading: HeadingLevel.HEADING_1 }),
      labeledParagraph("目的・対象", business.purpose),
      labeledParagraph("頻度・実施時期", business.frequency),
      labeledParagraph("開始条件", business.trigger),
      labeledParagraph("期限", business.deadline),
      labeledParagraph("具体的手順", business.steps.length ? business.steps.join(" → ") : null),
      labeledParagraph("成果物・保存場所", business.deliverables),
      labeledParagraph("判断ポイント", business.judgment),
      labeledParagraph("例外・イレギュラー対応", business.exception),
      labeledParagraph("失敗時対応", business.failure),
      labeledParagraph(
        "関係者",
        business.stakeholders.length
          ? business.stakeholders
              .map((s) => `${s.role}: ${s.name}${s.note ? `（${s.note}）` : ""}`)
              .join(" / ")
          : null
      ),
      labeledParagraph("使用ファイル・システム", business.systems)
    );
    children.push(...buildSystemDetailParagraphs(business.system_details));
    children.push(labeledParagraph("権限移管状況", business.access_handover));
    children.push(
      new Paragraph({
        children: [new TextRun({ text: `充足率: ${business.score}%`, bold: true })],
      })
    );

    if (business.mandatory_gate_missing.length > 0) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `引継未完了：${business.mandatory_gate_missing.join("、")}が未確認`,
              bold: true,
              color: "C62828",
            }),
          ],
        })
      );
    }

    if (business.human_follow_up_note) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `要人間フォロー: ${business.human_follow_up_note}`,
              italics: true,
              color: "CC0000",
            }),
          ],
        })
      );
    }
    children.push(new Paragraph({ text: "" }));
  }

  children.push(new Paragraph({ text: "未完了案件", heading: HeadingLevel.HEADING_1 }));
  if (result.unfinished_cases.length === 0) {
    children.push(new Paragraph({ text: "なし" }));
  } else {
    children.push(buildUnfinishedCasesTable(result.unfinished_cases));
    children.push(new Paragraph({ text: "" }));
    children.push(...buildUnfinishedCaseDetailParagraphs(result.unfinished_cases));
  }

  children.push(
    new Paragraph({ text: "" }),
    new Paragraph({ text: "後任者へのメッセージ", heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ text: result.closing_message ?? "（記載なし）" })
  );

  const doc = new Document({
    sections: [{ children }],
  });

  return Packer.toBuffer(doc);
}

function labeledParagraph(label: string, value: string | null): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: `${label}: `, bold: true }),
      new TextRun(value && value.trim().length > 0 ? value : "（未記載）"),
    ],
  });
}

/**
 * システムごとの詳細（URL・ID・ログイン方法・権限・マニュアル保管場所・関連ファイル
 * 保存場所等）をインデントした箇条書きで出力する。
 * 仕様変更：パスワードそのものは記載しない（会社が定める安全な方法で別途移管する）。
 */
function buildSystemDetailParagraphs(details: SystemDetail[]): Paragraph[] {
  if (details.length === 0) return [];

  const paragraphs: Paragraph[] = [];
  for (const d of details) {
    paragraphs.push(
      new Paragraph({
        indent: { left: 360 },
        children: [new TextRun({ text: `・${d.name}`, bold: true })],
      })
    );
    const fields: [string, string | null][] = [
      ["URL", d.url],
      ["ID", d.login_id],
      ["利用機能・ログイン方法", d.login_method],
      ["権限", d.permission],
      ["端末制限", d.device_restriction],
      ["電子証明書", d.certificate],
      ["申請先", d.application_destination],
      ["代理者", d.proxy],
      ["マニュアル保管場所", d.manual_location],
      ["関連ファイル保存場所", d.file_location],
      ["備考", d.note],
    ];
    for (const [label, value] of fields) {
      if (!value || value.trim().length === 0) continue;
      paragraphs.push(
        new Paragraph({
          indent: { left: 720 },
          children: [new TextRun({ text: `${label}: `, bold: true }), new TextRun(value)],
        })
      );
    }
  }
  return paragraphs;
}

function buildUnfinishedCasesTable(cases: UnfinishedCase[]): Table {
  const header = new TableRow({
    children: ["案件名", "進捗状況", "次のアクション", "期限"].map(
      (text) =>
        new TableCell({
          width: { size: 25, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ children: [new TextRun({ text, bold: true })] })],
        })
    ),
  });

  const rows = cases.map(
    (c) =>
      new TableRow({
        children: [c.name, c.progress ?? "", c.next_action ?? "", c.deadline ?? ""].map(
          (text) =>
            new TableCell({
              width: { size: 25, type: WidthType.PERCENTAGE },
              children: [new Paragraph({ text: text || "（未記載）" })],
            })
        ),
      })
  );

  return new Table({ rows: [header, ...rows], width: { size: 100, type: WidthType.PERCENTAGE } });
}

/** 未完了案件の専用ヒアリング項目（目的・未決事項・主担当者等）を案件ごとに箇条書きで出力する。 */
function buildUnfinishedCaseDetailParagraphs(cases: UnfinishedCase[]): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  for (const c of cases) {
    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: `・${c.name}`, bold: true })],
      })
    );
    const fields: [string, string | null][] = [
      ["目的・対象範囲・背景", c.purpose_scope],
      ["未決事項・懸念・依存関係", c.open_issues],
      ["次回予定日", c.next_review_date],
      ["主担当者", c.owner],
      ["意思決定者", c.decision_maker],
      ["相手方の窓口", c.counterpart],
      ["関連資料・打合せ記録の所在", c.related_materials_location],
      ["放置・遅延した場合の影響", c.impact_if_neglected],
      ["完了条件", c.completion_condition],
      ["完了を確認する者", c.completion_confirmer],
    ];
    for (const [label, value] of fields) {
      if (!value || value.trim().length === 0) continue;
      paragraphs.push(
        new Paragraph({
          indent: { left: 360 },
          children: [new TextRun({ text: `${label}: `, bold: true }), new TextRun(value)],
        })
      );
    }
  }
  return paragraphs;
}
