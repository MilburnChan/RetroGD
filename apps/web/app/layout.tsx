import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Retro Pixel Guandan",
  description: "复古像素风掼蛋，支持联机、AI 对战与局后复盘"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="grid-bg">{children}</body>
    </html>
  );
}
