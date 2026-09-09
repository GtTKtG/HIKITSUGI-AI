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
import type { InterviewResult } from "@/lib/schema";

/**
 * 引継書パッケージをWord（.docx）として生成する。
 * 仕様書2章「納品完了」の定義に沿い、業務一覧・8項目・未完了案件・後任者への
 * メッセージを含める。
 */
export async function buildHandoverDocx(params: {
  companyName: string | null;
  employeeName: string | null;
  result: InterviewResult;
}): Promise<Buffer> {
  const { companyName, employeeName, result } = params;

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
    new Paragraph({ text: "" }),
  ];

  for (const business of result.businesses) {
    children.push(
      new Paragraph({ text: business.name, heading: HeadingLevel.HEADING_1 }),
      labeledParagraph("頻度", business.frequency),
      labeledParagraph("開始条件", business.trigger),
      labeledParagraph("具体的手順", business.steps.length ? business.steps.join(" → ") : null),
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
      labeledParagraph("使用ファイル・システム", business.systems),
      new Paragraph({
        children: [new TextRun({ text: `充足率: ${business.score}%`, bold: true })],
      })
    );

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

function buildUnfinishedCasesTable(cases: InterviewResult["unfinished_cases"]): Table {
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
