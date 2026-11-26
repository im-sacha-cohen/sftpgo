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

function timeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((resolve) => window.setTimeout(() => resolve(fallback), ms))]);
}

let listening = false;

/**
 * Registers the streaming worker; resolves true when media can stream. A
 * success is kept; a failure is retried on the next call (the worker may
 * still have been installing).
 */
export function streamingReady(): Promise<boolean> {
  if (ready) return ready;
  const attempt = (async () => {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return false;
    try {
      const base = config.consoleBase.replace(/\/$/, '');
      if (!listening) {
        answerTokenRequests();
        listening = true;
      }
      const reg = await navigator.serviceWorker.register(`${base}/stream-sw.js?api=${encodeURIComponent(config.apiBase)}`, {
        scope: `${base}/`,
      });
      // `ready` never settles if the worker fails to install: don't wait forever.
      const active = await timeout(navigator.serviceWorker.ready.then(() => true), 5000, false);
      if (!active) return false;
      if (!navigator.serviceWorker.controller) (reg.active ?? (await navigator.serviceWorker.ready).active)?.postMessage({ type: 'sftpgo-stream-claim' });
      return await waitForController(3000);
    } catch {
      return false;
    }
  })();
  ready = attempt;
  void attempt.then((ok) => {
    if (!ok && ready === attempt) ready = null;
  });
  return attempt;
}

/** URL of an API file download that the worker will authenticate (GET only). */
export function streamUrl(path: string, query?: Query, actingAs?: string) {
  const url = buildUrl(path, actingAs ? { ...query, [AS]: actingAs } : query);
  return `${url}${url.includes('?') ? '&' : '?'}${MARK}=1`;
}
