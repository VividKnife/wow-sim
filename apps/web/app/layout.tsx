import type { Metadata } from "next";
import "./globals.css";
import "./journey.css";

export const metadata: Metadata = {
  title: "wow-sim · 艾泽拉斯旅程",
  description: "九职业 1—60 级经典旧世冒险，探索世界、培养队伍与挑战副本。",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
