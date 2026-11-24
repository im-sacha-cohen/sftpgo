// Streaming service worker for the SFTPGo Console.
//
// <audio> and <video> cannot send an Authorization header, so a file had to be
// downloaded entirely before it could play. This worker lets them stream from
// the REST API instead: a media URL carrying the `__stream` marker is fetched
// again here with the Bearer token of the page that asked for it, keeping the
// Range header so seeking works on large files. The token never leaves memory:
// the worker asks the requesting page for it each time (see src/lib/stream.ts).

const MARK = '__stream';
// Set when an administrator acts as a user: the page answers with that user's token.
const AS = '__as';
const API_BASE = new URL(self.location.href).searchParams.get('api') || '/api/v2';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

function askToken(client, url) {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(null), 3000);
    channel.port1.onmessage = (e) => {
      clearTimeout(timer);
      resolve((e.data && e.data.token) || null);
    };
    client.postMessage({ type: 'sftpgo-stream-token', url }, [channel.port2]);
  });
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' && request.method !== 'HEAD') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.searchParams.has(MARK)) return;
  if (!url.pathname.startsWith(API_BASE + '/')) return;

  event.respondWith(
    (async () => {
      // Navigations have no clientId: a marked URL opened directly gets no token.
      const client = event.clientId ? await self.clients.get(event.clientId) : null;
      const token = client ? await askToken(client, url.toString()) : null;
      if (!token) return new Response('Not authenticated', { status: 401 });
      url.searchParams.delete(MARK);
      url.searchParams.delete(AS);
      const headers = new Headers({ Authorization: `Bearer ${token}` });
      for (const name of ['Range', 'If-Range']) {
        const value = request.headers.get(name);
        if (value) headers.set(name, value);
      }
      return fetch(url.toString(), { method: request.method, headers, credentials: 'omit', cache: 'no-store' });
    })(),
  );
});
