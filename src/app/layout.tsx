import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "EGAT BDReport Control Panel",
  description: "ระบบสรุปรายงานการปฏิบัติงานประจำสัปดาห์อัตโนมัติ แผนกบำรุงรักษาอาคารและบริเวณ การไฟฟ้าฝ่ายผลิตแห่งประเทศไทย (กฟผ.)",
  manifest: "/manifest.json",
  icons: {
    apple: "/apple-touch-icon.jpg",
  },
  appleWebApp: {
    capable: true,
    title: "EGAT BDReport",
    statusBarStyle: "default",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
