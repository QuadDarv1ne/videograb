import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { ThemeProvider } from "next-themes";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "cyrillic"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "VideoGrab — Скачивание видео из VK, Rutube, Boosty",
  description:
    "Бесплатный инструмент для скачивания видео из VK Видео, Rutube и Boosty. Вставьте ссылку — получите прямые ссылки на скачивание в разных качествах.",
  keywords: [
    "скачать видео",
    "VK видео",
    "Rutube",
    "Boosty",
    "видео скачать",
    "video downloader",
    "сохранить видео",
  ],
  authors: [{ name: "VideoGrab" }],
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "VideoGrab — Скачивание видео из VK, Rutube, Boosty",
    description:
      "Бесплатный инструмент для скачивания видео из VK Видео, Rutube и Boosty.",
    siteName: "VideoGrab",
    type: "website",
    locale: "ru_RU",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
          <SonnerToaster position="top-center" richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
