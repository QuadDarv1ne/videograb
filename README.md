# VideoGrab — Скачивание видео из VK, Rutube и Boosty

Веб-приложение для скачивания видео с трёх популярных российских видеоплатформ.
Построено на **Next.js 16** с **TypeScript**, **Tailwind CSS 4** и **shadcn/ui**.

![Platform](https://img.shields.io/badge/platform-Next.js%2016-black)
![Language](https://img.shields.io/badge/language-TypeScript-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## Возможности

- **VK Видео** (vk.com, vkvideo.ru) — извлекает прямые MP4-ссылки (1080p) и HLS-потоки всех качеств (144p, 240p, 360p, 480p, 720p, 1080p) из embed-страницы без необходимости в OAuth-токене. При наличии `VK_ACCESS_TOKEN` используется официальный API для расширенного доступа.
- **Rutube** (rutube.ru) — извлекает HLS-потоки всех качеств через публичные API `rutube.ru/api/video/` и `rutube.ru/api/play/options/`.
- **Boosty** (boosty.to) — поддержка публичных постов через API `api.boosty.to`.
- **Предпросмотр онлайн** — встроенный iframe-плеер для просмотра видео перед скачиванием.
- **Прокси-сервер для скачивания** — обходит CORS, поддерживает Range-запросы для докачки.
- **Адаптивный UI** — мобильная и десктоп-версии, светлая/тёмная тема.
- **SSRF-защита** — блокировка доступа к localhost/private IP/metadata endpoints.

## Поддерживаемые форматы ссылок

### VK
```
https://vk.com/video-12345_67890
https://vkvideo.ru/video-12345_67890
https://vk.com/clip-12345_67890
https://vk.com/video_ext.php?oid=-12345&id=67890&hash=abc123
```

### Rutube
```
https://rutube.ru/video/HASH/
https://rutube.ru/shorts/HASH/
https://rutube.ru/play/embed/12345/
https://rutube.ru/tracks/12345.html
```

### Boosty
```
https://boosty.to/USER/posts/POST_ID
```

## Запуск проекта

### Требования
- **Node.js 18+** или **Bun 1.0+**
- **npm** / **pnpm** / **yarn** / **bun** (на выбор)

### Установка и локальный запуск

```bash
# 1. Установить зависимости
bun install
# или: npm install

# 2. (Опционально) Настроить переменные окружения
cp .env.example .env
# отредактировать .env при необходимости

# 3. Запустить dev-сервер
bun run dev
# или: npm run dev
```

Приложение будет доступно на http://localhost:3000

### Сборка для production

```bash
bun run build
bun run start
# или: npm run build && npm run start
```

## Переменные окружения

Создайте файл `.env` в корне проекта (см. `.env.example`):

```bash
# Опционально: VK access token для расширенного доступа к API
# Получить: https://dev.vk.com/api/access-token/getting-started
# Без токена VK-видео извлекается через embed-страницу (MP4 1080p + HLS)
VK_ACCESS_TOKEN=

# Максимальная длительность API-запроса (секунды)
# По умолчанию 30
MAX_DURATION=30
```

## Архитектура

```
src/
├── app/
│   ├── api/
│   │   ├── extract/route.ts      # POST — извлечение метаданных видео
│   │   └── download/route.ts     # GET  — прокси-скачивание файла
│   ├── layout.tsx                # Root layout с ThemeProvider
│   ├── page.tsx                  # Главная страница
│   └── globals.css               # Tailwind + кастомные стили
├── components/
│   ├── ui/                       # shadcn/ui компоненты
│   └── video-downloader/
│       ├── video-downloader.tsx  # Главный компонент: форма + результат
│       ├── platform-info.tsx     # Секции: платформы, преимущества, FAQ
│       └── layout-parts.tsx      # Header, Footer, секция автора
└── lib/
    ├── extractors/
    │   ├── types.ts              # Общие типы (VideoInfo, VideoFormat, ExtractorError)
    │   ├── http.ts               # fetchText/fetchJson с кодировками, утилиты
    │   ├── vk.ts                 # Экстрактор VK (embed + API + HLS парсер)
    │   ├── rutube.ts             # Экстрактор Rutube (API + HLS парсер)
    │   ├── boosty.ts             # Экстрактор Boosty (API)
    │   └── index.ts              # Роутер: detectPlatform + extractVideo
    └── utils.ts                  # Утилиты shadcn
```

## API

### `POST /api/extract`

Извлекает информацию о видео и доступные форматы для скачивания.

**Запрос:**
```json
{
  "url": "https://vkvideo.ru/video-183207497_456242816"
}
```

**Ответ (успех):**
```json
{
  "ok": true,
  "info": {
    "platform": "vk",
    "title": "Название видео",
    "thumbnail": "https://...",
    "duration": 5181,
    "author": "Автор",
    "description": "Описание",
    "formats": [
      {
        "quality": "1080p",
        "url": "https://...mp4",
        "ext": "mp4",
        "type": "video",
        "label": "MP4 1080p"
      },
      {
        "quality": "HLS",
        "url": "https://...m3u8",
        "ext": "m3u8",
        "type": "stream",
        "label": "HLS (адаптивный)"
      }
    ],
    "videoId": "-183207497_456242816",
    "fetchedAt": "2026-07-05T18:00:00.000Z"
  }
}
```

**Коды ошибок:**
- `400` — `BAD_REQUEST` / `UNSUPPORTED_URL`
- `403` — `PRIVATE_CONTENT`
- `404` — `NOT_FOUND`
- `429` — `RATE_LIMIT`
- `502` — `NETWORK_ERROR` / `PARSE_ERROR`

### `GET /api/download`

Проксирует видеофайл с добавлением `Content-Disposition: attachment`.

**Параметры:**
- `url` — URL видеофайла (обязательный)
- `filename` — имя файла для сохранения (обязательный)

**Пример:**
```
GET /api/download?url=https%3A%2F%2Fexample.com%2Fvideo.mp4&filename=my_video.mp4
```

Поддерживает Range-запросы (для докачки) и stream-передачу больших файлов.

## Технологии

| Категория | Технология |
|-----------|-----------|
| Framework | Next.js 16 (App Router) |
| Язык | TypeScript 5 |
| Стилизация | Tailwind CSS 4 |
| UI-компоненты | shadcn/ui (New York style) |
| Иконки | lucide-react |
| Тосты | sonner |
| Темы | next-themes |
| Шрифты | Geist Sans + Geist Mono |
| Runtime | Node.js (API routes) |

## Как это работает

### Извлечение VK-видео (без токена)

1. Парсим URL → получаем `oid` и `id`.
2. Запрашиваем `https://vk.com/video_ext.php?oid=...&id=...` с browser-like заголовками.
3. Декодируем HTML (VK использует кодировку windows-1251).
4. Находим JSON-блок с ключом `"files"` — внутри него:
   - `mp4_1080` — прямой MP4 URL (1080p)
   - `hls_ondemand` — master HLS-плейлист со всеми качествами
5. Парсим master HLS-плейлист — извлекаем 6 качеств (mobile/lowest/low/medium/high/fullhd = 144p–1080p).
6. Возвращаем 8 форматов: 1 MP4 + 6 HLS-качеств + 1 адаптивный HLS.

### Извлечение Rutube-видео

1. Парсим URL → получаем `hash` или `id`.
2. Запрашиваем `https://rutube.ru/api/video/{id}/?format=json` — получаем метаданные и `track_id`.
3. Запрашиваем `https://rutube.ru/api/play/options/{track_id}/?format=json&p=gl` — получаем `video_balancer.m3u8`.
4. Парсим master HLS-плейлист — извлекаем все варианты качества.

### Извлечение Boosty-видео

1. Парсим URL → получаем `user` и `postId`.
2. Запрашиваем `https://api.boosty.to/v1/blog/{user}/post/{postId}`.
3. Если пост публичный — извлекаем видео-URL из `data[].content`.
4. Если 418/403 — показываем понятное сообщение про антибот-защиту.

## Ограничения

- **VK**: для приватных видео и видео с возрастным ограничением может потребоваться `VK_ACCESS_TOKEN`.
- **VK HLS**: нельзя скачать одним файлом через браузер — нужен ffmpeg/yt-dlp. Прямой MP4 (1080p) скачивается без проблем.
- **Boosty**: большинство контента платное/приватное — работает только с публичными постами.
- **Прокси-сервер**: максимальная длительность запроса 5 минут (настраивается через `maxDuration`).

## Правовой дисклеймер

Используйте сервис только для скачивания видео, на которые у вас есть права:
- собственный контент;
- видео в общественном достоянии;
- контент под свободной лицензией (Creative Commons и т.п.).

Скачивание и распространение чужих видео без разрешения правообладателя может нарушать:
- условия использования платформ (VK, Rutube, Boosty);
- ГК РФ (ст. 1229 — исключительное право);
- применимое международное законодательство об авторском праве.

Администрация сервиса не хранит скачанный контент и не несёт ответственности за действия пользователей.

## Разработчик

**Дуплей Максим Игоревич**

- GitHub: [@QuadDarv1ne](https://github.com/QuadDarv1ne)
- Школа программирования Maestro7IT: [school-maestro7it.ru](https://school-maestro7it.ru/)
- VK группа: [@maestro7it](https://vk.com/maestro7it)
- Kwork: [@dupley_mi](https://kwork.ru/user/dupley_mi)

## Лицензия

MIT License — см. [LICENSE](LICENSE).

Используйте на свой риск и соблюдайте авторские права.
