import { useSyncExternalStore } from "react";

// Tiny external store that lets the dictation pill (and any other listener)
// subscribe to live mic levels via requestAnimationFrame without forcing the
// owning hook to re-render every frame. AudioManager calls
// setAudioLevelAnalyser(node) on recording start, and setAudioLevelAnalyser(null) on stop.

const listeners = new Set<() => void>();
let level = 0;
let rafId: number | null = null;
let analyser: AnalyserNode | null = null;
let buffer: Uint8Array | null = null;

const notify = () => {
  listeners.forEach((l) => l());
};

const tick = () => {
  if (!analyser || !buffer) {
    rafId = null;
    return;
  }
  analyser.getByteTimeDomainData(buffer);
  let peak = 0;
  for (let i = 0; i < buffer.length; i++) {
    const v = Math.abs((buffer[i] - 128) / 128);
    if (v > peak) peak = v;
  }
  // Smoothing: ease toward peak. Attack fast, release slow gives the bars
  // a punchy feel without flicker.
  const attack = 0.65;
  const release = 0.18;
  const k = peak > level ? attack : release;
  level = level + (peak - level) * k;
  notify();
  rafId = requestAnimationFrame(tick);
};

export function setAudioLevelAnalyser(node: AnalyserNode | null) {
  if (node) {
    analyser = node;
    buffer = new Uint8Array(node.fftSize);
    if (rafId == null) rafId = requestAnimationFrame(tick);
  } else {
    analyser = null;
    buffer = null;
    if (rafId != null) cancelAnimationFrame(rafId);
    rafId = null;
    level = 0;
    notify();
  }
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const getSnapshot = () => level;

export function useAudioLevel(): number {
  return useSyncExternalStore(subscribe, getSnapshot, () => 0);
}
