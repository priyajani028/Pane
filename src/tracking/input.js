// Unifies camera tracking + touch/mouse into one per-frame input snapshot.
//   agents: [{ id, kind: 'point'|'palm'|'hover', x, y, r, prev, path, vx, vy }]
//     hover = pen up (two fingers / fist): scenes ignore it, the UI shows a ring
//     path — smoothed points from the last drawn position to (x, y); draw strokes along it
//   breath: { active, strength, x, y }
// Fallbacks (no camera): drag = finger · two-finger drag / right-drag / shift-drag = palm
//                        hold the "breathe" button = breath.
import { tracker } from './tracker.js';
import { settings } from './settings.js';

const GRACE_MS = 260;     // keep a camera stroke alive through brief tracking dropouts
const RECONNECT_PX = 30;  // …but don't bridge real moves

/**
 * Turns irregular samples (≈30 Hz camera, or pointer moves) into a smooth curve:
 * quadratic Béziers through the midpoints of consecutive samples, subdivided every ~2px.
 */
class Stroke {
  constructor() { this.reset(); }
  reset() { this.raw = []; this.last = null; this.lastSeen = 0; this.seq = -1; }
  push(p) {
    const r = this.raw;
    if (r.length && Math.hypot(p.x - r[r.length - 1].x, p.y - r[r.length - 1].y) < 0.4) return [];
    r.push(p);
    if (r.length > 3) r.shift();
    const out = [];
    if (r.length === 1) { this.last = { ...p }; return [this.last]; }
    if (r.length === 2) {
      const m = { x: (r[0].x + r[1].x) / 2, y: (r[0].y + r[1].y) / 2 };
      return this.emitLine(m);
    }
    const [p0, p1, p2] = r;
    const a = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
    const b = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    const len = Math.hypot(p1.x - a.x, p1.y - a.y) + Math.hypot(b.x - p1.x, b.y - p1.y);
    const n = Math.max(1, Math.ceil(len / 2));
    out.push(this.last || a);
    for (let i = 1; i <= n; i++) {
      const t = i / n, u = 1 - t;
      out.push({ x: u * u * a.x + 2 * u * t * p1.x + t * t * b.x, y: u * u * a.y + 2 * u * t * p1.y + t * t * b.y });
    }
    this.last = out[out.length - 1];
    return out;
  }
  emitLine(to) {
    const from = this.last || to;
    const n = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 2));
    const out = [];
    for (let i = 0; i <= n; i++) out.push({ x: from.x + ((to.x - from.x) * i) / n, y: from.y + ((to.y - from.y) * i) / n });
    this.last = to;
    return out;
  }
}

export function createInput(el) {
  const pointers = new Map();
  const state = { breathHold: false, breathHoldT: 0 };
  const strokes = new Map(); // key -> Stroke
  let lastPos = new Map();
  let ptrSeq = 0;

  const rel = (e) => {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const down = (e) => {
    el.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, { ...rel(e), palm: e.button === 2 || e.shiftKey });
    strokes.delete('ptr-point');
    strokes.delete('ptr-palm');
    ptrSeq++;
  };
  const move = (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    Object.assign(p, rel(e));
    if (e.shiftKey) p.palm = true;
    ptrSeq++;
  };
  const up = (e) => pointers.delete(e.pointerId);
  const ctx = (e) => e.preventDefault();
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('contextmenu', ctx);

  function stroke(key) {
    let s = strokes.get(key);
    if (!s) { s = new Stroke(); strokes.set(key, s); }
    return s;
  }

  /** Feed a sample (only when it's new) and get the agent's smoothed path for this frame. */
  function follow(key, pos, seq, now) {
    const s = stroke(key);
    const gap = now - s.lastSeen;
    // pointers start a fresh stroke on pointerdown; camera strokes bridge short dropouts only
    if (key.startsWith('cam-') && s.last && (gap > GRACE_MS || (gap > 60 && Math.hypot(pos.x - s.last.x, pos.y - s.last.y) > RECONNECT_PX + gap * 0.5))) s.reset();
    s.lastSeen = now;
    let path;
    if (seq !== s.seq) { s.seq = seq; path = s.push({ x: pos.x, y: pos.y }); }
    else path = [];
    const at = s.last || pos;
    if (!path.length) path = [at];
    return { x: at.x, y: at.y, path, fresh: s.raw.length <= 1 };
  }

  function read(W, H) {
    const now = performance.now();
    const agents = [];
    const ts = tracker.state;

    if (tracker.status === 'ready') {
      const scale = tracker.toScreen(0, 0, W, H).scale;
      const { w } = tracker.videoSize;
      for (const h of ts.hands) {
        const handPx = h.size * w * scale;
        if (h.gesture === 'none' || h.gesture === 'hover' || h.gesture === 'fist') {
          // pen up: end the stroke now, show where the fingertip is
          strokes.delete('cam-' + h.id + '-draw');
          const p = tracker.toScreen(h.tip.x, h.tip.y, W, H);
          const pc = tracker.toScreen(h.palm.x, h.palm.y, W, H);
          agents.push({ id: 'cam-' + h.id + '-hover', hand: h.id, kind: 'hover', x: p.x, y: p.y, r: settings.radius(W, H), path: [p], fresh: true, pen: h.gesture, palm: { x: pc.x, y: pc.y }, size: handPx });
          continue;
        }
        if (h.gesture === 'palm') {
          const p = tracker.toScreen(h.palm.x, h.palm.y, W, H);
          const f = follow('cam-' + h.id + '-palm', p, h.seq, now);
          agents.push({ id: 'cam-' + h.id + '-palm', hand: h.id, kind: 'palm', r: handPx * 0.95, ...f });
        } else {
          const p = tracker.toScreen(h.tip.x, h.tip.y, W, H);
          const f = follow('cam-' + h.id + '-draw', p, h.seq, now);
          const pc = tracker.toScreen(h.palm.x, h.palm.y, W, H);
          agents.push({ id: 'cam-' + h.id + '-draw', hand: h.id, kind: h.gesture, r: settings.radius(W, H), palm: { x: pc.x, y: pc.y }, size: handPx, ...f });
        }
      }
    }

    const list = [...pointers.values()];
    const unit = Math.min(W, H);
    if (list.length >= 2) {
      const c = { x: list.reduce((a, p) => a + p.x, 0) / list.length, y: list.reduce((a, p) => a + p.y, 0) / list.length };
      agents.push({ id: 'ptr-palm', kind: 'palm', r: unit * 0.12, ...follow('ptr-palm', c, ptrSeq, now) });
    } else if (list.length === 1) {
      const p = list[0];
      if (p.palm) agents.push({ id: 'ptr-palm', kind: 'palm', r: unit * 0.12, ...follow('ptr-palm', p, ptrSeq, now) });
      else agents.push({ id: 'ptr-point', kind: 'point', r: settings.radius(W, H), ...follow('ptr-point', p, ptrSeq, now) });
    }

    // previous position + velocity per agent
    const next = new Map();
    for (const a of agents) {
      const l = lastPos.get(a.id);
      a.prev = a.fresh || !l ? null : a.path[0];
      a.vx = l ? a.x - l.x : 0;
      a.vy = l ? a.y - l.y : 0;
      next.set(a.id, { x: a.x, y: a.y });
    }
    lastPos = next;
    for (const [k, s] of strokes) if (now - s.lastSeen > 1000) strokes.delete(k);

    let breath = { active: false, strength: 0, x: W / 2, y: H * 0.6 };
    const f = ts.face;
    if (tracker.status === 'ready' && f.visible && f.breath > 0.02) {
      const p = tracker.toScreen(f.x, f.y, W, H);
      breath = { active: true, strength: f.breath, x: p.x, y: p.y };
    } else if (state.breathHold) {
      state.breathHoldT = Math.min(1, state.breathHoldT + 0.06);
      breath = { active: true, strength: state.breathHoldT, x: W / 2, y: H * 0.62 };
    }
    if (!state.breathHold) state.breathHoldT = 0;
    return { agents, breath };
  }

  function destroy() {
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
    el.removeEventListener('contextmenu', ctx);
  }

  return { read, destroy, setBreathHold: (v) => (state.breathHold = v) };
}

/** Draw a smoothed agent path into a 2D context (coordinates scaled by `s`). */
export function tracePath(x, path, s) {
  x.beginPath();
  x.moveTo(path[0].x * s, path[0].y * s);
  if (path.length === 1) x.lineTo(path[0].x * s + 0.01, path[0].y * s);
  for (let i = 1; i < path.length; i++) x.lineTo(path[i].x * s, path[i].y * s);
}
