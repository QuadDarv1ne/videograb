/**
 * Роутер извлекателей: определяет платформу по URL и вызывает нужный.
 */

import { ExtractorError, type Platform, type VideoInfo } from "./types";
import { parseVkUrl } from "./vk";
import { parseRutubeUrl } from "./rutube";
import { parseBoostyUrl } from "./boosty";

export { ExtractorError } from "./types";
export type { VideoInfo, VideoFormat, Platform, ExtractorResult } from "./types";

/** Определить платформу по URL. */
export function detectPlatform(url: string): Platform {
  if (!url) return "unknown";
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "vk.com" || host === "vkvideo.ru" || host === "vkontakte.ru") {
      return "vk";
    }
    if (host === "rutube.ru" || host === "rutube.video" || host === "myvideo.ru") {
      return "rutube";
    }
    if (host === "boosty.to" || host === "boosto.ru") {
      return "boosty";
    }
    return "unknown";
  } catch {
    return "unknown";
  }
}

/** Проверить, что URL валиден для какой-либо платформы. */
export function isSupportedUrl(url: string): boolean {
  if (parseVkUrl(url)) return true;
  if (parseRutubeUrl(url)) return true;
  if (parseBoostyUrl(url)) return true;
  return false;
}

/** Главный извлекатель: определяет платформу и вызывает нужный модуль. */
export async function extractVideo(url: string): Promise<VideoInfo> {
  const platform = detectPlatform(url);
  if (platform === "unknown") {
    throw new ExtractorError(
      "UNSUPPORTED_URL",
      "Поддерживаются только ссылки VK, Rutube и Boosty"
    );
  }

  // Нормализуем URL (если это короткая ссылка или есть utm-параметры)
  const cleanUrl = normalizeUrl(url);

  switch (platform) {
    case "vk": {
      const { extractVk } = await import("./vk");
      return extractVk(cleanUrl);
    }
    case "rutube": {
      const { extractRutube } = await import("./rutube");
      return extractRutube(cleanUrl);
    }
    case "boosty": {
      const { extractBoosty } = await import("./boosty");
      return extractBoosty(cleanUrl);
    }
    default:
      throw new ExtractorError("UNSUPPORTED_URL", "Платформа не поддерживается");
  }
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    // Удаляем utm_* параметры
    for (const key of [...u.searchParams.keys()]) {
      if (key.startsWith("utm_")) u.searchParams.delete(key);
    }
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * Карта человекочитаемых названий платформ.
 */
export const PLATFORM_LABELS: Record<Platform, string> = {
  vk: "VK Видео",
  rutube: "Rutube",
  boosty: "Boosty",
  unknown: "Неизвестно",
};

/**
 * Цвета платформ для UI (Tailwind классы).
 */
export const PLATFORM_COLORS: Record<Platform, { bg: string; text: string; ring: string }> = {
  vk: { bg: "bg-rose-50 dark:bg-rose-950/30", text: "text-rose-600 dark:text-rose-400", ring: "ring-rose-200 dark:ring-rose-900" },
  rutube: { bg: "bg-emerald-50 dark:bg-emerald-950/30", text: "text-emerald-600 dark:text-emerald-400", ring: "ring-emerald-200 dark:ring-emerald-900" },
  boosty: { bg: "bg-amber-50 dark:bg-amber-950/30", text: "text-amber-600 dark:text-amber-400", ring: "ring-amber-200 dark:ring-amber-900" },
  unknown: { bg: "bg-muted", text: "text-muted-foreground", ring: "ring-border" },
};
