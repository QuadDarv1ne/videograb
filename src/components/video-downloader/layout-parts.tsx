"use client";

import { useTheme } from "next-themes";
import { Moon, Sun, Download, Github, GraduationCap, MessageCircle, Briefcase, ExternalLink, Code2, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useEffect, useState } from "react";

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // next-themes на сервере возвращает undefined; рендерим кнопку только после гидратации
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="h-9 w-9" aria-hidden />;
  }
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      aria-label="Переключить тему"
    >
      {resolvedTheme === "dark" ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
    </Button>
  );
}

export function Header() {
  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary text-primary-foreground">
            <Download className="h-4 w-4" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="font-bold text-lg tracking-tight">VideoGrab</span>
            <span className="text-xs text-muted-foreground hidden sm:inline">
              · VK / Rutube / Boosty
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

/* === Ссылки автора === */

const AUTHOR_LINKS = [
  {
    href: "https://github.com/QuadDarv1ne",
    label: "GitHub",
    sublabel: "@QuadDarv1ne",
    icon: Github,
    description: "Исходный код проектов и open-source разработки",
  },
  {
    href: "https://school-maestro7it.ru/",
    label: "Maestro7IT",
    sublabel: "Школа программирования",
    icon: GraduationCap,
    description: "Курсы по C++, Python, Docker и видеомонтажу для начинающих",
  },
  {
    href: "https://vk.com/maestro7it",
    label: "VK Группа",
    sublabel: "@maestro7it",
    icon: MessageCircle,
    description: "Сообщество школы и канала Maestro7IT в ВКонтакте",
  },
  {
    href: "https://kwork.ru/user/dupley_mi",
    label: "Kwork",
    sublabel: "@dupley_mi",
    icon: Briefcase,
    description: "Услуги разработки и фриланса на бирже Kwork",
  },
];

export function Footer() {
  return (
    <footer className="mt-auto border-t bg-muted/30">
      <div className="mx-auto max-w-6xl px-4 py-10 space-y-8">
        {/* Верхняя часть: бренд + автор */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center h-7 w-7 rounded-md bg-primary text-primary-foreground">
              <Download className="h-3.5 w-3.5" />
            </div>
            <span>
              <span className="font-semibold text-foreground">VideoGrab</span>
              {" — "}
              инструмент для скачивания видео
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span>
              Поддерживаются:{" "}
              <span className="font-medium text-foreground">VK · Rutube · Boosty</span>
            </span>
          </div>
        </div>

        {/* Секция автора */}
        <Card className="border-border/60 bg-card/40">
          <CardContent className="p-5 sm:p-6">
            <div className="flex flex-col gap-5">
              {/* Заголовок секции */}
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <Code2 className="h-4 w-4 text-primary" />
                  <h3 className="font-semibold text-sm tracking-wide uppercase text-muted-foreground">
                    Разработчик
                  </h3>
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">Автор проекта: </span>
                  <span className="font-semibold text-foreground">Дуплей Максим Игоревич</span>
                </div>
              </div>

              {/* Сетка ссылок */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {AUTHOR_LINKS.map((link) => {
                  const Icon = link.icon;
                  return (
                    <a
                      key={link.href}
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex flex-col gap-1.5 p-3 rounded-lg border border-border/60 hover:border-foreground/20 hover:bg-background/80 transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                          <span className="font-medium text-sm">{link.label}</span>
                        </div>
                        <ExternalLink className="h-3 w-3 text-muted-foreground/60 group-hover:text-foreground transition-colors" />
                      </div>
                      <div className="text-xs text-muted-foreground font-mono">
                        {link.sublabel}
                      </div>
                      <div className="text-xs text-muted-foreground/80 leading-snug mt-0.5">
                        {link.description}
                      </div>
                    </a>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Копирайт */}
        <div className="pt-4 border-t text-xs text-muted-foreground text-center space-y-1.5">
          <p className="flex items-center justify-center gap-1.5 flex-wrap">
            <span>
              © {new Date().getFullYear()} VideoGrab. Разработано с
            </span>
            <Heart className="h-3 w-3 fill-rose-500 text-rose-500" />
            <span>
              <a
                href="https://github.com/QuadDarv1ne"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-foreground hover:underline underline-offset-2"
              >
                Дуплеем Максимом Игоревичем
              </a>
            </span>
            <span>·</span>
            <a
              href="https://school-maestro7it.ru/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-foreground hover:underline underline-offset-2"
            >
              Школа программирования Maestro7IT
            </a>
          </p>
          <p className="text-muted-foreground/70">
            Используйте сервис только для контента, на который у вас есть права.
          </p>
        </div>
      </div>
    </footer>
  );
}
