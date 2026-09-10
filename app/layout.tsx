import type { Metadata } from "next";
import type { ReactNode } from "react";
import { GlobalDropGuard } from "./GlobalDropGuard";

export const metadata: Metadata = {
  title: "HIKITSUGI AI",
  description: "退職・異動者へのAIインタビューから引継書を作成するサービス",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body style={{ fontFamily: "sans-serif", margin: 0 }}>
        <GlobalDropGuard />
        {children}
      </body>
    </html>
  );
}
