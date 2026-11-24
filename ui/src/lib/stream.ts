// Streaming of audio/video from the REST API through public/stream-sw.js.
//
//   if (await streamingReady()) audio.src = streamUrl('/user/files', { path });
//
// The worker asks this page for the current token on every media request, so
// nothing is stored outside the existing session. When service workers are not
// available (plain http on a non-localhost origin, private modes…) callers fall
// back to downloading the file into a Blob.

import { buildUrl, getSession, type Query } from '@/api/client';
import { currentActAsToken } from '@/pages/client/fsclient';
import { config } from './config';

const MARK = '__stream';
const AS = '__as';
let ready: Promise<boolean> | null = null;

function answerTokenRequests() {
  navigator.serviceWorker.addEventListener('message', (e: MessageEvent) => {
    if (e.data?.type !== 'sftpgo-stream-token' || !e.ports[0]) return;
    const port = e.ports[0];
    const s = getSession();
    if (!s || s.expiresAt <= Date.now()) {
      port.postMessage({ token: null });
      return;
    }
    let as: string | null = null;
    try {
      as = new URL(String(e.data.url ?? ''), window.location.href).searchParams.get(AS);
    } catch {
      as = null;
    }
    // Only an administrator session can act as someone else.
    if (as && s.kind === 'admin') void currentActAsToken(as).then((token) => port.postMessage({ token }));
    else port.postMessage({ token: as ? null : s.token });
  });
}

function waitForController(ms: number): Promise<boolean> {
  if (navigator.serviceWorker.controller) return Promise.resolve(true);
  return new Promise((resolve) => {
    const done = (v: boolean) => {
      navigator.serviceWorker.removeEventListener('controllerchange', onChange);
      window.clearTimeout(timer);
      resolve(v);
    };
    const onChange = () => done(!!navigator.serviceWorker.controller);
    const timer = window.setTimeout(() => done(!!navigator.serviceWorker.controller), ms);
    navigator.serviceWorker.addEventListener('controllerchange', onChange);
  });
}

/** Registers the streaming worker once; resolves true when media can stream. */
export function streamingReady(): Promise<boolean> {
  if (ready) return ready;
  ready = (async () => {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return false;
    try {
      const base = config.consoleBase.replace(/\/$/, '');
      answerTokenRequests();
      await navigator.serviceWorker.register(`${base}/stream-sw.js?api=${encodeURIComponent(config.apiBase)}`, {
        scope: `${base}/`,
      });
      await navigator.serviceWorker.ready;
      return await waitForController(3000);
    } catch {
      return false;
    }
  })();
  return ready;
}

/** URL of an API file download that the worker will authenticate (GET only). */
export function streamUrl(path: string, query?: Query, actingAs?: string) {
  const url = buildUrl(path, actingAs ? { ...query, [AS]: actingAs } : query);
  return `${url}${url.includes('?') ? '&' : '?'}${MARK}=1`;
}
