/**
 * Извлекатель видео для Rutube.
 *
 * Поддерживаемые URL:
 *   - https://rutube.ru/video/{hash}/
 *   - https://rutube.ru/play/embed/{id}/
 *   - https://rutube.ru/tracks/{id}.html
 *   - https://rutube.ru/shorts/{hash}/
 *
 * Стратегия:
 *   1. Разобрать URL — получить hash (hex) или track_id (число).
 *   2. Запросить https://rutube.ru/api/video/{id_or_hash}/?format=json
 *      — вернёт title, thumbnail, duration, author, track_id.
 *   3. Запросить https://rutube.ru/api/play/options/{track_id}/?format=json&p=gl
 *      — вернёт video_balancer.m3u8 с прямой HLS-ссылкой.
 *   4. (Опционально) Распарсить m3u8 для извлечения отдельных MP4 вариантов.
 */

import { ExtractorError, type VideoFormat, type VideoInfo } from "./types";
import { fetchJson, fetchText, parseHlsAttributes } from "./http";

interface RutubeApiResponse {
  id: string;
  title: string;
  description?: string;
  duration?: number;
  thumbnail_url?: string;
  preview_url?: string;
  created_ts?: string;
  author?: {
    id?: number;
    name?: string;
    site_url?: string;
    avatar_url?: string;
  };
  video_url?: string;
  track_id?: number;
  is_blocked?: boolean;
  is_hidden?: boolean;
  is_deleted?: boolean;
  restrictions?: {
    country?: { allowed?: string[]; restricted?: string[] };
  };
  blog?: { id?: number; name?: string; url?: string };
  embed_url?: string;
}

interface RutubePlayOptionsResponse {
  acl_access?: { allowed?: boolean; err_code?: string; err_text?: string };
  video_balancer?: {
    default?: string;
    m3u8?: string;
    m3u8_m4s?: string;
  };
  live_streams?: {
    hls?: Array<{ url?: string }>;
  };
  duration?: number;
  is_livestream?: boolean;
  drm_token?: string | null;
  html?: string;
}

interface RutubeHlsMaster {
  variants: Array<{
    bandwidth: number;
    resolution?: string;
    url: string;
  }>;
}

export function parseRutubeUrl(url: string): { id?: string; hash?: string } | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host !== "rutube.ru" && host !== "rutube.video" && host !== "myvideo.ru") {
      return null;
    }

    // /play/embed/{hash_or_id}/
    const embedMatch = u.pathname.match(/^\/play\/embed\/([a-z0-9]+)/i);
    if (embedMatch) {
      const v = embedMatch[1];
      return isHex(v) && v.length === 32 ? { hash: v } : { id: v };
    }

    // /video/{hash}/
    const videoMatch = u.pathname.match(/^\/video\/([a-f0-9]+)/i);
    if (videoMatch) return { hash: videoMatch[1] };

    // /shorts/{hash}/
    const shortsMatch = u.pathname.match(/^\/shorts\/([a-f0-9]+)/i);
    if (shortsMatch) return { hash: shortsMatch[1] };

    // /tracks/{id}.html
    const tracksMatch = u.pathname.match(/^\/tracks\/(\d+)/);
    if (tracksMatch) return { id: tracksMatch[1] };

    // /private/{video_id}/
    const privateMatch = u.pathname.match(/^\/private\/(\d+)/);
    if (privateMatch) return { id: privateMatch[1] };

    return null;
  } catch {
    return null;
  }
}

export async function extractRutube(originalUrl: string): Promise<VideoInfo> {
  const parsed = parseRutubeUrl(originalUrl);
  if (!parsed || (!parsed.id && !parsed.hash)) {
    throw new ExtractorError("UNSUPPORTED_URL", "Не удалось распознать ссылку Rutube");
  }

  const inputId = parsed.id || parsed.hash!;

  // 1. Основной API
  let apiData: RutubeApiResponse;
  try {
    apiData = await fetchJson<RutubeApiResponse>(
      `https://rutube.ru/api/video/${inputId}/?format=json`,
      {
        headers: {
          Referer: "https://rutube.ru/",
        },
      }
    );
  } catch (e) {
    throw new ExtractorError(
      "NETWORK_ERROR",
      `Не удалось получить данные через API Rutube: ${(e as Error).message}`
    );
  }

  if (apiData.is_blocked) {
    throw new ExtractorError("PRIVATE_CONTENT", "Видео заблокировано на Rutube");
  }
  if (apiData.is_deleted) {
    throw new ExtractorError("NOT_FOUND", "Видео удалено");
  }
  if (apiData.is_hidden) {
    throw new ExtractorError("PRIVATE_CONTENT", "Видео скрыто");
  }

  // Проверка региональных ограничений
  if (apiData.restrictions?.country?.restricted?.length) {
    // Регион может быть и не РФ, но мы все равно пробуем получить m3u8
    // и если не получится — кинем REGION_BLOCKED ниже
  }

  const trackId = apiData.track_id?.toString();
  if (!trackId) {
    throw new ExtractorError(
      "PARSE_ERROR",
      "Rutube не вернул track_id для видео. Попробуйте другую ссылку."
    );
  }

  // 2. Опции воспроизведения (HLS-ссылка)
  let options: RutubePlayOptionsResponse | null = null;
  try {
    options = await fetchJson<RutubePlayOptionsResponse>(
      `https://rutube.ru/api/play/options/${trackId}/?format=json&p=gl`,
      {
        headers: {
          Referer: `https://rutube.ru/play/embed/${apiData.id}/`,
        },
      }
    );
  } catch {
    options = null;
  }

  // Проверка доступа
  if (options?.acl_access && options.acl_access.allowed === false) {
    const errText = options.acl_access.err_text || "";
    if (/region|country|geo/i.test(errText)) {
      throw new ExtractorError(
        "REGION_BLOCKED",
        "Видео недоступно в вашем регионе по решению правообладателя"
      );
    }
    if (/paid|premium|subscription/i.test(errText)) {
      throw new ExtractorError(
        "PRIVATE_CONTENT",
        "Видео платное, требуется подписка Rutube"
      );
    }
    throw new ExtractorError(
      "PRIVATE_CONTENT",
      `Доступ к видео ограничен: ${errText || "причина неизвестна"}`
    );
  }

  const formats: VideoFormat[] = [];
  const seen = new Set<string>();

  // 3a. Извлекаем HLS-ссылку
  const hlsUrl =
    options?.video_balancer?.m3u8 ||
    options?.video_balancer?.default ||
    options?.video_balancer?.m3u8_m4s;

  if (hlsUrl && !seen.has(hlsUrl)) {
    formats.push({
      quality: "HLS",
      url: hlsUrl,
      ext: "m3u8",
      type: "stream",
      label: "HLS (адаптивный, все качества)",
    });
    seen.add(hlsUrl);
  }

  // Live streams
  if (options?.live_streams?.hls && options.live_streams.hls.length > 0) {
    for (const stream of options.live_streams.hls) {
      if (stream.url && !seen.has(stream.url)) {
        formats.push({
          quality: "LIVE",
          url: stream.url,
          ext: "m3u8",
          type: "stream",
          label: "Live-поток (HLS)",
        });
        seen.add(stream.url);
      }
    }
  }

  // 3b. Парсим master.m3u8 для извлечения отдельных вариантов
  if (hlsUrl) {
    try {
      const master = await fetchText(hlsUrl, {
        headers: { Referer: "https://rutube.ru/" },
      });
      const parsed = parseHlsMaster(master, hlsUrl);
      for (const v of parsed.variants) {
        if (seen.has(v.url)) continue;
        seen.add(v.url);
        const resLabel = v.resolution || guessResolution(v.bandwidth);
        formats.push({
          quality: resLabel,
          url: v.url,
          ext: "m3u8",
          type: "stream",
          label: `HLS ${resLabel} (~${Math.round(v.bandwidth / 1000)} kbps)`,
        });
      }
    } catch {
      // парсинг m3u8 не обязателен
    }
  }

  // Сортировка: отдельные качества по убыванию, общий HLS в начале
  const qualityRank = (q: string): number => {
    if (q === "LIVE") return 20000;
    if (q === "HLS") return 10000;
    const num = parseInt(q, 10);
    if (!isNaN(num)) return 10000 - num;
    return -100;
  };
  formats.sort((a, b) => qualityRank(b.quality) - qualityRank(a.quality));

  if (formats.length === 0) {
    throw new ExtractorError(
      "PARSE_ERROR",
      "Rutube не вернул ссылок для воспроизведения. Возможно, видео защищено DRM или недоступно в вашем регионе."
    );
  }

  const author = apiData.author?.name || apiData.blog?.name;
  const authorUrl = apiData.author?.site_url ||
    (apiData.blog?.url ? `https://rutube.ru${apiData.blog.url}` : undefined);

  return {
    platform: "rutube",
    originalUrl,
    canonicalUrl: apiData.video_url || `https://rutube.ru/video/${apiData.id}/`,
    title: apiData.title?.trim() || `Rutube video #${trackId}`,
    thumbnail:
      apiData.thumbnail_url ||
      apiData.preview_url ||
      "",
    duration: apiData.duration,
    author,
    authorUrl,
    description: apiData.description,
    formats,
    videoId: trackId,
    fetchedAt: new Date().toISOString(),
  };
}

function isHex(s: string): boolean {
  return /^[a-f0-9]+$/i.test(s);
}

function guessResolution(bandwidth: number): string {
  // Примерная корреляция bitrate → разрешение
  if (bandwidth >= 3_000_000) return "1080p";
  if (bandwidth >= 1_500_000) return "720p";
  if (bandwidth >= 800_000) return "480p";
  if (bandwidth >= 400_000) return "360p";
  return "240p";
}

/**
 * Распарсить master.m3u8 (HLS) и извлечь варианты качества.
 */
function parseHlsMaster(playlist: string, baseUrl: string): RutubeHlsMaster {
  const lines = playlist.split("\n").map((l) => l.trim());
  const variants: RutubeHlsMaster["variants"] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("#EXT-X-STREAM-INF:")) {
      const attrs = parseHlsAttributes(line.substring("#EXT-X-STREAM-INF:".length));
      const bandwidth = parseInt(attrs.BANDWIDTH || "0", 10);
      const resolution = attrs.RESOLUTION; // e.g. "854x480"
      const url = lines[i + 1];
      if (url && !url.startsWith("#")) {
        const absoluteUrl = new URL(url, baseUrl).toString();
        // Конвертируем "854x480" → "480p"
        let qualityLabel: string | undefined;
        if (resolution) {
          const m = resolution.match(/(\d+)x(\d+)/);
          if (m) qualityLabel = `${m[2]}p`;
        }
        variants.push({
          bandwidth,
          resolution: qualityLabel,
          url: absoluteUrl,
        });
      }
    }
  }
  return { variants };
}
