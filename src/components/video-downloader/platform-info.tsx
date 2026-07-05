"use client";

import {
  Film,
  Youtube,
  Heart,
  Shield,
  Zap,
  Globe,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";

const PLATFORMS = [
  {
    id: "vk",
    name: "VK Видео",
    icon: Film,
    color: "text-rose-600 dark:text-rose-400",
    bg: "bg-rose-50 dark:bg-rose-950/30",
    description: "Видео из ВКонтакте и vkvideo.ru",
    examples: [
      "vk.com/video-12345_67890",
      "vkvideo.ru/video-12345_67890",
      "vk.com/clip-12345_67890",
    ],
    features: [
      { ok: true, text: "Публичные видео" },
      { ok: true, text: "Клипы VK" },
      { ok: false, text: "Приватные видео (требуют входа)" },
    ],
  },
  {
    id: "rutube",
    name: "Rutube",
    icon: Youtube,
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
    description: "Видео и Shorts из Rutube",
    examples: [
      "rutube.ru/video/HASH/",
      "rutube.ru/shorts/HASH/",
      "rutube.ru/play/embed/123/",
    ],
    features: [
      { ok: true, text: "Публичные видео" },
      { ok: true, text: "Прямые MP4-ссылки" },
      { ok: true, text: "HLS-потоки" },
    ],
  },
  {
    id: "boosty",
    name: "Boosty",
    icon: Heart,
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-950/30",
    description: "Видео из публичных постов Boosty",
    examples: [
      "boosty.to/user/posts/123",
    ],
    features: [
      { ok: true, text: "Бесплатные публичные посты" },
      { ok: false, text: "Платные посты (нужен логин)" },
      { ok: false, text: "Приватные посты" },
    ],
  },
];

const FEATURES = [
  {
    icon: Zap,
    title: "Быстро",
    description: "Прямые ссылки без водяных знаков и ожидания. Скачивание в один клик.",
  },
  {
    icon: Shield,
    title: "Безопасно",
    description: "Видео проксируется через наш сервер. Никакой рекламы и попапов.",
  },
  {
    icon: Globe,
    title: "3 платформы",
    description: "VK Видео, Rutube и Boosty в одном месте — переключаться не нужно.",
  },
  {
    icon: CheckCircle2,
    title: "Качество на выбор",
    description: "От 240p до 1080p, плюс HLS-потоки для адаптивного просмотра.",
  },
];

const FAQ = [
  {
    q: "Какие ссылки поддерживаются?",
    a: "Поддерживаются прямые ссылки на видео из VK (vk.com, vkvideo.ru), Rutube (rutube.ru) и Boosty (boosty.to). Просто скопируйте URL из адресной строки браузера или кнопки «Поделиться» на платформе и вставьте его в форму.",
  },
  {
    q: "Почему некоторые видео не получается скачать?",
    a: "Чаще всего это связано с тем, что видео приватное, платное (на Boosty), либо защищено авторскими правами и доступно только для авторизованных пользователей. Также некоторые платформы блокируют прямой доступ по регионам. В таких случаях инструмент вернёт понятное сообщение об ошибке.",
  },
  {
    q: "Что такое HLS-поток и чем он отличается от MP4?",
    a: "HLS (m3u8) — это адаптивный потоковый формат, который разбивает видео на маленькие сегменты. Его нельзя скачать одним файлом через браузер — нужны специальные утилиты вроде yt-dlp или ffmpeg. MP4 — это обычный видеофайл, который скачивается целиком и сохраняется на устройство.",
  },
  {
    q: "Сохраняете ли вы скачанные видео?",
    a: "Нет. Видео проходит через наш сервер в режиме реального времени и сразу отправляется в ваш браузер. Мы не храним ни сами файлы, ни историю скачиваний. Логируются только обезличенные метрики количества запросов для мониторинга нагрузки.",
  },
  {
    q: "Законно ли скачивать видео с этих платформ?",
    a: "Скачивание видео для личного просмотра, как правило, допустимо, но распространение или коммерческое использование чужого контента без разрешения правообладателя может нарушать условия использования платформы и законодательство об авторском праве. Используйте инструмент ответственно и только для контента, на который у вас есть права.",
  },
  {
    q: "Почему файлы иногда скачиваются медленно?",
    a: "Скорость зависит от пропускной способности источника (платформы) и от того, насколько далеко сервер расположен от вас. Для больших файлов поддерживается докачка (Range-запросы) — если скачивание прервалось, можно попробовать ещё раз.",
  },
  {
    q: "Нужно ли устанавливать программу?",
    a: "Нет, всё работает прямо в браузере. Достаточно вставить ссылку, нажать «Найти» и выбрать подходящий формат. Для HLS-потоков может потребоваться внешний плеер (VLC) или утилита yt-dlp.",
  },
];

export function PlatformInfo() {
  return (
    <section className="w-full max-w-5xl mx-auto space-y-12">
      {/* Поддерживаемые платформы */}
      <div>
        <div className="text-center mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Поддерживаемые платформы
          </h2>
          <p className="mt-2 text-muted-foreground">
            Три популярные российские видеоплатформы в одном инструменте
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {PLATFORMS.map((p) => {
            const Icon = p.icon;
            return (
              <Card key={p.id} className="relative overflow-hidden">
                <CardHeader className="pb-3">
                  <div
                    className={`inline-flex items-center justify-center h-12 w-12 rounded-xl ${p.bg} ${p.color} mb-2`}
                  >
                    <Icon className="h-6 w-6" />
                  </div>
                  <CardTitle className="flex items-center justify-between">
                    {p.name}
                  </CardTitle>
                  <CardDescription>{p.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Примеры URL
                    </div>
                    {p.examples.map((ex) => (
                      <code
                        key={ex}
                        className="block text-xs text-foreground/80 bg-muted px-2 py-1 rounded font-mono break-all"
                      >
                        {ex}
                      </code>
                    ))}
                  </div>
                  <div className="space-y-1">
                    {p.features.map((f) => (
                      <div
                        key={f.text}
                        className="flex items-center gap-2 text-sm"
                      >
                        {f.ok ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                        ) : (
                          <XCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                        )}
                        <span className={f.ok ? "" : "text-muted-foreground line-through"}>
                          {f.text}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Преимущества */}
      <div>
        <div className="text-center mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Почему VideoGrab
          </h2>
          <p className="mt-2 text-muted-foreground">
            Простой и быстрый способ сохранить видео
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <Card key={f.title} className="text-center">
                <CardContent className="pt-6">
                  <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-primary/10 text-primary mb-3">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="font-semibold mb-1">{f.title}</h3>
                  <p className="text-sm text-muted-foreground text-balance">
                    {f.description}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* FAQ */}
      <div>
        <div className="text-center mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Частые вопросы
          </h2>
          <p className="mt-2 text-muted-foreground">
            Что нужно знать о скачивании видео
          </p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <Accordion type="single" collapsible className="w-full">
              {FAQ.map((item, idx) => (
                <AccordionItem key={idx} value={`item-${idx}`}>
                  <AccordionTrigger className="text-left hover:no-underline">
                    {item.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground leading-relaxed">
                    {item.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      </div>

      {/* Дисклеймер */}
      <Card className="border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <Shield className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-2 text-sm">
              <h3 className="font-semibold text-amber-900 dark:text-amber-200">
                Правовой дисклеймер
              </h3>
              <p className="text-amber-800/90 dark:text-amber-200/80 leading-relaxed">
                VideoGrab — это инструмент для скачивания видео, на которые у вас есть
                права: собственный контент, видео в общественном достоянии, либо контент,
                распространяемый по свободной лицензии. Скачивание и распространение
                чужих видео без разрешения правообладателя может нарушать условия
                использования платформ (VK, Rutube, Boosty) и применимое законодательство
                об авторском праве (ст. 1229 ГК РФ, ст. 992 ГК РБ, и др.).
              </p>
              <p className="text-amber-800/90 dark:text-amber-200/80 leading-relaxed">
                Используя этот сервис, вы подтверждаете, что несёте полную
                ответственность за соблюдение авторских прав и правил платформ.
                Администрация сервиса не хранит и не передаёт третьим лицам
                скачанный контент.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
