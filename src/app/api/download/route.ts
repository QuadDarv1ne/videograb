/**
 * GET /api/download?url=...&filename=...
 *
 * Прокси для скачивания видеофайла. Позволяет обойти CORS и добавить
 * Content-Disposition: attachment, чтобы файл сохранялся, а не открывался.
 *
 * Поддерживает Range-запросы для докачки и стриминга больших файлов.
 * Используется allowlist доверенных доменов вместо blocklist для SSRF-защиты.
 */

import { NextRequest, NextResponse } from "next/server";
import { USER_AGENT } from "@/lib/extractors/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Доверенные домены для скачивания (CDN платформ + их поддомены) */
const ALLOWED_HOSTS = [
  // VK
  "vk.com",
  "vkvideo.ru",
  "vkontakte.ru",
  "userapi.com",
  // Rutube
  "rutube.ru",
  "rutube.video",
  "myvideo.ru",
  // Boosty
  "boosty.to",
  "boosto.ru",
];

function isAllowedHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return ALLOWED_HOSTS.some(
    (h) => lower === h || lower.endsWith(`.${h}`)
  );
}

function isPrivateIp(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  // IPv4 private ranges
  if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|0\.)/.test(lower)) return true;
  // IPv4 loopback
  if (/^127\./.test(lower)) return true;
  // IPv4 link-local (including AWS/GCP/Azure metadata endpoint 169.254.169.254)
  if (/^169\.254\./.test(lower)) return true;
  // IPv4 CGNAT (Carrier-Grade NAT, 100.64.0.0/10)
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(lower)) return true;
  // IPv6 loopback/link-local
  if (/^(::1|fe80:|fc|fd)/i.test(lower)) return true;
  // Localhost variants
  if (lower.endsWith(".local") || lower.endsWith(".internal")) return true;
  return false;
}

/**
 * Validate a redirect URL before following it (prevents SSRF via redirect).
 * Redirects are only allowed to hosts in the allowlist (same as initial URL).
 */
function isRedirectSafe(redirectUrl: string): boolean {
  try {
    const u = new URL(redirectUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const host = u.hostname;
    if (isPrivateIp(host)) return false;
    if (isAllowedHost(host)) return true;
    return false;
  } catch {
    return false;
  }
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

  // Разрешаем только http/https
  if (targetUrl.protocol !== "http:" && targetUrl.protocol !== "https:") {
    return NextResponse.json(
      { error: "Поддерживаются только http/https URLs" },
      { status: 400 }
    );
  }

  // Allowlist: проверяем что URL ведёт на доверенный домен
  if (!isAllowedHost(targetUrl.hostname)) {
    return NextResponse.json(
      { error: "Скачивание разрешено только с доверенных платформ (VK, Rutube, Boosty)" },
      { status: 403 }
    );
  }

  // Защита от SSRF (дополнительно к allowlist)
  if (isPrivateIp(targetUrl.hostname)) {
    return NextResponse.json(
      { error: "Доступ к приватным сетям запрещён" },
      { status: 403 }
    );
  }

  try {
    // Пробрасываем Range-заголовок для докачки
    const range = req.headers.get("range");
    const upstreamHeaders: Record<string, string> = {
      "User-Agent": USER_AGENT,
      Accept: "*/*",
      Referer: targetUrl.origin + "/",
    };
    if (range) upstreamHeaders.Range = range;

    // Handle redirects manually to prevent SSRF via redirect chain
    const upstream = await fetch(targetUrl.toString(), {
      headers: upstreamHeaders,
      redirect: "manual",
      signal: AbortSignal.timeout(280_000),
    });

    // Follow redirects manually with validation
    let currentUrl = targetUrl;
    let response = upstream;
    let redirectCount = 0;
    const MAX_REDIRECTS = 5;

    while (
      (response.status === 301 || response.status === 302 ||
       response.status === 303 || response.status === 307 || response.status === 308) &&
      redirectCount < MAX_REDIRECTS
    ) {
      const location = response.headers.get("location");
      if (!location) break;

      let nextUrl: URL;
      try {
        nextUrl = new URL(location, currentUrl.toString());
      } catch {
        break;
      }

      if (!isRedirectSafe(nextUrl.toString())) {
        return NextResponse.json(
          { error: "Редирект на небезопасный адрес заблокирован" },
          { status: 403 }
        );
      }

      currentUrl = nextUrl;
      const redirectHeaders: Record<string, string> = {
        "User-Agent": USER_AGENT,
        Accept: "*/*",
        Referer: currentUrl.origin + "/",
      };
      if (range) redirectHeaders.Range = range;

      response = await fetch(currentUrl.toString(), {
        headers: redirectHeaders,
        redirect: "manual",
        signal: AbortSignal.timeout(280_000),
      });
      redirectCount++;
    }

    if (!response.ok && response.status !== 206) {
      return NextResponse.json(
        {
          error: `Источник вернул ${response.status} ${response.statusText}`,
        },
        { status: 502 }
      );
    }

    // Определяем Content-Type
    const contentType =
      response.headers.get("content-type") ||
      guessContentType(filename);

    // Готовим заголовки ответа
    const responseHeaders: Record<string, string> = {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    };

    // Пробрасываем Content-Length и Content-Range
    const contentLength = response.headers.get("content-length");
    if (contentLength) responseHeaders["Content-Length"] = contentLength;
    const contentRange = response.headers.get("content-range");
    if (contentRange) responseHeaders["Content-Range"] = contentRange;
    const acceptRanges = response.headers.get("accept-ranges");
    if (acceptRanges) responseHeaders["Accept-Ranges"] = acceptRanges;

    // Статус 206 если источник вернул partial content
    const status = response.status === 206 ? 206 : 200;

    if (!response.body) {
      return NextResponse.json(
        { error: "Источник не вернул тело ответа" },
        { status: 502 }
      );
    }

    // Стримим тело
    return new NextResponse(response.body, {
      status,
      headers: responseHeaders,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[download] error:", msg);
    return NextResponse.json(
      {
        error: `Ошибка при скачивании: ${msg}`,
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
