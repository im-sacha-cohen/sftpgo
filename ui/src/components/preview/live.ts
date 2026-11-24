// Plays an MP3 that is still being written (a recorder writing one file per
// hour…) and keeps following it as it grows.
//
// An <audio src> only plays the bytes that existed when it asked for the file.
// Here the bytes are fetched in chunks with Range requests and appended to a
// MediaSource, so playback can go past the old end, and the timeline grows as
// the file does. MP3 frames carry no timestamps: a byte offset is turned into a
// time with the stream's bit rate (read from the first frame header), which is
// exact for constant bit rate and close enough for variable bit rate. Seeking
// outside what is buffered restarts the download at the matching byte offset.
//
// Browsers keep little audio in a MediaSource (about 12 MB in Chrome), so only
// a window around the play position is kept: up to AHEAD seconds ahead, BEHIND
// seconds behind.

const MIME = 'audio/mpeg';
const CHUNK = 512 * 1024;
const AHEAD = 90;
const BEHIND = 120;
const POLL_MS = 2000;
/** With no new byte for this long, the file is considered finished. */
const IDLE_END_MS = 45_000;

export function liveSupported() {
  return typeof window !== 'undefined' && 'MediaSource' in window && MediaSource.isTypeSupported(MIME);
}

/** Whether a file can be followed live (MP3 only). */
export function canFollowLive(name: string) {
  return /\.mp3$/i.test(name) && liveSupported();
}

export interface LiveState {
  /** Seconds of audio in the file the last time it was checked. */
  edge: number;
  /** The file stopped growing: no more data will come. */
  finished: boolean;
  /** Last error, if fetching failed. */
  error: string | null;
}

export interface LiveSourceOptions {
  /** GET the file with this Range header ("bytes=a-b"). */
  fetchRange: (range: string, signal: AbortSignal) => Promise<Response>;
  onState: (s: LiveState) => void;
}

export interface LiveSource {
  /** Object URL to give to the <audio> element. */
  url: string;
  /** Hand over the element once mounted (seeking, buffer trimming). */
  attach(el: HTMLMediaElement | null): void;
  /** Jump close to the live edge. */
  goLive(): void;
  stop(): void;
}

const BITRATES_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const BITRATES_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];

/** Bytes per second of the first MP3 frame found in `buf` (skips an ID3v2 tag). */
export function mp3BytesPerSecond(buf: Uint8Array): number | null {
  let i = 0;
  if (buf.length > 10 && buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) {
    const size = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
    i = 10 + size;
  }
  for (; i + 4 <= buf.length; i++) {
    if (buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) continue;
    const version = (buf[i + 1] >> 3) & 3; // 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5
    const layer = (buf[i + 1] >> 1) & 3; // 1 = layer III
    const idx = (buf[i + 2] >> 4) & 15;
    if (layer !== 1 || version === 1 || idx === 0 || idx === 15) continue;
    const kbps = (version === 3 ? BITRATES_V1_L3 : BITRATES_V2_L3)[idx];
    return (kbps * 1000) / 8;
  }
  return null;
}

function totalFromContentRange(h: string | null) {
  const m = h ? /\/(\d+)\s*$/.exec(h) : null;
  return m ? Number(m[1]) : null;
}

export function createLiveSource({ fetchRange, onState }: LiveSourceOptions): LiveSource {
  const ms = new MediaSource();
  const url = URL.createObjectURL(ms);
  let el: HTMLMediaElement | null = null;
  let sb: SourceBuffer | null = null;
  let stopped = false;
  let bps: number | null = null;
  let size = 0;
  /** Next byte to fetch. */
  let next = 0;
  let lastGrowth = Date.now();
  let finished = false;
  let error: string | null = null;
  let ctrl: AbortController | null = null;
  /** Bumped on every seek: a running loop iteration from before it gives up. */
  let generation = 0;
  let wake: (() => void) | null = null;

  const edge = () => (bps ? size / bps : 0);
  const emit = () => onState({ edge: edge(), finished, error });
  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      const t = window.setTimeout(() => {
        wake = null;
        resolve();
      }, ms);
      wake = () => {
        window.clearTimeout(t);
        wake = null;
        resolve();
      };
    });

  const waitUpdate = () =>
    new Promise<void>((resolve) => {
      if (!sb || !sb.updating) return resolve();
      sb.addEventListener('updateend', () => resolve(), { once: true });
    });

  const append = async (data: Uint8Array) => {
    if (!sb) return;
    await waitUpdate();
    try {
      sb.appendBuffer(data);
    } catch (e) {
      if ((e as DOMException).name !== 'QuotaExceededError') throw e;
      await trim(true);
      await waitUpdate();
      sb.appendBuffer(data);
    }
    await waitUpdate();
  };

  /** Drops what is far behind the play position (or more of it when the buffer is full). */
  const trim = async (hard = false) => {
    if (!sb || !el || !sb.buffered.length) return;
    const keep = hard ? 10 : BEHIND;
    const start = sb.buffered.start(0);
    const cut = el.currentTime - keep;
    if (cut > start + 1) {
      await waitUpdate();
      sb.remove(start, cut);
      await waitUpdate();
    }
  };

  const bufferedAhead = () => {
    if (!sb || !el) return 0;
    const t = el.currentTime;
    for (let i = 0; i < sb.buffered.length; i++) {
      if (sb.buffered.start(i) <= t + 0.5 && sb.buffered.end(i) >= t) return sb.buffered.end(i) - t;
    }
    return 0;
  };

  const updateDuration = async () => {
    if (!bps || ms.readyState !== 'open') return;
    const d = edge();
    if (!Number.isFinite(d) || d <= 0) return;
    await waitUpdate();
    // Never below what is buffered (the browser refuses it).
    const end = sb && sb.buffered.length ? sb.buffered.end(sb.buffered.length - 1) : 0;
    try {
      if (ms.readyState === 'open' && Math.abs(ms.duration - d) > 0.5) ms.duration = Math.max(d, end);
    } catch {
      /* not allowed while updating: next round */
    }
  };

  const loop = async () => {
    while (!stopped) {
      const gen = generation;
      if (bufferedAhead() > AHEAD) {
        await trim();
        await sleep(1000);
        continue;
      }
      ctrl = new AbortController();
      let res: Response;
      try {
        res = await fetchRange(`bytes=${next}-${next + CHUNK - 1}`, ctrl.signal);
      } catch (e) {
        if (stopped || gen !== generation) continue;
        const status = (e as { status?: number }).status;
        if (status === 416) {
          // Nothing after `next` yet: we are at the live edge.
          if (Date.now() - lastGrowth > IDLE_END_MS && !finished) {
            finished = true;
            emit();
            await waitUpdate();
            if (ms.readyState === 'open') ms.endOfStream();
            return;
          }
          await sleep(POLL_MS);
          continue;
        }
        error = e instanceof Error ? e.message : String(e);
        emit();
        await sleep(POLL_MS * 2);
        continue;
      }
      const data = new Uint8Array(await res.arrayBuffer());
      if (stopped || gen !== generation) continue;
      const total = totalFromContentRange(res.headers.get('Content-Range')) ?? next + data.length;
      if (total > size) {
        size = total;
        lastGrowth = Date.now();
      }
      if (!bps) bps = mp3BytesPerSecond(data);
      if (error) error = null;
      next += data.length;
      await append(data);
      await updateDuration();
      emit();
      if (data.length < CHUNK) await sleep(POLL_MS);
    }
  };

  const restartAt = (time: number) => {
    if (!bps || !sb) return;
    generation++;
    ctrl?.abort();
    wake?.();
    const target = Math.max(0, Math.min(time, edge() - 1));
    void (async () => {
      await waitUpdate();
      if (ms.readyState !== 'open') return;
      sb.abort();
      if (sb.buffered.length) {
        sb.remove(0, Infinity);
        await waitUpdate();
      }
      sb.timestampOffset = target;
      next = Math.floor(target * bps);
    })();
  };

  const onSeeking = () => {
    if (!el || !sb) return;
    const t = el.currentTime;
    for (let i = 0; i < sb.buffered.length; i++) if (sb.buffered.start(i) <= t && t < sb.buffered.end(i)) return;
    restartAt(t);
  };

  ms.addEventListener('sourceopen', () => {
    if (sb || stopped) return;
    sb = ms.addSourceBuffer(MIME);
    // MP3 frames have no timestamps: chunks are laid end to end.
    sb.mode = 'sequence';
    void loop();
  });

  return {
    url,
    attach(next) {
      el?.removeEventListener('seeking', onSeeking);
      el = next;
      el?.addEventListener('seeking', onSeeking);
    },
    goLive() {
      if (!el || !bps) return;
      el.currentTime = Math.max(0, edge() - 3);
      void el.play().catch(() => {});
    },
    stop() {
      stopped = true;
      ctrl?.abort();
      wake?.();
      el?.removeEventListener('seeking', onSeeking);
      URL.revokeObjectURL(url);
    },
  };
}
