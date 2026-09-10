"use client";

/**
 * チャット版AIインタビュー画面で、Excel/CSVファイルをドラッグ＆ドロップまたは
 * 選択したときに、その内容をテキスト化するためのヘルパー。
 *
 * 解析は完全にブラウザ内（対象者自身の端末）で完結し、ファイルの中身は
 * サーバーには送らない。対象者は変換結果を回答欄で確認・編集してから送信する。
 *
 * 注意：解析ライブラリ（xlsx / SheetJS）のnpm公開版には既知の脆弱性
 * （プロトタイプ汚染・正規表現によるDoS）が残っている。ただしここでは
 * サーバーではなく対象者本人のブラウザ内で、対象者自身がアップロードした
 * 自分のファイルを解析するだけであり、影響範囲は本人のタブに閉じるため、
 * このユースケースでは許容できるリスクと判断している。
 */

const ACCEPTED_EXTENSIONS = [".xlsx", ".xls", ".csv"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export class SpreadsheetParseError extends Error {}

export function isAcceptedSpreadsheetFile(fileName: string): boolean {
  const name = fileName.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

/**
 * Excel（.xlsx/.xls）またはCSVファイルを読み込み、シートの内容をタブ区切りの
 * テキストに変換して返す。複数シートがある場合はシート名の見出しを付けて連結する。
 */
export async function parseSpreadsheetFile(file: File): Promise<string> {
  if (!isAcceptedSpreadsheetFile(file.name)) {
    throw new SpreadsheetParseError(
      "対応していないファイル形式です。Excel（.xlsx / .xls）またはCSVファイルをお使いください。"
    );
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new SpreadsheetParseError("ファイルサイズが大きすぎます（5MBまでのファイルをお使いください）。");
  }

  const XLSX = await import("xlsx");

  let workbook: import("xlsx").WorkBook;
  try {
    const buffer = await file.arrayBuffer();
    workbook = XLSX.read(buffer, { type: "array" });
  } catch (err) {
    throw new SpreadsheetParseError(
      "ファイルを読み取れませんでした。壊れているか、対応していない形式の可能性があります。"
    );
  }

  const sheets = workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet, { FS: "\t", blankrows: false }).trim();
    return { sheetName, csv };
  }).filter((s) => s.csv.length > 0);

  if (sheets.length === 0) {
    throw new SpreadsheetParseError("ファイルの中に読み取れるデータが見つかりませんでした。");
  }

  if (sheets.length === 1) {
    return sheets[0].csv;
  }

  return sheets.map(({ sheetName, csv }) => `【シート: ${sheetName}】\n${csv}`).join("\n\n");
}
