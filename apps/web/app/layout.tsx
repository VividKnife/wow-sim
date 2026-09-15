import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "wow-sim · 艾泽拉斯旅程",
  description: "人类法师的 1—20 级经典旧世旅程。",
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
