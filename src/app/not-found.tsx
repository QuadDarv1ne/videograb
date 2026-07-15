import { FileQuestion } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4 max-w-md text-center px-4">
        <FileQuestion className="h-12 w-12 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Страница не найдена</h1>
        <p className="text-sm text-muted-foreground">
          Запрашиваемая страница не существует или была перемещена.
        </p>
        <Link href="/">
          <Button variant="default">На главную</Button>
        </Link>
      </div>
    </div>
  );
}
