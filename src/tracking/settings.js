// Tiny persisted settings store (line width for finger strokes).
const KEY = 'pane-line';
const read = () => {
  try { const v = parseFloat(localStorage.getItem(KEY)); return Number.isFinite(v) ? v : 0.3; } catch { return 0.3; }
};

const listeners = new Set();
export const settings = {
  line: read(), // 0 (hairline) … 1 (broad)
  setLine(v) {
    settings.line = Math.min(1, Math.max(0, v));
    try { localStorage.setItem(KEY, String(settings.line)); } catch { /* ignore */ }
    listeners.forEach((fn) => fn());
  },
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  get: () => settings.line,
  /** Fingertip radius in CSS px for a given screen. */
  radius(W, H) {
    const unit = Math.min(W, H);
    return unit * (0.0035 + settings.line * 0.03); // ≈3px … 27px on a laptop
  },
};

// Plasma colour (hex), persisted.
const CKEY = 'pane-plasma-color';
export const PLASMA_COLORS = [
  { name: 'Violet', hex: '#8c4dff' },
  { name: 'Ice', hex: '#8cc8ff' },
  { name: 'Gold', hex: '#ffb43c' },
  { name: 'Crimson', hex: '#ff3a46' },
  { name: 'Emerald', hex: '#3cff8c' },
  { name: 'Rose', hex: '#ff66c4' },
];
const cl = new Set();
export const plasmaColor = {
  value: (() => { try { return localStorage.getItem(CKEY) || PLASMA_COLORS[0].hex; } catch { return PLASMA_COLORS[0].hex; } })(),
  get: () => plasmaColor.value,
  set(hex) {
    plasmaColor.value = hex;
    try { localStorage.setItem(CKEY, hex); } catch { /* ignore */ }
    cl.forEach((fn) => fn());
  },
  subscribe(fn) { cl.add(fn); return () => cl.delete(fn); },
  rgb() {
    const h = plasmaColor.value.replace('#', '');
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  },
};
