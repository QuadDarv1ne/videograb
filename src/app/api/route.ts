import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    name: "VideoGrab API",
    version: "0.2.0",
    endpoints: {
      extract: { path: "/api/extract", method: "POST", description: "Извлечение информации о видео" },
      download: { path: "/api/download", method: "GET", description: "Прокси для скачивания видео" },
    },
    supported: ["vk", "rutube", "boosty"],
  });
}