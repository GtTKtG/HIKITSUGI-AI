"use client";

import { useEffect } from "react";

/**
 * ブラウザは、ページ上にファイルがドロップされてもどこも preventDefault() しないと
 * デフォルトでそのファイルをタブ全体に開こうとする（バイナリファイルだと真っ白や
 * 文字化けになり、フリーズしたように見える）。これを防ぐため、ウィンドウ全体で
 * dragover/drop のデフォルト動作を止める。
 *
 * 各ページ側で個別に onDrop を用意している場合は、そちらが先に処理してから
 * 伝播するため問題ない。
 */
export function GlobalDropGuard() {
  useEffect(() => {
    function preventDefault(e: DragEvent) {
      e.preventDefault();
    }
    window.addEventListener("dragover", preventDefault);
    window.addEventListener("drop", preventDefault);
    return () => {
      window.removeEventListener("dragover", preventDefault);
      window.removeEventListener("drop", preventDefault);
    };
  }, []);

  return null;
}
