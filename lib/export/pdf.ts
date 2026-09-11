import fs from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFPage, type PDFFont } from "pdf-lib";
import type { InterviewResult, SystemDetail, UnfinishedCase } from "@/lib/schema";
import { isHandoverComplete } from "@/lib/scoring";

/**
 * 引継書パッケージをPDFとして生成する。
 *
 * pdf-lib の標準14フォントは日本語グリフを含まないため、IPAゴシック
 * （IPAフォントライセンスv1.0、再配布・埋め込み可）を assets/fonts/ipag.ttf に
 * 同梱し、fontkit 経由で埋め込んで和文を描画する。
 */

let cachedFontBytes: Buffer | null = null;

async function loadJapaneseFontBytes(): Promise<Buffer> {
  if (!cachedFontBytes) {
    const fontPath = path.join(process.cwd(), "assets", "fonts", "ipag.ttf");
    cachedFontBytes = await fs.readFile(fontPath);
  }
  return cachedFontBytes;
}

export async function buildHandoverPdf(params: {
  companyName: string | null;
  employeeName: string | null;
  result: InterviewResult;
}): Promise<Buffer> {
  const { companyName, employeeName, result } = params;

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const fontBytes = await loadJapaneseFontBytes();
  // IPAゴシックはウェイトが1種類のみのため、太字も同じフォントで代用する。
  const font = await pdfDoc.embedFont(fontBytes, { subset: true });
  const boldFont = font;

  const writer = new PdfWriter(pdfDoc, font, boldFont);

  const complete = result.businesses.length > 0 && isHandoverComplete(result.businesses);

  writer.heading("引継書", 20);
  writer.text(`対象者: ${employeeName ?? "未設定"}　/　所属: ${companyName ?? "未設定"}`);
  writer.text(complete ? "引継完了（必須項目を充足）" : "引継未完了（必須項目が未確認の業務があります）", {
    bold: true,
    color: complete ? rgb(0.18, 0.49, 0.2) : rgb(0.78, 0.16, 0.16),
  });
  writer.gap();

  for (const business of result.businesses) {
    writer.heading(business.name, 14);
    writer.field("目的・対象", business.purpose);
    writer.field("頻度・実施時期", business.frequency);
    writer.field("開始条件", business.trigger);
    writer.field("期限", business.deadline);
    writer.field("具体的手順", business.steps.length ? business.steps.join(" → ") : null);
    writer.field("成果物・保存場所", business.deliverables);
    writer.field("判断ポイント", business.judgment);
    writer.field("例外・イレギュラー対応", business.exception);
    writer.field("失敗時対応", business.failure);
    writer.field(
      "関係者",
      business.stakeholders.length
        ? business.stakeholders.map((s) => `${s.role}: ${s.name}`).join(", ")
        : null
    );
    writer.field("使用ファイル・システム", business.systems);
    writeSystemDetails(writer, business.system_details);
    writer.field("権限移管状況", business.access_handover);
    writer.text(`充足率: ${business.score}%`, { bold: true });
    if (business.mandatory_gate_missing.length > 0) {
      writer.text(`引継未完了：${business.mandatory_gate_missing.join("、")}が未確認`, {
        bold: true,
        color: rgb(0.78, 0.16, 0.16),
      });
    }
    if (business.human_follow_up_note) {
      writer.text(`要人間フォロー: ${business.human_follow_up_note}`, {
        color: rgb(0.8, 0, 0),
      });
    }
    writer.gap();
  }

  writer.heading("未完了案件", 14);
  if (result.unfinished_cases.length === 0) {
    writer.text("なし");
  } else {
    for (const c of result.unfinished_cases) {
      writer.text(
        `・${c.name} ｜進捗: ${c.progress ?? "-"} ｜次のアクション: ${c.next_action ?? "-"} ｜期限: ${
          c.deadline ?? "-"
        }`
      );
      writeUnfinishedCaseDetails(writer, c);
    }
  }
  writer.gap();

  writer.heading("後任者へのメッセージ", 14);
  writer.text(result.closing_message ?? "（記載なし）");

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

/**
 * システムごとの詳細（URL・ID・ログイン方法・権限・マニュアル保管場所・関連ファイル
 * 保存場所等）を字下げして出力する。
 * 仕様変更：パスワードそのものは記載しない（会社が定める安全な方法で別途移管する）。
 */
function writeSystemDetails(writer: PdfWriter, details: SystemDetail[]) {
  for (const d of details) {
    writer.text(`・${d.name}`, { bold: true });
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
      writer.text(`　　${label}: ${value}`);
    }
  }
}

/** 未完了案件の専用ヒアリング項目（目的・未決事項・主担当者等）を字下げして出力する。 */
function writeUnfinishedCaseDetails(writer: PdfWriter, c: UnfinishedCase) {
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
    writer.text(`　　${label}: ${value}`);
  }
}

const PAGE_WIDTH = 595.28; // A4 pt
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const LINE_HEIGHT = 18;

class PdfWriter {
  private page: PDFPage;
  private y: number;

  constructor(
    private doc: PDFDocument,
    private font: PDFFont,
    private boldFont: PDFFont
  ) {
    this.page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = PAGE_HEIGHT - MARGIN;
  }

  private ensureSpace(lines = 1) {
    if (this.y - lines * LINE_HEIGHT < MARGIN) {
      this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      this.y = PAGE_HEIGHT - MARGIN;
    }
  }

  // 日本語は単語区切り（スペース）が無いため、1文字単位で折り返す。
  private wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
    const chars = Array.from(text);
    const lines: string[] = [];
    let current = "";
    for (const ch of chars) {
      const candidate = current + ch;
      if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
        lines.push(current);
        current = ch;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
    return lines.length ? lines : [""];
  }

  heading(text: string, size: number) {
    this.gap();
    const lines = this.wrap(text, this.boldFont, size, PAGE_WIDTH - MARGIN * 2);
    for (const line of lines) {
      this.ensureSpace();
      this.page.drawText(line, { x: MARGIN, y: this.y, size, font: this.boldFont });
      this.y -= size + 6;
    }
  }

  field(label: string, value: string | null) {
    this.text(`${label}: ${value && value.trim().length > 0 ? value : "（未記載）"}`);
  }

  text(text: string, opts?: { bold?: boolean; color?: ReturnType<typeof rgb> }) {
    const font = opts?.bold ? this.boldFont : this.font;
    const size = 10;
    const lines = this.wrap(text, font, size, PAGE_WIDTH - MARGIN * 2);
    for (const line of lines) {
      this.ensureSpace();
      this.page.drawText(line, {
        x: MARGIN,
        y: this.y,
        size,
        font,
        color: opts?.color ?? rgb(0, 0, 0),
      });
      this.y -= LINE_HEIGHT;
    }
  }

  gap() {
    this.y -= 6;
  }
}
