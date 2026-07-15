/**
 * Извлекатель видео для VK / VK Video.
 *
 * Поддерживаемые URL:
 *   - https://vk.com/video-{oid}_{id}
 *   - https://vkvideo.ru/video-{oid}_{id}
 *   - https://vk.com/video_ext.php?oid=...&id=...&hash=...
 *   - https://vk.com/clip-{oid}_{id}
 *
 * Стратегия:
 *   1. Разбор URL → oid + id (+ hash если есть).
 *   2. Если есть env VK_ACCESS_TOKEN — используем официальный API
 *      video.get, который возвращает files с MP4 разных качеств.
 *   3. Иначе — парсим embed-страницу (https://vk.com/video_ext.php).
 *      В VK embed HTML есть JSON-блок с ключом "files" — внутри него:
 *        - mp4_1080 (или другое качество) — прямой MP4 URL
 *        - hls_ondemand — master HLS-плейлист со ВСЕМИ качествами
 *        - dash_ondemand — DASH-плейлист (не используется)
 *      Также из JSON достаём title, duration.
 *   4. Для HLS-плейлиста делаем повторный запрос и парсим мастер-плейлист,
 *      извлекая все качества (mobile/lowest/low/medium/high/fullhd).
 *
 * Кодировка VK embed — windows-1251, это учитывается в fetchText.
 */

import { ExtractorError, type VideoFormat, type VideoInfo } from "./types";
import { fetchJson, fetchText, parseHlsAttributes, decodeHtmlEntities, getMeta } from "./http";

interface VkParsedId {
  oid: string;
  id: string;
  hash?: string;
}

interface VkApiResponse {
  response?: Array<{
    id: number;
    owner_id: number;
    title?: string;
    description?: string;
    duration?: number;
    date?: number;
    photo_130?: string;
    photo_320?: string;
    photo_640?: string;
    photo_800?: string;
    photo_1280?: string;
    files?: Record<string, string>; // mp4_240, mp4_360, ..., hls
    first_frame_800?: string;
    player?: string;
    can_download?: number;
  }>;
  error?: {
    error_code: number;
    error_msg: string;
  };
}

/** Распознать URL VK и вернуть oid/id (+hash если есть). */
export function parseVkUrl(url: string): VkParsedId | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host !== "vk.com" && host !== "vkvideo.ru" && host !== "vkontakte.ru") {
      return null;
    }

    // /video-{oid}_{id}
    const pathMatch = u.pathname.match(/^\/video(-?\d+)_(\d+)/);
    if (pathMatch) {
      return { oid: pathMatch[1], id: pathMatch[2] };
    }

    // /clip-{oid}_{id}
    const clipMatch = u.pathname.match(/^\/clip(-?\d+)_(\d+)/);
    if (clipMatch) {
      return { oid: clipMatch[1], id: clipMatch[2] };
    }

    // video_ext.php?oid=...&id=...&hash=...
    if (u.pathname.includes("video_ext.php")) {
      const oid = u.searchParams.get("oid");
      const id = u.searchParams.get("id");
      const hash = u.searchParams.get("hash") || undefined;
      if (oid && id) return { oid, id, hash };
    }

    // z=video-{oid}_{id} в параметрах
    const z = u.searchParams.get("z");
    if (z) {
      const zMatch = z.match(/^video(-?\d+)_(\d+)/);
      if (zMatch) return { oid: zMatch[1], id: zMatch[2] };
    }

    return null;
  } catch {
    return null;
  }
}

const VK_API_VERSION = "5.199";

/** Сопоставление качества HLS с человекочитаемой меткой. */
const VK_QUALITY_LABELS: Record<string, string> = {
  mobile: "144p",
  lowest: "240p",
  low: "360p",
  medium: "480p",
  high: "720p",
  fullhd: "1080p",
  quadhd: "1440p",
  octohd: "2160p", // 4K
};

export async function extractVk(originalUrl: string): Promise<VideoInfo> {
  const parsed = parseVkUrl(originalUrl);
  if (!parsed) {
    throw new ExtractorError("UNSUPPORTED_URL", "Не удалось распознать ссылку VK");
  }

  const accessToken = process.env.VK_ACCESS_TOKEN;
  const embedUrl = `https://vk.com/video_ext.php?oid=${parsed.oid}&id=${parsed.id}${
    parsed.hash ? `&hash=${parsed.hash}` : ""
  }`;

  // 1. Если есть токен — используем официальный API (возвращает все mp4 качества)
  if (accessToken) {
    try {
      const apiData = await fetchJson<VkApiResponse>(
        `https://api.vk.com/method/video.get?` +
          `videos=${parsed.oid}_${parsed.id}&` +
          `v=${VK_API_VERSION}`,
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (apiData.error) {
        const code = apiData.error.error_code;
        if (code === 5) {
          throw new ExtractorError(
            "PRIVATE_CONTENT",
            "VK access token недействителен или истёк. Обновите его в настройках."
          );
        }
        if (code === 7 || code === 15) {
          throw new ExtractorError(
            "PRIVATE_CONTENT",
            "Нет доступа к этому видео через API. Возможно, видео приватное или было удалено."
          );
        }
        if (code === 100) {
          throw new ExtractorError("NOT_FOUND", "Видео не найдено");
        }
        throw new ExtractorError(
          "UNKNOWN",
          `VK API error ${code}: ${apiData.error.error_msg}`
        );
      }

      const video = apiData.response?.[0];
      if (!video) {
        throw new ExtractorError("NOT_FOUND", "Видео не найдено в VK API");
      }

      const formats: VideoFormat[] = [];
      const seen = new Set<string>();

      if (video.files) {
        const qualityOrder = [
          "mp4_2160",
          "mp4_1440",
          "mp4_1080",
          "mp4_720",
          "mp4_480",
          "mp4_360",
          "mp4_240",
        ];
        for (const key of qualityOrder) {
          const url = video.files[key];
          if (url && !seen.has(url)) {
            seen.add(url);
            const q = key.replace("mp4_", "");
            formats.push({
              quality: `${q}p`,
              url,
              ext: "mp4",
              type: "video",
              label: `MP4 ${q}p`,
            });
          }
        }
        if (video.files.hls && !seen.has(video.files.hls)) {
          formats.push({
            quality: "HLS",
            url: video.files.hls,
            ext: "m3u8",
            type: "stream",
            label: "HLS (адаптивный)",
          });
          seen.add(video.files.hls);
        }
      }

      const thumbnail =
        video.photo_1280 ||
        video.photo_800 ||
        video.photo_640 ||
        video.photo_320 ||
        video.photo_130 ||
        "";

      if (formats.length === 0) {
        throw new ExtractorError(
          "PARSE_ERROR",
          "VK API вернул видео, но без прямых ссылок для скачивания."
        );
      }

      // Сортировка MP4 по качеству (HLS в конце)
      formats.sort((a, b) => qualityRank(b.quality) - qualityRank(a.quality));

      return {
        platform: "vk",
        originalUrl,
        canonicalUrl: `https://vk.com/video${parsed.oid}_${parsed.id}`,
        title: video.title?.trim() || `VK Video ${parsed.oid}_${parsed.id}`,
        thumbnail,
        duration: video.duration,
        description: video.description,
        formats,
        videoId: `${parsed.oid}_${parsed.id}`,
        fetchedAt: new Date().toISOString(),
      };
    } catch (e) {
      if (e && typeof e === "object" && "code" in e && (e as { code: string }).code !== undefined) {
        throw e;
      }
      const warnMsg = e instanceof Error ? e.message : String(e);
      console.warn("[vk] API failed, falling back to embed:", warnMsg);
    }
  }

  // 2. Fallback: парсим embed-страницу
  let embedHtml: string | null = null;
  try {
    embedHtml = await fetchText(embedUrl, {
      timeoutMs: 12000,
      encoding: "windows-1251",
      headers: {
        Referer: "https://vk.com/",
        "Accept-Language": "ru-RU,ru;q=0.9",
        "Sec-Fetch-Dest": "iframe",
        "Sec-Fetch-Mode": "navigate",
      },
    });
  } catch {
    embedHtml = null;
  }

  if (!embedHtml || embedHtml.length < 1000) {
    throw new ExtractorError(
      "NETWORK_ERROR",
      accessToken
        ? "VK API не ответил корректно. Проверьте токен или попробуйте другую ссылку."
        : "Не удалось получить страницу видео VK. Возможно, видео приватное или заблокировано."
    );
  }

  // Проверка на удаление/приватность
  if (/video\s*(was\s*removed|is\s*not\s*available|has\s*been\s*deleted)/i.test(embedHtml)) {
    throw new ExtractorError("NOT_FOUND", "Видео удалено или недоступно");
  }
  if (/private\s*video|access\s*denied/i.test(embedHtml)) {
    throw new ExtractorError("PRIVATE_CONTENT", "Видео приватное");
  }

  // 3. Извлекаем metadata из JSON-блока встроенного в страницу
  const rawTitle = extractField(embedHtml, "title") ||
    getMeta(embedHtml, "og:title") ||
    "";
  const title = rawTitle ? decodeHtmlEntities(rawTitle) : `VK Video ${parsed.oid}_${parsed.id}`;

  const duration = parseDuration(embedHtml);

  // Извлекаем thumbnail из JSON: ищем "first_frame_800", "thumb", "photo"
  const thumbnail = extractThumbnail(embedHtml);

  const rawDescription = extractField(embedHtml, "description");
  const description = rawDescription
    ? decodeHtmlEntities(rawDescription)
    : undefined;

  // 4. Извлекаем "files" объект — там MP4_1080, hls_ondemand, dash_ondemand
  const files = extractFilesObject(embedHtml);

  const formats: VideoFormat[] = [];
  const seen = new Set<string>();

  // 4a. Прямые MP4 (mp4_1080, mp4_720 и т.д.)
  if (files) {
    for (const [key, url] of Object.entries(files)) {
      if (typeof url !== "string") continue;
      const cleanUrl = url.replace(/\\\//g, "/");
      if (!cleanUrl.startsWith("http")) continue;

      const mp4Match = key.match(/^mp4_(\d+)$/);
      if (mp4Match) {
        if (seen.has(cleanUrl)) continue;
        seen.add(cleanUrl);
        const q = mp4Match[1];
        formats.push({
          quality: `${q}p`,
          url: cleanUrl,
          ext: "mp4",
          type: "video",
          label: `MP4 ${q}p`,
        });
      }
    }
  }

  // 4b. HLS-плейлист (hls_ondemand) — парсим master playlist для извлечения всех качеств
  const hlsUrl = files?.hls_ondemand || files?.hls;
  if (typeof hlsUrl === "string") {
    const cleanHlsUrl = hlsUrl.replace(/\\\//g, "/");
    if (!seen.has(cleanHlsUrl)) {
      seen.add(cleanHlsUrl);
      formats.push({
        quality: "HLS",
        url: cleanHlsUrl,
        ext: "m3u8",
        type: "stream",
        label: "HLS (адаптивный, все качества)",
      });
    }

    // Парсим master playlist для извлечения отдельных качеств
    try {
      const masterPlaylist = await fetchText(cleanHlsUrl, {
        timeoutMs: 10000,
        headers: {
          Referer: "https://vk.com/",
        },
      });
      const variants = parseVkHlsMaster(masterPlaylist, cleanHlsUrl);
      for (const v of variants) {
        if (seen.has(v.url)) continue;
        seen.add(v.url);
        formats.push({
          quality: v.quality,
          url: v.url,
          ext: "m3u8",
          type: "stream",
          label: `HLS ${v.quality} (${v.label})`,
        });
      }
    } catch (e) {
      console.warn("[vk] failed to parse HLS master:", e);
    }
  }

  // Сортировка: MP4 по убыванию качества, затем HLS варианты, затем общий HLS
  formats.sort((a, b) => {
    // MP4 — выше всего
    if (a.ext === "mp4" && b.ext !== "mp4") return -1;
    if (b.ext === "mp4" && a.ext !== "mp4") return 1;
    return qualityRank(b.quality) - qualityRank(a.quality);
  });

  // Если есть хотя бы один реальный формат — возвращаем результат
  if (formats.length === 0) {
    // Fallback на embed (для просмотра)
    formats.push({
      quality: "Embed",
      url: embedUrl,
      ext: "html",
      type: "stream",
      label: "Embed VK (только просмотр)",
    });
  }

  return {
    platform: "vk",
    originalUrl,
    canonicalUrl: `https://vk.com/video${parsed.oid}_${parsed.id}`,
    title: title.trim(),
    thumbnail,
    duration,
    description,
    formats,
    videoId: `${parsed.oid}_${parsed.id}`,
    fetchedAt: new Date().toISOString(),
  };
}

/* === Вспомогательные функции === */

function qualityRank(q: string): number {
  if (q === "HLS") return -1;
  if (q === "Embed") return -10;
  const num = parseInt(q, 10);
  if (!isNaN(num)) return 10000 - num;
  return -100;
}

function parseDuration(html: string): number | undefined {
  const m = html.match(/"duration"\s*:\s*(\d+)/);
  if (m) {
    const n = parseInt(m[1], 10);
    if (!isNaN(n)) return n;
  }
  return undefined;
}

function extractField(html: string, key: string): string | undefined {
  const re = new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`);
  const m = html.match(re);
  if (m) return m[1];
  return undefined;
}

/**
 * Извлечь URL изображения-превью.
 * VK embed не всегда содержит thumbnail напрямую, пробуем несколько полей.
 */
function extractThumbnail(html: string): string {
  const fields = [
    "first_frame_800",
    "first_frame_400",
    "first_frame_160",
    "photo_1280",
    "photo_800",
    "photo_640",
    "photo_320",
    "photo_130",
    "thumb",
    "preview",
    "image",
  ];
  for (const field of fields) {
    const re = new RegExp(`"${field}"\\s*:\\s*"(https?:[^"]+)"`);
    const m = html.match(re);
    if (m) {
      const url = m[1].replace(/\\\//g, "/");
      if (url.startsWith("http")) return url;
    }
  }
  // Также ищем прямые URL userapi.com или sun9-*
  const directMatch = html.match(/https?:\/\/[^"'<>\s\\]+userapi\.com\/[^"'<>\s\\]+/i);
  if (directMatch) return directMatch[0];
  const sunMatch = html.match(/https?:\/\/sun9-\d+\.userapi\.com\/[^"'<>\s\\]+/i);
  if (sunMatch) return sunMatch[0];
  return "";
}

/**
 * Извлечь объект "files" из HTML.
 * Ищет сбалансированный JSON-объект после "files":
 */
function extractFilesObject(html: string): Record<string, string> | null {
  const idx = html.indexOf('"files"');
  if (idx === -1) return null;

  // Найти открывающую скобку
  let startBrace = html.indexOf("{", idx);
  if (startBrace === -1) return null;

  // Сбалансированный поиск конца объекта
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = startBrace; i < html.length; i++) {
    const c = html[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === "\\") {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        const raw = html.slice(startBrace, i + 1);
        try {
          const obj = JSON.parse(raw);
          if (typeof obj === "object" && obj !== null) {
            return obj as Record<string, string>;
          }
        } catch {
          // Fallback — попробуем распарсить ключи по одному (на случай если объект вложен в больший)
          return extractFilesKeys(raw);
        }
      }
    }
  }
  return null;
}

/** Fallback-парсер: извлечь все mp4_*, hls_*, dash_* ключи. */
function extractFilesKeys(raw: string): Record<string, string> | null {
  const result: Record<string, string> = {};
  const re = /"(mp4_\d+|hls\w*|dash\w*|failover_host)"\s*:\s*"(https?:[^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    result[m[1]] = m[2].replace(/\\\//g, "/");
  }
  return Object.keys(result).length > 0 ? result : null;
}

interface VkHlsVariant {
  quality: string;       // "720p"
  label: string;         // "high" / "720p @ 60fps"
  url: string;
}

/**
 * Распарсить master.m3u8 VK и вернуть варианты качеств.
 * VK использует нестандартный атрибут QUALITY=mobile|lowest|low|medium|high|fullhd|quadhd|octohd
 */
function parseVkHlsMaster(playlist: string, baseUrl: string): VkHlsVariant[] {
  const lines = playlist.split("\n").map((l) => l.trim());
  const variants: VkHlsVariant[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("#EXT-X-STREAM-INF:")) {
      const attrs = parseHlsAttributes(line.substring("#EXT-X-STREAM-INF:".length));
      const qualityKey = attrs.QUALITY || "";
      const resolution = attrs.RESOLUTION;
      const bandwidth = parseInt(attrs.BANDWIDTH || "0", 10);
      const frameRate = attrs["FRAME-RATE"];

      // Человекочитаемое качество
      const qualityLabel = VK_QUALITY_LABELS[qualityKey] ||
        (resolution ? resolution.split("x")[1] + "p" : `${Math.round(bandwidth / 1000)}kbps`);

      // Дополнительная метка
      const labelParts: string[] = [];
      if (qualityKey) labelParts.push(qualityKey);
      if (frameRate) labelParts.push(`${parseFloat(frameRate)}fps`);
      const label = labelParts.join(" · ") || qualityLabel;

      const url = lines[i + 1];
      if (url && !url.startsWith("#")) {
        const absoluteUrl = new URL(url, baseUrl).toString();
        variants.push({
          quality: qualityLabel,
          label,
          url: absoluteUrl,
        });
      }
    }
  }
  return variants;
}
