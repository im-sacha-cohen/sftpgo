import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { Maximize, Minimize, Music, Pause, Play, RotateCcw, RotateCw, Volume1, Volume2, VolumeX } from 'lucide-react';
import { Menu, Spinner } from '@/components/ui';
import './MediaPlayer.css';

// Console-styled audio/video player: the media element has no native controls,
// everything is drawn with the design tokens. Keyboard (when the player has the
// focus): Space/K play-pause, ←/→ 5 s, J/L 10 s, ↑/↓ volume, M mute, F fullscreen.

/** Remount it (key={src}) for each new file: state starts from scratch. */
export interface MediaPlayerProps {
  kind: 'audio' | 'video';
  src: string;
  title: string;
  subtitle?: string;
  autoPlay?: boolean;
  onEnded?: () => void;
  onError?: () => void;
}

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];
const VOLUME_KEY = 'sftpgo-console-volume';

function clock(s: number) {
  if (!Number.isFinite(s) || s < 0) return '0:00';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

function readVolume() {
  try {
    const v = Number(localStorage.getItem(VOLUME_KEY));
    return Number.isFinite(v) && v > 0 && v <= 1 ? v : 1;
  } catch {
    return 1;
  }
}

interface SliderProps {
  label: string;
  value: number;
  max: number;
  /** Extra filled range drawn behind the value (buffered media). */
  buffered?: number;
  step: number;
  valueText: string;
  onChange: (v: number) => void;
  /** Called while dragging starts/ends (to pause UI updates). */
  onScrub?: (active: boolean) => void;
  className?: string;
}

/** Accessible horizontal slider (role=slider), pointer + keyboard. */
function Slider({ label, value, max, buffered, step, valueText, onChange, onScrub, className }: SliderProps) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const bufPct = max > 0 && buffered ? Math.min(100, (buffered / max) * 100) : 0;

  const fromPointer = (e: PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    onChange(ratio * max);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    let next: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = value + step;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = value - step;
    else if (e.key === 'PageUp') next = value + step * 10;
    else if (e.key === 'PageDown') next = value - step * 10;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = max;
    if (next === null) return;
    e.preventDefault();
    e.stopPropagation();
    onChange(Math.min(max, Math.max(0, next)));
  };

  return (
    <div
      ref={ref}
      className={`mp-slider ${className ?? ''}`}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(max * 100) / 100}
      aria-valuenow={Math.round(value * 100) / 100}
      aria-valuetext={valueText}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        dragging.current = true;
        ref.current?.setPointerCapture(e.pointerId);
        onScrub?.(true);
        fromPointer(e);
      }}
      onPointerMove={(e) => dragging.current && fromPointer(e)}
      onPointerUp={(e) => {
        if (!dragging.current) return;
        dragging.current = false;
        ref.current?.releasePointerCapture(e.pointerId);
        fromPointer(e);
        onScrub?.(false);
      }}
      onPointerCancel={() => {
        dragging.current = false;
        onScrub?.(false);
      }}
    >
      <span className="mp-slider__track">
        <span className="mp-slider__buffer" style={{ width: `${bufPct}%` }} />
        <span className="mp-slider__fill" style={{ width: `${pct}%` }} />
      </span>
      <span className="mp-slider__thumb" style={{ left: `${pct}%` }} />
    </div>
  );
}

export function MediaPlayer({ kind, src, title, subtitle, autoPlay = true, onEnded, onError }: MediaPlayerProps) {
  const media = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [waiting, setWaiting] = useState(true);
  const [volume, setVolume] = useState(readVolume);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [scrubbing, setScrubbing] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const m = media.current;
    if (!m) return;
    m.volume = volume;
    m.muted = muted;
    m.playbackRate = speed;
  }, [volume, muted, speed, src]);

  useEffect(() => {
    try {
      localStorage.setItem(VOLUME_KEY, String(volume));
    } catch {
      /* ignore */
    }
  }, [volume]);

  useEffect(() => {
    const onFs = () => setFullscreen(document.fullscreenElement === root.current);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const toggle = useCallback(() => {
    const m = media.current;
    if (!m) return;
    if (m.paused) void m.play().catch(() => {});
    else m.pause();
  }, []);
  const seekBy = (d: number) => {
    const m = media.current;
    if (m) m.currentTime = Math.min(m.duration || 0, Math.max(0, m.currentTime + d));
  };
  const seekTo = (t: number) => {
    const m = media.current;
    if (m) m.currentTime = t;
    setTime(t);
  };
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void root.current?.requestFullscreen?.();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[role="slider"], [role="menu"], button[aria-haspopup]')) {
      if (e.key !== ' ' && e.key.toLowerCase() !== 'k') return;
    }
    const k = e.key.toLowerCase();
    const handled = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    if (k === ' ' || k === 'k') {
      if ((e.target as HTMLElement).tagName === 'BUTTON' && k === ' ') return;
      handled();
      toggle();
    } else if (e.key === 'ArrowLeft') (handled(), seekBy(-5));
    else if (e.key === 'ArrowRight') (handled(), seekBy(5));
    else if (k === 'j') (handled(), seekBy(-10));
    else if (k === 'l') (handled(), seekBy(10));
    else if (e.key === 'ArrowUp') (handled(), setVolume((v) => Math.min(1, v + 0.1)), setMuted(false));
    else if (e.key === 'ArrowDown') (handled(), setVolume((v) => Math.max(0, v - 0.1)));
    else if (k === 'm') (handled(), setMuted((m) => !m));
    else if (k === 'f' && kind === 'video') (handled(), toggleFullscreen());
  };

  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  const PlayIcon = playing ? Pause : Play;

  // Media events don't bubble: they must sit on the <audio>/<video> element.
  const mediaEvents = {
    onPlay: () => setPlaying(true),
    onPause: () => setPlaying(false),
    onTimeUpdate: () => {
      const m = media.current;
      if (!m) return;
      if (!scrubbing) setTime(m.currentTime);
      // Some browsers skip 'canplay'/'playing' after a quick start: time moving means it plays.
      if (!m.paused && m.readyState >= 3) setWaiting(false);
    },
    onDurationChange: () => setDuration(media.current?.duration ?? 0),
    onLoadedMetadata: () => {
      setDuration(media.current?.duration ?? 0);
      setWaiting(false);
    },
    onProgress: () => {
      const m = media.current;
      if (m && m.buffered.length) setBuffered(m.buffered.end(m.buffered.length - 1));
    },
    onWaiting: () => setWaiting(true),
    onCanPlay: () => setWaiting(false),
    onPlaying: () => setWaiting(false),
    onEnded: () => {
      setPlaying(false);
      onEnded?.();
    },
    onError: () => onError?.(),
  };

  const element = kind === 'video' ? (
    <video
      ref={media}
      src={src}
      autoPlay={autoPlay}
      playsInline
      preload="metadata"
      className="mp__video"
      {...mediaEvents}
      onClick={toggle}
      onDoubleClick={toggleFullscreen}
    />
  ) : (
    <audio ref={media} src={src} autoPlay={autoPlay} preload="metadata" {...mediaEvents} />
  );

  return (
    <div
      ref={root}
      className={`mp mp--${kind}${fullscreen ? ' is-fullscreen' : ''}`}
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      {kind === 'video' ? (
        <div className="mp__screen">
          {element}
          {waiting && (
            <span className="mp__wait" aria-hidden="true">
              <Spinner />
            </span>
          )}
          {!playing && !waiting && (
            <button type="button" className="mp__big-play" onClick={toggle} aria-label="Play">
              <Play size={30} fill="currentColor" />
            </button>
          )}
        </div>
      ) : (
        <div className="mp__cover">
          {element}
          <span className={playing ? 'mp__art is-playing' : 'mp__art'} aria-hidden="true">
            <Music size={44} strokeWidth={1.5} />
            <span className="mp__bars">
              <i />
              <i />
              <i />
              <i />
            </span>
          </span>
          <span className="mp__title">{title}</span>
          {subtitle && <span className="mp__subtitle mono">{subtitle}</span>}
        </div>
      )}

      <div className="mp__controls">
        <div className="mp__seek">
          <span className="mp__time mono">{clock(time)}</span>
          <Slider
            label="Seek"
            className="mp-slider--seek"
            value={time}
            max={duration || 0}
            buffered={buffered}
            step={5}
            valueText={`${clock(time)} of ${clock(duration)}`}
            onChange={seekTo}
            onScrub={setScrubbing}
          />
          <span className="mp__time mono">{clock(duration)}</span>
        </div>
        <div className="mp__row">
          <div className="mp__side">
            <Menu
              trigger={
                <button type="button" className="mp__chip mono" aria-label={`Playback speed ${speed}×`}>
                  {speed}×
                </button>
              }
              items={SPEEDS.map((s) => ({ label: `${s}×`, onSelect: () => setSpeed(s) }))}
              minWidth={90}
            />
          </div>
          <div className="mp__main">
            <button type="button" className="mp__btn" onClick={() => seekBy(-10)} aria-label="Back 10 seconds">
              <RotateCcw size={18} />
              <span className="mp__btn-n">10</span>
            </button>
            <button type="button" className="mp__play" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
              {waiting && playing ? <Spinner /> : <PlayIcon size={22} fill="currentColor" />}
            </button>
            <button type="button" className="mp__btn" onClick={() => seekBy(10)} aria-label="Forward 10 seconds">
              <RotateCw size={18} />
              <span className="mp__btn-n">10</span>
            </button>
          </div>
          <div className="mp__side mp__side--end">
            <button type="button" className="mp__btn" onClick={() => setMuted((m) => !m)} aria-label={muted ? 'Unmute' : 'Mute'}>
              <VolumeIcon size={18} />
            </button>
            <Slider
              label="Volume"
              className="mp-slider--volume"
              value={muted ? 0 : volume}
              max={1}
              step={0.1}
              valueText={`${Math.round((muted ? 0 : volume) * 100)}%`}
              onChange={(v) => {
                setVolume(v);
                setMuted(v === 0);
              }}
            />
            {kind === 'video' && (
              <button type="button" className="mp__btn" onClick={toggleFullscreen} aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}>
                {fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
