/**
 * Общие типы для извлечения видео с платформ VK, Rutube, Boosty.
 */

export type Platform = "vk" | "rutube" | "boosty" | "unknown";

export interface VideoFormat {
  /** Человекочитаемое качество, например "1080p", "720p", "HLS" */
  quality: string;
  /** Прямой URL к видеопотоку или файлу */
  url: string;
  /** Расширение: mp4, m3u8, webm */
  ext: string;
  /** Тип источника */
  type: "video" | "stream";
  /** Размер в байтах, если известен */
  size?: number;
  /** Дополнительная метка, например "mp4@60fps" */
  label?: string;
}

export interface VideoInfo {
  platform: Platform;
  /** Оригинальный URL, введённый пользователем */
  originalUrl: string;
  /** Канонический URL видео */
  canonicalUrl?: string;
  title: string;
  thumbnail: string;
  /** Длительность в секундах */
  duration?: number;
  author?: string;
  authorUrl?: string;
  description?: string;
  formats: VideoFormat[];
  /** Идентификатор видео на платформе */
  videoId?: string;
  /** Когда был извлечён (ISO) */
  fetchedAt: string;
}

export class ExtractorError extends Error {
  code:
    | "UNSUPPORTED_URL"
    | "NOT_FOUND"
    | "PRIVATE_CONTENT"
    | "NETWORK_ERROR"
    | "PARSE_ERROR"
    | "RATE_LIMIT"
    | "REGION_BLOCKED"
    | "UNKNOWN";
  constructor(
    code: ExtractorError["code"],
    message: string,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = "ExtractorError";
    this.code = code;
  }
}

export interface ExtractorResult {
  info: VideoInfo;
  /** Человекочитаемые предупреждения (например, про HLS) */
  warnings?: string[];
}
