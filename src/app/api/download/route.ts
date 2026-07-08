/**
 * GET /api/download?url=...&filename=...
 *
 * Прокси для скачивания видеофайла. Позволяет обойти CORS и добавить
 * Content-Disposition: attachment, чтобы файл сохранялся, а не открывался.
 *
 * Поддерживает Range-запросы для докачки и стриминга больших файлов.
 */

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 минут максимум

const BLOCKED_HOSTS = [
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "169.254.169.254", // AWS metadata
];

function isPrivateIp(hostname: string): boolean {
  // IPv4 private ranges
  if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|0\.)/.test(hostname)) return true;
  // IPv6 loopback/link-local
  if (/^(::1|fe80:|fc|fd)/i.test(hostname)) return true;
  // Localhost variants
  if (hostname.endsWith(".local") || hostname.endsWith(".internal")) return true;
  return false;
}

export async function GET(req: NextRequest) {
  const urlParam = req.nextUrl.searchParams.get("url");
  const rawFilename = req.nextUrl.searchParams.get("filename") || "video.mp4";
  // Sanitize filename to prevent header injection
  const filename = rawFilename
    .replace(/[^\w\s.\-]/g, "_")
    .replace(/\.{2,}/g, ".")
    .slice(0, 200);

  if (!urlParam) {
    return NextResponse.json(
      { error: "Параметр url обязателен" },
      { status: 400 }
    );
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(urlParam);
  } catch {
    return NextResponse.json(
      { error: "Невалидный URL для скачивания" },
      { status: 400 }
    );
  }

  // Защита от SSRF
  const host = targetUrl.hostname;
  if (BLOCKED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) {
    return NextResponse.json(
      { error: "Доступ к этому хосту заблокирован" },
      { status: 403 }
    );
  }
  if (isPrivateIp(host)) {
    return NextResponse.json(
      { error: "Доступ к приватным сетям запрещён" },
      { status: 403 }
    );
  }

  // Разрешаем только http/https
  if (targetUrl.protocol !== "http:" && targetUrl.protocol !== "https:") {
    return NextResponse.json(
      { error: "Поддерживаются только http/https URLs" },
      { status: 400 }
    );
  }

  try {
    // Пробрасываем Range-заголовок для докачки
    const range = req.headers.get("range");
    const upstreamHeaders: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept: "*/*",
      Referer: targetUrl.origin + "/",
    };
    if (range) upstreamHeaders.Range = range;

    const upstream = await fetch(targetUrl.toString(), {
      headers: upstreamHeaders,
      redirect: "follow",
      signal: AbortSignal.timeout(280_000),
    });

    if (!upstream.ok && upstream.status !== 206) {
      return NextResponse.json(
        {
          error: `Источник вернул ${upstream.status} ${upstream.statusText}`,
        },
        { status: 502 }
      );
    }

    // Определяем Content-Type
    const contentType =
      upstream.headers.get("content-type") ||
      guessContentType(filename);

    // Готовим заголовки ответа
    const responseHeaders: Record<string, string> = {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    };

    // Пробрасываем Content-Length и Content-Range
    const contentLength = upstream.headers.get("content-length");
    if (contentLength) responseHeaders["Content-Length"] = contentLength;
    const contentRange = upstream.headers.get("content-range");
    if (contentRange) responseHeaders["Content-Range"] = contentRange;
    const acceptRanges = upstream.headers.get("accept-ranges");
    if (acceptRanges) responseHeaders["Accept-Ranges"] = acceptRanges;

    // Статус 206 если источник вернул partial content
    const status = upstream.status === 206 ? 206 : 200;

    if (!upstream.body) {
      return NextResponse.json(
        { error: "Источник не вернул тело ответа" },
        { status: 502 }
      );
    }

    // Стримим тело
    return new NextResponse(upstream.body, {
      status,
      headers: responseHeaders,
    });
  } catch (e) {
    console.error("[download] error:", e);
    return NextResponse.json(
      {
        error: `Ошибка при скачивании: ${(e as Error).message}`,
      },
      { status: 502 }
    );
  }
}

function guessContentType(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop() || "";
  switch (ext) {
    case "mp4":
      return "video/mp4";
    case "webm":
      return "video/webm";
    case "m3u8":
      return "application/vnd.apple.mpegurl";
    case "mp3":
      return "audio/mpeg";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    default:
      return "application/octet-stream";
  }
}
