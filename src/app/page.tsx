"use client";

import { Sparkles, ArrowDown } from "lucide-react";
import { VideoDownloader } from "@/components/video-downloader/video-downloader";
import { PlatformInfo } from "@/components/video-downloader/platform-info";
import { Header, Footer } from "@/components/video-downloader/layout-parts";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1">
        {/* Hero + форма */}
        <section className="relative overflow-hidden">
          {/* Декоративный фон */}
          <div className="absolute inset-0 bg-grid opacity-60 pointer-events-none" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background pointer-events-none" />
          <div
            className="absolute -top-20 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full blur-3xl pointer-events-none opacity-20"
            style={{
              background:
                "radial-gradient(circle, oklch(0.6 0.2 20) 0%, transparent 70%)",
            }}
          />

          <div className="relative mx-auto max-w-6xl px-4 pt-12 pb-8 sm:pt-16 sm:pb-12">
            <div className="text-center mb-8 sm:mb-10">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border bg-background/80 backdrop-blur text-xs font-medium text-muted-foreground mb-5">
                <Sparkles className="h-3 w-3 text-amber-500" />
                Бесплатно · Без регистрации · Без водяных знаков
              </div>
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-balance">
                Скачивайте видео из{" "}
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-rose-500 via-amber-500 to-emerald-500">
                  VK, Rutube и Boosty
                </span>
              </h1>
              <p className="mt-4 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto text-balance">
                Вставьте ссылку на видео — получите прямые ссылки для скачивания в
                разных качествах. Без установки программ, прямо в браузере.
              </p>
            </div>

            <VideoDownloader />

            <div className="mt-8 flex justify-center">
              <a
                href="#platforms"
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowDown className="h-3.5 w-3.5 animate-bounce" />
                Подробнее о платформах
              </a>
            </div>
          </div>
        </section>

        {/* Информация о платформах + FAQ */}
        <section id="platforms" className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
          <PlatformInfo />
        </section>
      </main>

      <Footer />
    </div>
  );
}
