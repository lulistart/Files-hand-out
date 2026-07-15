import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "文件兑换分发系统",
  description: "批量上传文件，生成兑换码，用户兑换后获取短期下载链接",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full">
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
