/**
 * POST /api/extract
 * Тело: { url: string }
 * Ответ: VideoInfo | { error: string, code: string }
 *
 * Извлекает информацию о видео (заголовок, превью, доступные форматы).
 */

import { NextRequest, NextResponse } from "next/server";
import { extractVideo, detectPlatform, ExtractorError } from "@/lib/extractors";
import type { Platform } from "@/lib/extractors/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface ExtractRequest {
  url?: string;
}

export async function POST(req: NextRequest) {
  let body: ExtractRequest;
  try {
    body = (await req.json()) as ExtractRequest;
  } catch {
    return NextResponse.json(
      { error: "Неверный JSON в теле запроса", code: "BAD_REQUEST" },
      { status: 400 }
    );
  }

  const url = body.url?.trim();
  if (!url) {
    return NextResponse.json(
      { error: "URL не указан", code: "BAD_REQUEST" },
      { status: 400 }
    );
  }

  // Базовая валидация URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return NextResponse.json(
      { error: "Невалидный URL", code: "BAD_REQUEST" },
      { status: 400 }
    );
  }

  // Разрешаем только http/https
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return NextResponse.json(
      { error: "Поддерживаются только http/https URLs", code: "BAD_REQUEST" },
      { status: 400 }
    );
  }

  const platform: Platform = detectPlatform(url);
  if (platform === "unknown") {
    return NextResponse.json(
      {
        error: "Поддерживаются только ссылки VK, Rutube и Boosty",
        code: "UNSUPPORTED_URL",
      },
      { status: 400 }
    );
  }

  try {
    const info = await extractVideo(url);
    return NextResponse.json({ ok: true, info });
  } catch (e) {
    if (e instanceof ExtractorError) {
      const status =
        e.code === "UNSUPPORTED_URL" || e.code === "NOT_FOUND"
          ? 404
          : e.code === "PRIVATE_CONTENT"
            ? 403
            : e.code === "RATE_LIMIT"
              ? 429
              : 502;
      return NextResponse.json(
        { error: e.message, code: e.code, platform },
        { status }
      );
    }
    console.error("[extract] unknown error:", e);
    return NextResponse.json(
      {
        error: "Внутренняя ошибка сервера при извлечении видео",
        code: "UNKNOWN",
        platform,
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    name: "Video Extractor API",
    supported: ["vk", "rutube", "boosty"],
    usage: "POST { url: string }",
  });
}
