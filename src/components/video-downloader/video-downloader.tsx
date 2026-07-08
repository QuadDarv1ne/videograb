"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  Download,
  Link2,
  Loader2,
  AlertCircle,
  Film,
  Sparkles,
  X,
  Clock,
  User,
  FileVideo,
  CheckCircle2,
  Copy,
  ShieldAlert,
  ExternalLink,
  Play,
  Eye,
  EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  detectPlatform,
  PLATFORM_COLORS,
  PLATFORM_LABELS,
  type VideoInfo,
  type VideoFormat,
  type Platform,
} from "@/lib/extractors";
import { formatDuration, formatBytes } from "@/lib/extractors/http";

interface ExtractResponse {
  ok?: boolean;
  info?: VideoInfo;
  error?: string;
  code?: string;
  platform?: Platform;
}

export function VideoDownloader() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [info, setInfo] = useState<VideoInfo | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});
  const [showPreview, setShowPreview] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const platform = detectPlatform(url);

  // Получить embed URL для предпросмотра
  const embedUrl = useMemo(() => {
    if (!info) return null;
    return getEmbedUrl(info);
  }, [info]);

  // Авто-вставка из буфера (только при первом монтировании, по клику)
  const handlePasteFromClipboard = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && (text.includes("vk.com") || text.includes("vkvideo.ru") ||
        text.includes("rutube.ru") || text.includes("boosty.to"))) {
        setUrl(text.trim());
        toast.success("Ссылка вставлена из буфера обмена");
      } else {
        toast.info("В буфере обмена нет подходящей ссылки");
      }
    } catch {
      toast.error("Не удалось прочитать буфер обмена");
    }
  }, []);

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!url.trim()) {
      toast.error("Введите ссылку на видео");
      return;
    }
    if (platform === "unknown") {
      setError("Поддерживаются только ссылки VK, Rutube и Boosty");
      setErrorCode("UNSUPPORTED_URL");
      return;
    }

    setLoading(true);
    setError(null);
    setErrorCode(null);
    setInfo(null);
    setDownloadProgress({});
    setShowPreview(false);

    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = (await res.json()) as ExtractResponse;

      if (!res.ok || !data.ok || !data.info) {
        const msg = data.error || "Не удалось получить информацию о видео";
        setError(msg);
        setErrorCode(data.code || "UNKNOWN");
        toast.error(msg);
        return;
      }

      setInfo(data.info);
      toast.success(`Найдено ${data.info.formats.length} вариантов для скачивания`);
    } catch (e) {
      const msg = `Ошибка сети: ${(e as Error).message}`;
      setError(msg);
      setErrorCode("NETWORK_ERROR");
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [url, platform]);

  const handleDownload = useCallback(
    async (format: VideoFormat) => {
      if (!info) return;

      // Embed — открываем в новой вкладке для просмотра
      if (format.ext === "html") {
        window.open(format.url, "_blank", "noopener,noreferrer");
        return;
      }

      // Для HLS потоков скачивание напрямую не сработает — нужна ffmpeg
      if (format.ext === "m3u8") {
        toast.info(
          "HLS-поток нельзя скачать одним файлом через браузер. Используйте инструменты вроде yt-dlp или ffmpeg, либо откройте поток в плеере (VLC).",
          { duration: 7000 }
        );
        window.open(format.url, "_blank", "noopener,noreferrer");
        return;
      }

      // Формируем имя файла
      const safeTitle = sanitizeFilename(info.title).slice(0, 80);
      const filename = `${safeTitle}_${format.quality}.${format.ext}`;

      // Прокси-ссылка на наш /api/download
      const proxyUrl = `/api/download?filename=${encodeURIComponent(filename)}&url=${encodeURIComponent(format.url)}`;

      // Проверяем доступность прокси перед скачиванием
      const formatKey = format.url;
      try {
        const checkRes = await fetch(proxyUrl, { method: "HEAD" });
        if (!checkRes.ok) {
          throw new Error(`HTTP ${checkRes.status}`);
        }
      } catch (e) {
        toast.error(`Ошибка скачивания: ${(e as Error).message}`);
        window.open(proxyUrl, "_blank", "noopener,noreferrer");
        return;
      }

      // Нативное скачивание через браузер — не буферизует файл в памяти
      setDownloadProgress((p) => ({ ...p, [formatKey]: -1 }));
      const a = document.createElement("a");
      a.href = proxyUrl;
      a.download = filename;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // Показываем уведомление (прогресс отслеживает браузер)
      toast.success(`Скачивание начато: ${filename}`);
      setTimeout(() => {
        setDownloadProgress((p) => {
          const next = { ...p };
          delete next[formatKey];
          return next;
        });
      }, 3000);
    },
    [info]
  );

  const handleCopyLink = useCallback(async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Прямая ссылка скопирована");
    } catch {
      toast.error("Не удалось скопировать");
    }
  }, []);

  const handleReset = useCallback(() => {
    setUrl("");
    setInfo(null);
    setError(null);
    setErrorCode(null);
    setDownloadProgress({});
    inputRef.current?.focus();
  }, []);

  // Cmd/Ctrl+V — вставка
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      if (document.activeElement !== inputRef.current) {
        const text = e.clipboardData?.getData("text") || "";
        if (
          text &&
          (text.includes("vk.com") || text.includes("vkvideo.ru") ||
            text.includes("rutube.ru") || text.includes("boosty.to"))
        ) {
          setUrl(text.trim());
          e.preventDefault();
        }
      }
    };
    document.addEventListener("paste", handler);
    return () => document.removeEventListener("paste", handler);
  }, []);

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Форма ввода */}
      <Card className="border-2 shadow-lg shadow-black/5 dark:shadow-black/20">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Link2 className="h-5 w-5 text-primary" />
            Ссылка на видео
          </CardTitle>
          <CardDescription>
            Вставьте URL видео из VK, Rutube или Boosty
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Input
                  ref={inputRef}
                  type="url"
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="https://vkvideo.ru/video-183207497_456242816"
                  className="pr-10 h-12 text-base"
                  disabled={loading}
                  autoFocus
                />
                {url && !loading && (
                  <button
                    type="button"
                    onClick={handleReset}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md hover:bg-muted text-muted-foreground"
                    aria-label="Очистить"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                size="default"
                className="h-12 sm:w-auto"
                onClick={handlePasteFromClipboard}
                disabled={loading}
              >
                Вставить
              </Button>
              <Button
                type="submit"
                size="default"
                className="h-12 sm:w-auto px-6"
                disabled={loading || !url.trim()}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Поиск…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Найти
                  </>
                )}
              </Button>
            </div>

            {/* Индикатор платформы */}
            {url && platform !== "unknown" && (
              <div className="flex items-center gap-2 text-sm">
                <Badge
                  variant="secondary"
                  className={`${PLATFORM_COLORS[platform].bg} ${PLATFORM_COLORS[platform].text} border-0`}
                >
                  <PlatformIcon platform={platform} className="h-3.5 w-3.5 mr-1" />
                  {PLATFORM_LABELS[platform]}
                </Badge>
                <span className="text-muted-foreground">— ссылка распознана</span>
              </div>
            )}

            {/* Быстрые примеры */}
            {!url && !loading && (
              <div className="flex flex-wrap gap-2 pt-1">
                <span className="text-xs text-muted-foreground self-center">Примеры:</span>
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex.url}
                    type="button"
                    onClick={() => setUrl(ex.url)}
                    className="text-xs px-2.5 py-1 rounded-full border border-border hover:bg-muted hover:border-foreground/20 transition-colors"
                  >
                    {ex.label}
                  </button>
                ))}
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Ошибка */}
      {error && (
        <Alert variant="destructive" className="mt-4 animate-in-fade">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>
            {errorCode === "UNSUPPORTED_URL" && "Неподдерживаемая ссылка"}
            {errorCode === "NOT_FOUND" && "Видео не найдено"}
            {errorCode === "PRIVATE_CONTENT" && "Контент недоступен"}
            {errorCode === "NETWORK_ERROR" && "Ошибка сети"}
            {errorCode === "PARSE_ERROR" && "Не удалось извлечь данные"}
            {errorCode === "RATE_LIMIT" && "Слишком много запросов"}
            {errorCode === "REGION_BLOCKED" && "Региональное ограничение"}
            {(!errorCode || errorCode === "UNKNOWN") && "Произошла ошибка"}
          </AlertTitle>
          <AlertDescription className="mt-1">
            {error}
            {errorCode === "PRIVATE_CONTENT" && (
              <div className="mt-2 text-xs opacity-90">
                Возможно, видео приватное, платное или требует авторизации на платформе.
              </div>
            )}
            {errorCode === "UNSUPPORTED_URL" && (
              <div className="mt-2 text-xs opacity-90">
                Поддерживаются: vk.com, vkvideo.ru, rutube.ru, boosty.to
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Загрузка */}
      {loading && <LoadingCard />}

      {/* Результат */}
      {info && !loading && (
        <ResultCard
          info={info}
          onDownload={handleDownload}
          onCopyLink={handleCopyLink}
          progress={downloadProgress}
          embedUrl={embedUrl}
          showPreview={showPreview}
          onTogglePreview={() => setShowPreview((v) => !v)}
        />
      )}

      {/* Дисклеймер */}
      <div className="mt-6 text-center">
        <p className="text-xs text-muted-foreground max-w-2xl mx-auto">
          <ShieldAlert className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />
          Используйте инструмент только для скачивания видео, на которые у вас есть права
          (собственный контент, общедоступные видео без авторских ограничений, видео в
          общественном достоянии). Соблюдайте правила платформ и авторские права.
        </p>
      </div>
    </div>
  );
}

/* === Под-компоненты === */

function LoadingCard() {
  return (
    <Card className="mt-4 animate-in-fade">
      <CardContent className="p-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <Skeleton className="w-full sm:w-64 aspect-video rounded-lg" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <div className="flex gap-2 pt-2">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-8 w-24" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        </div>
        <div className="mt-6 space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </CardContent>
    </Card>
  );
}

function ResultCard({
  info,
  onDownload,
  onCopyLink,
  progress,
  embedUrl,
  showPreview,
  onTogglePreview,
}: {
  info: VideoInfo;
  onDownload: (format: VideoFormat) => void;
  onCopyLink: (url: string) => void;
  progress: Record<string, number>;
  embedUrl: string | null;
  showPreview: boolean;
  onTogglePreview: () => void;
}) {
  const colors = PLATFORM_COLORS[info.platform];
  // Если доступен только embed (HTML), без прямых mp4/m3u8 — это случай VK без токена
  const hasOnlyEmbed =
    info.formats.length > 0 &&
    info.formats.every((f) => f.ext === "html");

  return (
    <Card className="mt-4 animate-in-fade overflow-hidden">
      <CardContent className="p-0">
        {/* Превью + инфо */}
        <div className="flex flex-col md:flex-row gap-4 p-4 sm:p-6">
          <div className="relative w-full md:w-80 aspect-video rounded-lg overflow-hidden bg-muted shrink-0 group">
            {showPreview && embedUrl ? (
              <iframe
                src={embedUrl}
                className="absolute inset-0 w-full h-full border-0"
                allow="autoplay; encrypted-media; fullscreen; picture-in-picture; screen-wake-lock;"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
                title={info.title}
              />
            ) : (
              <>
                {info.thumbnail ? (
                  <img
                    src={info.thumbnail}
                    alt={info.title}
                    className="absolute inset-0 w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                    <Film className="h-12 w-12" />
                  </div>
                )}
                {/* Кнопка play для предпросмотра */}
                {embedUrl && (
                  <button
                    type="button"
                    onClick={onTogglePreview}
                    className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition-colors group/play"
                    aria-label="Смотреть видео"
                  >
                    <div className="h-14 w-14 rounded-full bg-white/90 group-hover/play:bg-white flex items-center justify-center shadow-lg transition-transform group-hover/play:scale-110">
                      <Play className="h-6 w-6 text-black ml-0.5 fill-black" />
                    </div>
                  </button>
                )}
              </>
            )}
            {info.duration && !showPreview ? (
              <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-2 py-0.5 rounded font-medium tabular-nums pointer-events-none">
                <Clock className="inline h-3 w-3 mr-1 -mt-0.5" />
                {formatDuration(info.duration)}
              </div>
            ) : null}
            <div className="absolute top-2 left-2 pointer-events-none">
              <Badge
                className={`${colors.bg} ${colors.text} border-0 font-medium`}
              >
                <PlatformIcon platform={info.platform} className="h-3 w-3 mr-1" />
                {PLATFORM_LABELS[info.platform]}
              </Badge>
            </div>
          </div>

          <div className="flex-1 min-w-0 space-y-2">
            <h3 className="font-semibold text-lg leading-tight line-clamp-2 text-balance">
              {info.title}
            </h3>
            {info.author && (
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <User className="h-3.5 w-3.5" />
                <span className="truncate">{info.author}</span>
              </div>
            )}
            {info.description && (
              <p className="text-sm text-muted-foreground line-clamp-2">
                {info.description}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground pt-1">
              {info.canonicalUrl && (
                <a
                  href={info.canonicalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 hover:text-foreground underline-offset-2 hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  Открыть оригинал
                </a>
              )}
              <span>•</span>
              <span>{info.formats.length} вариантов</span>
            </div>
            {/* Кнопка предпросмотра (переключатель) */}
            {embedUrl && (
              <div className="pt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onTogglePreview}
                  className="h-7 text-xs"
                >
                  {showPreview ? (
                    <>
                      <EyeOff className="h-3.5 w-3.5 mr-1.5" />
                      Скрыть плеер
                    </>
                  ) : (
                    <>
                      <Eye className="h-3.5 w-3.5 mr-1.5" />
                      Смотреть онлайн
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Информационное сообщение для Embed-only (VK без токена) */}
        {hasOnlyEmbed && (
          <div className="mx-4 sm:mx-6 mb-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200 text-sm flex gap-2">
            <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-medium">Прямые ссылки для скачивания недоступны</p>
              <p className="text-amber-800/90 dark:text-amber-200/80 text-xs leading-relaxed">
                VK не отдал прямые MP4-ссылки для этого видео. Воспользуйтесь
                кнопкой «Смотреть онлайн» выше, либо попробуйте другую ссылку.
                Для гарантированного доступа к MP4 можно настроить{" "}
                <a
                  href="https://dev.vk.com/api/access-token/getting-started"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-amber-700 dark:hover:text-amber-100"
                >
                  VK access token
                </a>{" "}
                (env <code className="font-mono">VK_ACCESS_TOKEN</code>).
              </p>
            </div>
          </div>
        )}

        {/* Список форматов */}
        <div className="border-t bg-muted/30 p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-3">
            <FileVideo className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-sm font-medium">
              {hasOnlyEmbed
                ? "Доступно для просмотра"
                : "Доступные форматы для скачивания"}
            </h4>
          </div>
          <div className="space-y-2 max-h-[420px] overflow-y-auto scrollbar-thin pr-1">
            {info.formats.map((format, idx) => (
              <FormatRow
                key={`${format.url}-${idx}`}
                format={format}
                onDownload={() => onDownload(format)}
                onCopyLink={() => onCopyLink(format.url)}
                progress={progress[format.url]}
                isOnlyEmbed={hasOnlyEmbed}
              />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FormatRow({
  format,
  onDownload,
  onCopyLink,
  progress,
  isOnlyEmbed,
}: {
  format: VideoFormat;
  onDownload: () => void;
  onCopyLink: () => void;
  progress?: number;
  isOnlyEmbed?: boolean;
}) {
  const isStream = format.type === "stream";
  const isDownloading = progress !== undefined && progress !== 100;
  const isDone = progress === 100;
  const isEmbed = format.ext === "html";

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:shadow-sm transition-shadow">
      <div className="flex items-center gap-2 shrink-0">
        <Badge
          variant={isStream ? "outline" : "secondary"}
          className={`tabular-nums font-mono ${isStream && !isEmbed ? "text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-800" : ""} ${isEmbed ? "text-muted-foreground border-border" : ""}`}
        >
          {format.quality}
        </Badge>
        <span className="text-xs text-muted-foreground uppercase">{format.ext}</span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">
          {format.label || `${format.quality} ${format.ext.toUpperCase()}`}
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {format.size ? `${formatBytes(format.size)} • ` : ""}
          {isEmbed
            ? "Embed-плеер (только просмотр)"
            : isStream
              ? "Адаптивный поток (HLS)"
              : "Прямой файл (MP4)"}
        </div>
        {isDownloading && (
          <div className="mt-1.5 h-1.5 bg-muted rounded-full overflow-hidden">
            {progress! > 0 ? (
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${progress}%` }}
              />
            ) : (
              <div className="h-full bg-primary animate-pulse w-full" />
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {!isEmbed && (
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={onCopyLink}
                  className="h-8 w-8"
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Скопировать прямую ссылку</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        <Button
          size="sm"
          onClick={onDownload}
          disabled={isDownloading}
          variant={isEmbed || isStream ? "outline" : "default"}
          className="h-8"
        >
          {isDone ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5 text-emerald-500" />
              Готово
            </>
          ) : isDownloading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              {progress! > 0 ? `${progress}%` : "Скачивание…"}
            </>
          ) : (
            <>
              <Download className="h-3.5 w-3.5 mr-1.5" />
              {isEmbed
                ? "Открыть плеер"
                : isStream
                  ? "Открыть"
                  : "Скачать"}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function PlatformIcon({
  platform,
  className,
}: {
  platform: Platform;
  className?: string;
}) {
  // Используем букву платформы внутри круга — просто и универсально
  const letter =
    platform === "vk" ? "VK" :
    platform === "rutube" ? "Ru" :
    platform === "boosty" ? "B" : "?";
  return (
    <span
      className={`inline-flex items-center justify-center font-bold leading-none ${className || ""}`}
      aria-hidden
    >
      {letter}
    </span>
  );
}

function sanitizeFilename(s: string): string {
  return s
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 100);
}

/**
 * Получить URL для встраивания видео через iframe (для предпросмотра).
 * Возвращает null если embed невозможен.
 */
function getEmbedUrl(info: VideoInfo): string | null {
  // Если в форматах уже есть embed-URL — используем его
  const embedFormat = info.formats.find((f) => f.ext === "html");
  if (embedFormat) return embedFormat.url;

  // Иначе строим embed URL по платформе
  switch (info.platform) {
    case "vk": {
      // videoId в формате "oid_id"
      const parts = info.videoId?.split("_");
      if (!parts || parts.length !== 2) return null;
      const [oid, id] = parts;
      return `https://vk.com/video_ext.php?oid=${oid}&id=${id}&hd=2&autoplay=0`;
    }
    case "rutube": {
      // Используем embed по videoId (track_id)
      if (!info.videoId) return null;
      return `https://rutube.ru/play/embed/${info.videoId}`;
    }
    case "boosty": {
      // У Boosty нет отдельного embed — возвращаем canonical URL
      return info.canonicalUrl || info.originalUrl;
    }
    default:
      return null;
  }
}

const EXAMPLES = [
  { label: "VK Видео", url: "https://vkvideo.ru/video-183207497_456242816" },
  { label: "Rutube", url: "https://rutube.ru/video/c1f5c5f5e5f5e5f5e5f5e5f5e5f5e5f5/" },
  { label: "Boosty", url: "https://boosty.to/example/posts/123456" },
];
