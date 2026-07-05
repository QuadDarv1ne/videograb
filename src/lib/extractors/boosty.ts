/**
 * Извлекатель видео для Boosty.
 *
 * Поддерживаемые URL:
 *   - https://boosty.to/{user}/posts/{post_id}
 *   - https://boosty.to/{user}
 *   - https://boosty.to/{user}/posts/{post_id}?... (сhop ссылки)
 *
 * Особенности:
 *   - Большая часть контента Boosty — платная и требует авторизации OAuth2.
 *   - Публичные посты можно получить через API
 *     https://api.boosty.to/v1/blog/{user}/post/{post_id}
 *   - Видео в Boosty отдаются через HLS-стримы на CDN cdn.boosty.to
 *   - Если пост приватный — вернётся PRIVATE_CONTENT.
 */

import { ExtractorError, type VideoFormat, type VideoInfo } from "./types";
import { fetchJson, fetchText, getMeta } from "./http";

interface BoostyPostApiResponse {
  data?: {
    id: number;
    title?: string;
    content?: string;          // HTML содержимое
    publishTime?: number;
    post?: { id?: number; user?: { name?: string; blogUrl?: string } };
    data?: Array<{
      type?: string;
      content?: string;          // URL видео или HTML
      preview?: string;          // превью
      duration?: number;
    }>;
    user?: { name?: string; blogUrl?: string; avatarUrl?: string };
    blogUrl?: string;
    titleHtml?: string;
    text?: string;
  };
  result?: unknown;
}

interface BoostyOembedResponse {
  title?: string;
  author_name?: string;
  author_url?: string;
  thumbnail_url?: string;
  html?: string;
}

export function parseBoostyUrl(url: string): { user?: string; postId?: string } | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host !== "boosty.to" && host !== "boosto.ru") return null;

    const parts = u.pathname.split("/").filter(Boolean);
    // /{user}/posts/{postId}
    if (parts.length >= 3 && parts[1] === "posts") {
      return { user: parts[0], postId: parts[2] };
    }
    // /{user}
    if (parts.length >= 1) {
      return { user: parts[0] };
    }
    return null;
  } catch {
    return null;
  }
}

export async function extractBoosty(originalUrl: string): Promise<VideoInfo> {
  const parsed = parseBoostyUrl(originalUrl);
  if (!parsed?.user || !parsed?.postId) {
    throw new ExtractorError(
      "UNSUPPORTED_URL",
      "Boosty: ожидается ссылка вида https://boosty.to/USER/posts/POST_ID"
    );
  }

  // 1. Попробуем публичный API поста
  let apiData: BoostyPostApiResponse | null = null;
  let pageHtml: string | undefined;
  let apiError: Error | null = null;

  try {
    apiData = await fetchJson<BoostyPostApiResponse>(
      `https://api.boosty.to/v1/blog/${parsed.user}/post/${parsed.postId}`,
      {
        headers: {
          Accept: "application/json",
          Referer: `https://boosty.to/${parsed.user}/posts/${parsed.postId}`,
        },
      }
    );
  } catch (e) {
    apiError = e as Error;
    // Попробуем просто получить страницу
    try {
      pageHtml = await fetchText(originalUrl);
    } catch {
      // ничего
    }
  }

  // Если в API есть ошибка доступа
  if (apiData && (apiData as unknown as { error?: string }).error) {
    const errMsg = (apiData as unknown as { error: string }).error;
    if (/access|forbidden|private|paid|subscription/i.test(errMsg)) {
      throw new ExtractorError(
        "PRIVATE_CONTENT",
        "Этот пост Boosty платный или приватный. Для доступа нужен логин Boosty."
      );
    }
  }

  // Если нет API данных — пробуем парсить HTML
  if (!apiData?.data && !pageHtml) {
    // Boosty часто возвращает 418/403 для серверных запросов (антибот)
    const msg = apiError?.message ?? "";
    if (/418|403|forbidden/i.test(msg)) {
      throw new ExtractorError(
        "PRIVATE_CONTENT",
        "Boosty заблокировал серверный доступ к посту. Это может быть связано с антибот-защитой или с тем, что пост приватный/платный. Попробуйте другую ссылку или проверьте, что пост публичный."
      );
    }
    if (/404|not found/i.test(msg)) {
      throw new ExtractorError(
        "NOT_FOUND",
        "Пост не найден на Boosty. Проверьте правильность ссылки."
      );
    }
    throw new ExtractorError(
      "NETWORK_ERROR",
      `Не удалось получить данные поста Boosty: ${msg}`
    );
  }

  if (!pageHtml) {
    try {
      pageHtml = await fetchText(originalUrl);
    } catch {
      // игнорируем — работаем с API
    }
  }

  // 2. Сбор метаданных
  const title =
    apiData?.data?.title ||
    apiData?.data?.titleHtml ||
    (pageHtml ? getMeta(pageHtml, "og:title") : "") ||
    `Boosty post #${parsed.postId}`;
  const description =
    apiData?.data?.text || (pageHtml ? getMeta(pageHtml, "og:description") : undefined);
  const author = apiData?.data?.user?.name || apiData?.data?.post?.user?.name || parsed.user;
  const authorUrl = `https://boosty.to/${parsed.user}`;

  let thumbnail =
    apiData?.data?.user?.avatarUrl ||
    (pageHtml ? getMeta(pageHtml, "og:image") : "") ||
    "";

  // 3. Поиск видео URL внутри данных поста
  const formats: VideoFormat[] = [];
  const seen = new Set<string>();

  // 3a. data[].content может содержать URL видео
  if (apiData?.data?.data && Array.isArray(apiData.data.data)) {
    for (const block of apiData.data.data) {
      if (block.type === "video" || block.type === "ok_video" || block.type === "youtube") {
        const content = block.content || "";
        // извлечь URL из content
        const urls = extractUrls(content);
        for (const u of urls) {
          if (seen.has(u)) continue;
          seen.add(u);
          if (u.includes(".m3u8")) {
            formats.push({
              quality: "HLS",
              url: u,
              ext: "m3u8",
              type: "stream",
              label: "HLS (адаптивный)",
            });
          } else if (u.includes(".mp4")) {
            formats.push({
              quality: "Источник",
              url: u,
              ext: "mp4",
              type: "video",
              label: "MP4 (источник)",
            });
          }
        }
        if (block.preview && !thumbnail) thumbnail = block.preview;
      }
    }
  }

  // 3b. Парсинг HTML страницы, если она есть
  if (pageHtml) {
    // Ищем HLS и MP4 ссылки
    const m3u8Regex = /(https?:\/\/[^"'<>\s]+\.m3u8[^"'<>\s]*)/g;
    let m: RegExpExecArray | null;
    while ((m = m3u8Regex.exec(pageHtml)) !== null) {
      if (seen.has(m[1])) continue;
      seen.add(m[1]);
      formats.push({
        quality: "HLS",
        url: m[1],
        ext: "m3u8",
        type: "stream",
        label: "HLS (адаптивный)",
      });
    }
    const mp4Regex = /(https?:\/\/[^"'<>\s]+\.mp4[^"'<>\s]*)/g;
    while ((m = mp4Regex.exec(pageHtml)) !== null) {
      if (seen.has(m[1])) continue;
      seen.add(m[1]);
      formats.push({
        quality: "Источник",
        url: m[1],
        ext: "mp4",
        type: "video",
        label: "MP4 (источник)",
      });
    }

    // Также ищем в data-player-src и т.п.
    const srcMatch = pageHtml.match(/data-(?:player-)?src="([^"]+\.(?:mp4|m3u8)[^"]*)"/i);
    if (srcMatch && !seen.has(srcMatch[1])) {
      seen.add(srcMatch[1]);
      const isM3u8 = srcMatch[1].includes(".m3u8");
      formats.push({
        quality: isM3u8 ? "HLS" : "Источник",
        url: srcMatch[1],
        ext: isM3u8 ? "m3u8" : "mp4",
        type: isM3u8 ? "stream" : "video",
        label: isM3u8 ? "HLS (адаптивный)" : "MP4 (источник)",
      });
    }
  }

  // 3c. Если есть embed через oEmbed
  if (formats.length === 0) {
    try {
      const oembed = await fetchJson<BoostyOembedResponse>(
        `https://boosty.to/oembed?url=${encodeURIComponent(originalUrl)}&format=json`
      );
      if (oembed.thumbnail_url && !thumbnail) thumbnail = oembed.thumbnail_url;
      if (oembed.html) {
        // извлекаем URL из iframe-embed
        const iframeSrc = oembed.html.match(/src="([^"]+)"/);
        if (iframeSrc) {
          // не добавляем как скачиваемый, но можно показать
        }
      }
    } catch {
      // oEmbed опционален
    }
  }

  if (formats.length === 0) {
    throw new ExtractorError(
      "PRIVATE_CONTENT",
      "Не удалось найти прямые ссылки на видео. Скорее всего, пост приватный или платный — для доступа необходима авторизация на Boosty."
    );
  }

  return {
    platform: "boosty",
    originalUrl,
    canonicalUrl: originalUrl,
    title: title.trim(),
    thumbnail: thumbnail || "",
    duration: undefined,
    author,
    authorUrl,
    description,
    formats,
    videoId: parsed.postId,
    fetchedAt: new Date().toISOString(),
  };
}

function extractUrls(html: string): string[] {
  const urls: string[] = [];
  const regex = /(https?:\/\/[^"'<>\s\\]+)/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html)) !== null) {
    urls.push(m[1].replace(/[,;]+$/, ""));
  }
  return urls;
}
