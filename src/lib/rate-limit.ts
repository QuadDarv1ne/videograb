/**
 * Простой in-memory rate limiter (sliding window per IP).
 *
 * Подходит для single-instance деплоя (Caddy + один процесс Next.js).
 * Для multi-instance развёртываний следует заменить на Redis/стороннее решение.
 */

import type { NextRequest } from "next/server";

const WINDOW_MS = 60_000;
const MAX_BUCKETS = 10_000;

const buckets = new Map<string, number[]>();

/** Достать IP клиента из заголовков прокси (Caddy) или из req.ip. */
export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp;
  return "unknown";
}

/**
 * Проверить лимит запросов для IP в скользящем окне.
 * Возвращает false, если лимит исчерпан (запрос следует отклонить с 429).
 */
export function checkRateLimit(
  ip: string,
  maxRequests: number,
  windowMs: number = WINDOW_MS
): boolean {
  const now = Date.now();
  let timestamps = buckets.get(ip);
  if (!timestamps) {
    timestamps = [];
    buckets.set(ip, timestamps);
  }

  // Оставляем только запросы в пределах окна
  const cutoff = now - windowMs;
  while (timestamps.length > 0 && timestamps[0] < cutoff) {
    timestamps.shift();
  }

  if (timestamps.length >= maxRequests) return false;

  timestamps.push(now);

  // Периодическая очистка осиротевших записей
  if (buckets.size > MAX_BUCKETS) {
    for (const [key, ts] of buckets) {
      const last = ts[ts.length - 1] ?? 0;
      if (now - last > windowMs * 10) buckets.delete(key);
    }
  }

  return true;
}