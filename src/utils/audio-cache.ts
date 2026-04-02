/**
 * Browser Cache API wrapper for demo audio files.
 * Caches MP3s so repeat visits / segment replays don't re-download.
 * Falls back to normal fetch if Cache API is unavailable.
 */

const CACHE_NAME = "narratu-audio-v1";

let cachePromise: Promise<Cache> | null = null;

function getCache(): Promise<Cache> | null {
  if (!("caches" in globalThis)) return null;
  if (!cachePromise) cachePromise = caches.open(CACHE_NAME);
  return cachePromise;
}

/**
 * Fetch a URL with Cache API caching.
 * Returns cached response on hit, fetches and caches on miss.
 */
export async function cachedFetch(url: string): Promise<Response> {
  // Cache API only supports http/https — skip blob: and data: URLs
  const cache = url.startsWith("http") ? getCache() : null;
  if (!cache) return fetch(url);

  const c = await cache;
  const cached = await c.match(url);
  if (cached) return cached;

  const res = await fetch(url);
  if (res.ok) {
    // Clone before caching — response body can only be consumed once
    c.put(url, res.clone());
  }
  return res;
}
