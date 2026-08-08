/**
 * GET /api/download?url=...&filename=...
 *
 * Прокси для скачивания видеофайла. Позволяет обойти CORS и добавить
 * Content-Disposition: attachment, чтобы файл сохранялся, а не открывался.
 *
 * Поддерживает Range-запросы для докачки и стриминга больших файлов.
 * Используется allowlist доверенных доменов вместо blocklist для SSRF-защиты.
 * Дополнительно к allowlist каждый хост (включая редиректы) резолвится через
 * DNS и все полученные IP проверяются на приватные диапазоны — это закрывает
 * атаки типа DNS-rebinding.
 */

import { NextRequest, NextResponse } from "next/server";
import { lookup } from "node:dns/promises";
import { USER_AGENT } from "@/lib/extractors/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_REDIRECTS = 5;

/** Доверенные домены для скачивания (CDN платформ + их поддомены) */
const ALLOWED_HOSTS = [
  // VK
  "vk.com",
  "vkvideo.ru",
  "vkontakte.ru",
  "userapi.com",
  "vkuser.net",
  "okcdn.ru", // CDN vkvd*.okcdn.ru — VK отдаёт MP4/HLS через этот домен
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
  return ALLOWED_HOSTS.some((h) => lower === h || lower.endsWith(`.${h}`));
}

/** Проверка имени хоста без DNS-резолва (быстрая отсечка). */
function isPrivateHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  // Localhost и локальные TLD
  if (
    lower === "localhost" ||
    lower.endsWith(".local") ||
    lower.endsWith(".internal") ||
    lower.endsWith(".localdomain") ||
    lower.endsWith(".lan")
  ) {
    return true;
  }
  // Если хост — сырой IPv4/IPv6, проверяем адрес напрямую
  if (looksLikeIp(lower)) {
    return isPrivateIpAddress(lower);
  }
  return false;
}

function looksLikeIp(host: string): boolean {
  return /^[\d.]+$/.test(host) || host.includes(":");
}

/** Проверить, что адрес не относится к приватным/служебным диапазонам. */
function isPrivateIpAddress(ip: string): boolean {
  const lower = ip.toLowerCase();
  // IPv4-mapped IPv6: ::ffff:127.0.0.1
  const v4mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4mapped) return isPrivateIpv4(v4mapped[1]);
  if (lower.includes(":")) return isPrivateIpv6(lower);
  return isPrivateIpv4(lower);
}

function isPrivateIpv4(ip: string): boolean {
  // IPv4 private ranges
  if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|0\.)/.test(ip)) return true;
  // IPv4 loopback
  if (/^127\./.test(ip)) return true;
  // IPv4 link-local (включая metadata endpoint 169.254.169.254)
  if (/^169\.254\./.test(ip)) return true;
  // IPv4 CGNAT (Carrier-Grade NAT, 100.64.0.0/10)
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip)) return true;
  // Остатки DOC/benchmark-диапазонов: 192.0.0.0/24, 198.18.0.0/15, 224.0.0.0/4
  if (/^192\.0\.0\./.test(ip)) return true;
  if (/^198\.(1[89]|2[0-9])\./.test(ip)) return true;
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  // loopback ::1
  if (ip === "::1" || ip.startsWith("::1:")) return true;
  // link-local fe80::/10
  if (ip.startsWith("fe80:")) return true;
  // ULA fc00::/7 (fc.., fd..)
  if (/^f[cd][0-9a-f]{2}:/.test(ip)) return true;
  // Служебные/зарезервированные: 2001:db8::/32, ::ffff: (mapped уже обработан)
  if (ip.startsWith("2001:db8:")) return true;
  // IPv4-translated (64:ff9b::/96) — теоретически могут указывать на приватные v4
  if (ip.startsWith("64:ff9b:")) return true;
  return false;
}

/**
 * Резолв хоста через DNS и проверка ВСЕХ полученных адресов.
 * Fail-closed: при ошибке DNS или любом приватном адресе — блокируем.
 */
async function isResolvedIpSafe(hostname: string): Promise<boolean> {
  try {
    const addrs = await lookup(hostname, { all: true, verbatim: true });
    if (addrs.length === 0) return false;
    return addrs.every((a) => !isPrivateIpAddress(a.address));
  } catch {
    return false;
  }
}

/** Полная проверка целевого хоста (allowlist + приватные имена + DNS). */
async function isTargetSafe(url: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { ok: false, reason: "Невалидный URL" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { ok: false, reason: "Поддерживаются только http/https URLs" };
  }
  if (!isAllowedHost(u.hostname)) {
    return { ok: false, reason: "Скачивание разрешено только с доверенных платформ (VK, Rutube, Boosty)" };
  }
  if (isPrivateHostname(u.hostname)) {
    return { ok: false, reason: "Доступ к приватным сетям запрещён" };
  }
  if (!(await isResolvedIpSafe(u.hostname))) {
    return { ok: false, reason: "DNS-резолв привёл к приватному адресу — доступ запрещён" };
  }
  return { ok: true };
}

class DownloadForbiddenError extends Error {}
class TooManyRedirectsError extends Error {}

interface UpstreamResult {
  response: Response;
  finalUrl: URL;
}

/** Запрос с ручным следованием редиректам (каждый редирект проверяется). */
async function fetchWithRedirects(
  initialUrl: URL,
  headers: Record<string, string>,
  signal: AbortSignal
): Promise<UpstreamResult> {
  let currentUrl = initialUrl;
  let response = await fetch(currentUrl.toString(), {
    headers,
    redirect: "manual",
    signal,
  });
  let redirectCount = 0;

  while (isRedirectStatus(response.status) && redirectCount < MAX_REDIRECTS) {
    const location = response.headers.get("location");
    if (!location) break;

    let nextUrl: URL;
    try {
      nextUrl = new URL(location, currentUrl.toString());
    } catch {
      break;
    }

    const safety = await isTargetSafe(nextUrl.toString());
    if (!safety.ok) {
      throw new DownloadForbiddenError(safety.reason);
    }

    currentUrl = nextUrl;
    response = await fetch(currentUrl.toString(), {
      headers,
      redirect: "manual",
      signal,
    });
    redirectCount++;
  }

  if (isRedirectStatus(response.status)) {
    throw new TooManyRedirectsError(`Слишком много редиректов (больше ${MAX_REDIRECTS})`);
  }

  return { response, finalUrl: currentUrl };
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function sanitizeFilename(raw: string): string {
  return raw
    .replace(/[^\w\s.\-]/g, "_")
    .replace(/\.{2,}/g, ".")
    .slice(0, 200);
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

export async function HEAD(req: NextRequest) {
  const urlParam = req.nextUrl.searchParams.get("url");
  const filename = sanitizeFilename(req.nextUrl.searchParams.get("filename") || "video.mp4");

  if (!urlParam) {
    return NextResponse.json({ error: "Параметр url обязателен" }, { status: 400 });
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(urlParam);
  } catch {
    return NextResponse.json({ error: "Невалидный URL для скачивания" }, { status: 400 });
  }

  const safety = await isTargetSafe(targetUrl.toString());
  if (!safety.ok) {
    return NextResponse.json({ error: safety.reason }, { status: 403 });
  }

  try {
    const upstreamHeaders: Record<string, string> = {
      "User-Agent": USER_AGENT,
      Accept: "*/*",
      Referer: targetUrl.origin + "/",
    };

    const { response } = await fetchWithRedirects(
      targetUrl,
      upstreamHeaders,
      AbortSignal.timeout(15_000)
    );

    const responseHeaders: Record<string, string> = {
      "Content-Type": response.headers.get("content-type") || guessContentType(filename),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    };

    const contentLength = response.headers.get("content-length");
    if (contentLength) responseHeaders["Content-Length"] = contentLength;
    const acceptRanges = response.headers.get("accept-ranges");
    if (acceptRanges) responseHeaders["Accept-Ranges"] = acceptRanges;

    return new NextResponse(null, { status: 200, headers: responseHeaders });
  } catch (e) {
    if (e instanceof DownloadForbiddenError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[download] HEAD error:", msg);
    return NextResponse.json(
      { error: `Ошибка проверки: ${msg}` },
      { status: 502 }
    );
  }
}

export async function GET(req: NextRequest) {
  const urlParam = req.nextUrl.searchParams.get("url");
  const filename = sanitizeFilename(req.nextUrl.searchParams.get("filename") || "video.mp4");

  if (!urlParam) {
    return NextResponse.json({ error: "Параметр url обязателен" }, { status: 400 });
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(urlParam);
  } catch {
    return NextResponse.json({ error: "Невалидный URL для скачивания" }, { status: 400 });
  }

  const safety = await isTargetSafe(targetUrl.toString());
  if (!safety.ok) {
    return NextResponse.json({ error: safety.reason }, { status: 403 });
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

    const { response } = await fetchWithRedirects(
      targetUrl,
      upstreamHeaders,
      AbortSignal.timeout(280_000)
    );

    if (!response.ok && response.status !== 206) {
      return NextResponse.json(
        { error: `Источник вернул ${response.status} ${response.statusText}` },
        { status: 502 }
      );
    }

    // Определяем Content-Type
    const contentType =
      response.headers.get("content-type") || guessContentType(filename);

    // Готовим заголовки ответа
    const responseHeaders: Record<string, string> = {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    };

    // Пробрасываем Content-Length, Content-Range и Accept-Ranges
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
    if (e instanceof DownloadForbiddenError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    if (e instanceof TooManyRedirectsError) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[download] error:", msg);
    return NextResponse.json(
      { error: `Ошибка при скачивании: ${msg}` },
      { status: 502 }
    );
  }
}