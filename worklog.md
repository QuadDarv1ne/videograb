# Worklog: VideoGrab — Скачивание видео из VK, Rutube, Boosty

---
Task ID: 1
Agent: main (Claude)
Task: Создать веб-приложение для скачивания видео из VK, Rutube и Boosty

Work Log:
- Инициализирован fullstack-проект Next.js 16 + TypeScript через z.ai skill
- Спроектирована архитектура: API routes + библиотека экстракторов
- Созданы экстракторы:
  - `src/lib/extractors/vk.ts` — парсит vk.com и vkvideo.ru, поддерживает VK API с access_token (env `VK_ACCESS_TOKEN`) и fallback на embed
  - `src/lib/extractors/rutube.ts` — использует публичные API `rutube.ru/api/video/{id}/` и `rutube.ru/api/play/options/{track_id}/`, парсит HLS master playlist для извлечения отдельных качеств
  - `src/lib/extractors/boosty.ts` — парсит публичный API Boosty, корректно обрабатывает 418/403 антибот-ответы
- Созданы API routes:
  - `POST /api/extract` — принимает URL, возвращает VideoInfo (заголовок, превью, длительность, форматы)
  - `GET /api/download` — прокси для скачивания файла с правильным Content-Disposition, поддержкой Range-запросов и SSRF-защитой
- Разработан UI (TypeScript, React 19, Tailwind CSS 4, shadcn/ui):
  - Hero-секция с инпутом URL, автоопределением платформы, быстрыми примерами
  - Карточка результата с превью, заголовком, автором, описанием, длительностью
  - Список форматов с кнопками «Скачать»/«Открыть», индикатором прогресса, копированием ссылки
  - Спец-сообщение для случая, когда доступен только Embed (VK без токена)
  - Секция с описанием платформ, преимуществами, FAQ (7 вопросов), правовым дисклеймером
  - Поддержка светлой/тёмной темы через next-themes
  - Адаптивный дизайн (mobile-first)
- Пройден ESLint без ошибок
- End-to-end верификация через Agent Browser:
  - Rutube: ✅ корректно извлекаются 9 форматов (HLS + 8 качеств от 144p до 720p)
  - VK: ✅ корректно извлекаются заголовок, описание, длительность, embed URL; показывается понятное сообщение про необходимость access token
  - Boosty: ✅ показывается понятное сообщение про антибот-защиту/приватность
  - Скачивание через прокси: ✅ работает с SSRF-защитой
  - Тёмная тема, мобильный вид: ✅ корректны

Stage Summary:
- Готовый веб-сайт VideoGrab с поддержкой 3 платформ
- Архитектура расширяемая — легко добавить новые платформы
- VK требует access token для прямого скачивания (задокументировано)
- Rutube полностью функционален (HLS-потоки разных качеств)
- Boosty в основном требует авторизации (антибот-защита), но даёт понятные сообщения
- Все ошибки обработаны и показываются пользователю дружелюбно
- SSRF-защита в download-прокси
- Production-ready код, проходит ESLint

---
Task ID: 2
Agent: main (Claude)
Task: Добавить секцию с автором и ссылками в footer

Work Log:
- Обновлён компонент `src/components/video-downloader/layout-parts.tsx`
- Добавлена карточка "Разработчик" с именем автора: Дуплей Максим Игоревич
- Создана сетка из 4 ссылок с иконками и описаниями:
  - GitHub (@QuadDarv1ne) — https://github.com/QuadDarv1ne
  - Maestro7IT (Школа программирования) — https://school-maestro7it.ru/
  - VK Группа (@maestro7it) — https://vk.com/maestro7it
  - Kwork (@dupley_mi) — https://kwork.ru/user/dupley_mi
- Обновлён нижний копирайт: теперь упоминает автора и школу Maestro7IT
- Ссылки открываются в новой вкладке с rel="noopener noreferrer"
- Адаптивная вёрстка: 4 колонки на desktop, 1 колонка на mobile
- Добавлены иконки lucide-react: Github, GraduationCap, MessageCircle, Briefcase, ExternalLink, Code2, Heart
- ESLint: проходит без ошибок
- Agent Browser: проверено отображение на desktop и mobile, все ссылки кликабельны и ведут на правильные URL

Stage Summary:
- Footer теперь содержит полноценную секцию с автором проекта
- 4 ссылки с описаниями и иконками
- Имя автора указано в заголовке секции и в копирайте
- Школа Maestro7IT упомянута как в карточке ссылок, так и в копирайте

---
Task ID: 3
Agent: main (Claude)
Task: Улучшить проект — реализовать реальное скачивание VK-видео + создать архив

Work Log:
- Исследован VK embed-контент: обнаружено что VK отдаёт JSON-блок с ключом "files" в HTML embed-страницы
  - Внутри: mp4_1080 (прямой MP4 URL), hls_ondemand (master HLS-плейлист), dash_ondemand
  - HLS master playlist содержит 6 качеств: mobile(144p), lowest(240p), low(360p), medium(480p), high(720p), fullhd(1080p)
  - Также доступны метаданные: title, duration, description (через JSON поля)
- Полностью переписан `src/lib/extractors/vk.ts`:
  - Корректная обработка кодировки windows-1251
  - Извлечение "files" объекта через сбалансированный JSON-парсер
  - Парсинг master HLS-плейлиста с VK-специфичными QUALITY=mobile|lowest|low|medium|high|fullhd|quadhd|octohd
  - Поддержка VK access token через env (опционально, для расширенного доступа)
  - Fallback на embed-плеер если прямые ссылки недоступны
- Реальные тесты:
  - Ссылка https://vkvideo.ru/video-183207497_456242816 успешно извлекает 8 форматов
  - Скачан тестовый 5MB MP4 через /api/download — валидный ISO Media MP4 v1
  - UI прогресс-бар работает (показывает проценты при стриминг-скачивании)
- Добавлен предпросмотр видео через iframe embed-плеер:
  - Кнопка play на превью + кнопка "Смотреть онлайн" в инфо
  - iframe для VK (video_ext.php), Rutube (play/embed), Boosty (canonical URL)
  - Переключатель "Смотреть онлайн"/"Скрыть плеер"
- Создана документация:
  - README.md — полная инструкция по запуску, API, архитектуре, ограничениям
  - .env.example — пример переменных окружения
  - LICENSE — MIT лицензия с указанием автора
- ESLint: проходит без ошибок
- Agent Browser: проверено отображение превью, кнопок, скачивания

Stage Summary:
- VK-видео теперь РЕАЛЬНО скачивается (1 MP4 1080p + 6 HLS качеств + адаптивный HLS)
- Добавлен встроенный плеер для просмотра онлайн перед скачиванием
- Создана полная документация проекта (README.md, .env.example, LICENSE)
- Проект готов к упаковке в архив

---
Task ID: 4
Agent: main (Claude)
Task: Улучшения безопасности, исправление ошибок, SEO-активы

Work Log:
- Исправлен фейковый Rutube-пример в UI (`EXAMPLES`): заменён на реальный рабочий
  URL, проверенный через `rutube.ru/api/video/` и `api/play/options` (HLS доступен,
  acl_access.allowed = true)
- Исправлена сортировка форматов в `src/lib/extractors/rutube.ts`:
  раньше "HLS (адаптивный)" и "LIVE" попадали в начало списка; теперь качества
  идут по убыванию (1080p → 144p), затем мастер-HLS, затем LIVE — согласовано с VK
- Исправлен `extractField` в `src/lib/extractors/vk.ts`: теперь поддерживает
  экранированные кавычки (\") внутри JSON-значений — заголовки с кавычками
  больше не обрезаются
- `POST /api/extract`:
  - добавлен rate limiting (sliding window, 20 запросов/мин с IP,
    настраивается через `RATE_LIMIT_PER_MINUTE`)
  - `UNSUPPORTED_URL` теперь возвращает 400 вместо 404
  - лимит размера тела запроса (8 КБ) + проверка Content-Type
  - 429 с заголовком `Retry-After: 60`
- Раздел `/api/download` в безопасности:
  - DNS-резолв каждого хоста (включая редиректы) с проверкой ВСЕХ полученных
    IPv4/IPv6 на приватные диапазоны — защита от DNS-rebinding (fail-closed)
  - редиректы вынесены в общую функцию `fetchWithRedirects` (макс. 5, каждый
    проверяется), HEAD тоже следует редиректам корректно
  - добавлен `maxDuration = 300`, хост `vkuser.net` в allowlist
  - нормальный обработчик: "Редирект на небезопасный адрес" → 403,
    "Слишком много редиректов" → 502
- `next.config.ts`: `poweredByHeader: false` + security headers
  (X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, COOP)
- Живое тестирование production-сборки выявило и исправило:
  - Инвертированная сортировка форматов в vk.ts и rutube.ts: компаратор
    `rank(b) - rank(a)` ставил 144p в начало списка; исправлено на
    `rank(a) - rank(b)`, мастер-HLS/LIVE уехали в самый низ списка
  - Rutube: мастер-плейлист содержал дубликаты каждого качества — добавлен
    дедуп по паре "разрешение|битрейт"
  - VK отдаёт MP4 через новый CDN `vkvd*.okcdn.ru` — домен добавлен в
    allowlist /api/download (без этого скачивание реальное было бы заблокировано)
  - `POST /api/extract` для Rutube при HTTP 403 теперь возвращает понятное
    сообщение про антибот-защиту вместо сырой NETWORK_ERROR
- Создан `public/og-image.png` (1200×630, сгенерирован через sharp) — был
  заявлен в metadata (openGraph/twitter), но отсутствовал
- Добавлен `src/app/sitemap.ts` + ссылка на sitemap.xml в `robots.txt`
- Frontend:
  - кнопка для HLS-потоков больше не открывает .m3u8 в новой вкладке
    (браузер скачивал его как текстовый файл) — теперь копирует прямую ссылку
    и показывает подсказку про yt-dlp/ffmpeg/VLC
  - исправлен отступ в атрибутах iframe
- Версия проекта поднята до 0.3.0 (package.json + /api/route.ts)
- README, .env.example обновлены документацией новых фич
- ESLint + next build: пройдены без ошибок

Stage Summary:
- API-роуты защищены: rate limiting на /api/extract, двойная SSRF-защита
  (allowlist + DNS/приватные IP) на /api/download
- Заполнены пробелы SEO: og-image.png, sitemap.xml
- Исправлены реальные баги сортировки форматов, парсинга JSON-полей VK,
  поведения кнопок HLS
- Проект готов к production-деплою
