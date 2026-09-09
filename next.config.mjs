/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // PDF出力（lib/export/pdf.ts）が実行時に assets/fonts/ipag.ttf を fs.readFile で
  // 読み込むため、サーバーレス関数のファイルトレーシングに明示的に含める。
  experimental: {
    outputFileTracingIncludes: {
      "/api/interview/[id]/export": ["./assets/fonts/**"],
    },
  },
};

export default nextConfig;
