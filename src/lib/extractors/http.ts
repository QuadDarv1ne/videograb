/**
 * Утилита для выполнения HTTP-запросов с браузерным User-Agent
 * и таймаутом. Используется всеми извлекателями.
 */

export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export interface FetchOptions extends RequestInit {
  /** Таймаут запроса в мс (по умолчанию 15000) */
  timeoutMs?: number;
  /** Использовать ли gzip/br (по умолчанию true) */
  compress?: boolean;
}

export async function fetchWithTimeout(
  url: string,
  opts: FetchOptions = {}
): Promise<Response> {
  const { timeoutMs = 15000, headers, ...rest } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const finalHeaders: Record<string, string> = {
      "User-Agent": USER_AGENT,
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9," +
        "application/json;q=0.8,*/*;q=0.7",
      "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
      ...(headers as Record<string, string> | undefined),
    };
    const res = await fetch(url, {
      ...rest,
      headers: finalHeaders,
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Получить текст страницы с обработкой кодировки.
 * Если указан encoding, используется TextDecoder с этой кодировкой.
 */
export async function fetchText(
  url: string,
  opts: FetchOptions & { encoding?: string } = {}
): Promise<string> {
  const { encoding, ...fetchOpts } = opts;
  const res = await fetchWithTimeout(url, fetchOpts);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  }
  if (encoding) {
    const buf = await res.arrayBuffer();
    try {
      const decoder = new TextDecoder(encoding);
      return decoder.decode(buf);
    } catch {
      return new TextDecoder().decode(buf);
    }
  }
  return res.text();
}

/**
 * Получить JSON.
 */
export async function fetchJson<T = unknown>(url: string, opts: FetchOptions = {}): Promise<T> {
  const res = await fetchWithTimeout(url, {
    ...opts,
    headers: { Accept: "application/json", ...(opts.headers as Record<string, string> | undefined) },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Извлечь значение мета-тега из HTML, поддерживает og:*, twitter:*,
 * <meta property="..."> и <meta name="...">.
 */
export function getMeta(html: string, key: string): string | undefined {
  const reProp = new RegExp(
    `<meta[^>]+(?:property|name)=["']${escapeRegExp(key)}["'][^>]*>`,
    "i"
  );
  const m1 = html.match(reProp);
  if (m1) {
    const content = m1[0].match(/content=["']([^"']*)["']/i);
    if (content) return decodeHtmlEntities(content[1]);
  }
  return undefined;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Форматирование длительности в секундах в строку HH:MM:SS.
 */
export function formatDuration(sec?: number): string {
  if (sec == null || sec < 0) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Преобразовать размер в байтах в читаемый формат.
 */
export function formatBytes(bytes?: number): string {
  if (bytes == null || bytes < 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

/**
 * Парсер атрибутов HLS EXT-X-STREAM-INF строки.
 * Поддерживает KEY=VALUE и KEY="VALUE,WITH,COMMAS".
 */
export function parseHlsAttributes(s: string): Record<string, string> {
  const result: Record<string, string> = {};
  const re = /([A-Z0-9-]+)=("([^"]*)"|([^,]*))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    result[m[1]] = m[3] ?? m[4] ?? "";
  }
  return result;
}

/**
 * Декодировать HTML-сущности (&amp; &lt; &gt; &quot; &#39; &#x27; &#123; &#x7B; &nbsp;).
 */
export function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}
