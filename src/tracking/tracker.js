// Shared camera + MediaPipe face/hand tracking. Everything runs on-device.
import { FilesetResolver, FaceLandmarker, HandLandmarker } from '@mediapipe/tasks-vision';
import { Filter2D } from './filters.js';

const WASM = '/mediapipe/wasm';
const FACE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const HAND_MODEL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

export const isCoarse = () =>
  typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Gesture from the hand's 3D skeleton. Each finger gets a "straightness" score from its
// joint angles (≈360° straight, ≈200° fully curled), which doesn't change with camera angle
// the way 2D distances do — so a fist never reads as an open palm.
//   point  = index straight, other fingers bent          → pen down (write)
//   hover  = index + middle straight, ring + pinky bent  → pen up (move without writing)
//   palm   = all four straight                           → wipe
//   fist   = all four folded tight                       → pen up / release
//   none   = anything else (relaxed hand)                → pen up
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: (a.z || 0) - (b.z || 0) });
function angle(a, b, c) {
  const u = sub(a, b), v = sub(c, b);
  const d = u.x * v.x + u.y * v.y + u.z * v.z;
  const l = Math.hypot(u.x, u.y, u.z) * Math.hypot(v.x, v.y, v.z) || 1;
  return (Math.acos(Math.max(-1, Math.min(1, d / l))) * 180) / Math.PI;
}
const FINGERS = { index: [5, 6, 7, 8], middle: [9, 10, 11, 12], ring: [13, 14, 15, 16], pinky: [17, 18, 19, 20] };
function straightness(lm, [m, p, d, t]) {
  // also require the tip to be farther from the wrist than the knuckle (finger not folded back)
  const out = Math.hypot(...Object.values(sub(lm[t], lm[0]))) > Math.hypot(...Object.values(sub(lm[m], lm[0]))) * 1.1;
  return out ? angle(lm[m], lm[p], lm[d]) + angle(lm[p], lm[d], lm[t]) : 180;
}

function classify(lm, current) {
  const s = {};
  for (const k in FINGERS) s[k] = straightness(lm, FINGERS[k]);
  // hysteresis: fingers that define the current gesture get a looser threshold
  const ext = (k, keep) => s[k] > (keep ? 300 : 322);
  const bent = (k) => s[k] < 300;
  const isPoint = current === 'point', isHover = current === 'hover', isPalm = current === 'palm';
  // a real fist: every finger folded tight (a relaxed hand is ~260 and stays 'none')
  const fistBar = current === 'fist' ? 250 : 232;
  if (s.index < fistBar && s.middle < fistBar && s.ring < fistBar && s.pinky < fistBar) return 'fist';
  // open palm: real open hands are rarely ruler-straight (the pinky especially), so use a
  // gentler bar than for pointing — a fist (~180) or a relaxed hand (~260) still won't pass
  const pk = isPalm ? 262 : 0;
  if (s.index > (pk || 290) && s.middle > (pk || 290) && s.ring > (pk || 285) && s.pinky > (pk || 272)) return 'palm';
  // two fingers (pen up). While writing, the middle finger must be clearly out to lift the pen,
  // so a relaxed middle finger doesn't interrupt a stroke.
  const midOut = s.middle > (isPoint ? 332 : isHover ? 300 : 320);
  if (s.index > 290 && midOut && s.ring < (isHover ? 315 : 300) && s.pinky < (isHover ? 315 : 300)) return 'hover';
  // one finger (pen down). Easy to start, and very forgiving once you're writing:
  // the index may curl quite a bit and the other fingers may relax.
  if (isPoint ? s.index > 262 && s.ring < 322 && s.pinky < 322 : s.index > 305 && s.ring < 300 && s.pinky < 300) return 'point';
  return 'none';
}

class Tracker {
  constructor() {
    this.status = 'idle';
    this.error = null;
    this.video = null;
    this.stream = null;
    this.face = null;
    this.hand = null;
    this.needs = { face: false, hands: false };
    this.listeners = new Set();
    this.raf = 0;
    this.lastVideoTime = -1;
    this.frame = 0;
    this.handMemory = new Map(); // label -> {filter, palmFilter, gesture, cand, count, seen}
    this.state = {
      face: { visible: false, x: 0.5, y: 0.6, open: 0, breath: 0 },
      hands: [],
    };
    this.mouthFilter = new Filter2D(1.0, 2);
  }

  subscribe = (fn) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getStatus = () => this.status;
  setStatus(s, err = null) {
    this.status = s;
    this.error = err;
    this.listeners.forEach((fn) => fn());
  }

  get videoSize() {
    const v = this.video;
    return v && v.videoWidth ? { w: v.videoWidth, h: v.videoHeight } : { w: 1280, h: 720 };
  }

  /** Map mirrored video-normalized coords to a W×H screen using object-fit: cover. */
  toScreen(nx, ny, W, H) {
    const { w, h } = this.videoSize;
    const s = Math.max(W / w, H / h);
    const dw = w * s;
    const dh = h * s;
    return { x: nx * dw + (W - dw) / 2, y: ny * dh + (H - dh) / 2, scale: s };
  }

  async start() {
    if (this.status === 'ready' || this.status === 'loading' || this.status === 'requesting') return;
    try {
      this.setStatus('requesting');
      const coarse = isCoarse();
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: 'user',
          width: { ideal: coarse ? 640 : 1280 },
          height: { ideal: coarse ? 480 : 720 },
        },
      });
      const v = document.createElement('video');
      v.playsInline = true;
      v.muted = true;
      v.autoplay = true;
      v.setAttribute('playsinline', '');
      v.srcObject = this.stream;
      await v.play();
      this.video = v;
      this.setStatus('loading');
      await this.loadModels();
      this.setStatus('ready');
      this.loop();
    } catch (e) {
      console.error(e);
      const denied = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
      this.setStatus(denied ? 'denied' : 'error', e?.message || String(e));
    }
  }

  async loadModels() {
    const fileset = await FilesetResolver.forVisionTasks(WASM);
    const make = async (Cls, opts, delegate) =>
      Cls.createFromOptions(fileset, { ...opts, baseOptions: { ...opts.baseOptions, delegate } });
    const tryBoth = async (Cls, opts) => {
      try {
        return await make(Cls, opts, 'GPU');
      } catch {
        return await make(Cls, opts, 'CPU');
      }
    };
    [this.face, this.hand] = await Promise.all([
      tryBoth(FaceLandmarker, {
        baseOptions: { modelAssetPath: FACE_MODEL },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true,
      }),
      tryBoth(HandLandmarker, {
        baseOptions: { modelAssetPath: HAND_MODEL },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.6,
        minTrackingConfidence: 0.5,
      }),
    ]);
  }

  setNeeds(needs) {
    this.needs = { face: !!needs.face, hands: !!needs.hands };
  }

  loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const v = this.video;
    if (!v || v.readyState < 2 || v.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = v.currentTime;
    const now = performance.now();
    this.frame++;
    const both = this.needs.face && this.needs.hands;
    // On phones, alternate the two models each frame to keep things smooth.
    const alternate = both && isCoarse();
    const doFace = this.needs.face && (!alternate || this.frame % 2 === 0);
    const doHands = this.needs.hands && (!alternate || this.frame % 2 === 1);
    try {
      if (doFace) this.updateFace(this.face.detectForVideo(v, now), now);
      if (doHands) this.updateHands(this.hand.detectForVideo(v, now), now);
    } catch (e) {
      // A dropped frame is fine.
    }
    if (!this.needs.face) this.state.face.visible = false;
    if (!this.needs.hands) this.state.hands = [];
  };

  updateFace(res, now) {
    const f = this.state.face;
    const lm = res.faceLandmarks?.[0];
    if (!lm) {
      f.visible = false;
      f.open = 0;
      f.breath *= 0.85;
      return;
    }
    const bs = res.faceBlendshapes?.[0]?.categories || [];
    const jaw = bs.find((c) => c.categoryName === 'jawOpen')?.score ?? 0;
    const funnel = bs.find((c) => c.categoryName === 'mouthFunnel')?.score ?? 0;
    const pucker = bs.find((c) => c.categoryName === 'mouthPucker')?.score ?? 0;
    // "Haaa" (open jaw) or a blow (round lips) both count as breath.
    const open = Math.max(jaw, funnel * 0.9 + pucker * 0.3);
    const mx = 1 - (lm[13].x + lm[14].x) / 2;
    const my = (lm[13].y + lm[14].y) / 2;
    const p = this.mouthFilter.filter(mx, my, now);
    f.visible = true;
    f.x = p.x;
    f.y = p.y;
    f.open = open;
    f.faceWidth = Math.abs(lm[234].x - lm[454].x);
    const target = Math.min(1, Math.max(0, (open - 0.22) / 0.35));
    f.breath += (target - f.breath) * (target > f.breath ? 0.35 : 0.2);
  }

  updateHands(res, now) {
    const out = [];
    const seen = new Set();
    (res.landmarks || []).forEach((lm, i) => {
      // with one hand in view, don't trust left/right labels (they can flip and would break the stroke)
      const label = res.landmarks.length === 1 ? 'one' : res.handedness?.[i]?.[0]?.categoryName || `h${i}`;
      seen.add(label);
      let m = this.handMemory.get(label);
      if (!m) {
        m = { tip: new Filter2D(1.1, 3.5), palm: new Filter2D(0.9, 2), gesture: 'none', cand: 'none', count: 0, seq: 0 };
        this.handMemory.set(label, m);
      }
      const raw = classify(res.worldLandmarks?.[i] || lm, m.gesture);
      if (raw === m.cand) m.count++;
      else {
        m.cand = raw;
        m.count = 1;
      }
      // a wipe must be deliberate; lifting the pen with two fingers is quick;
      // losing the point to an unclear shape needs a few frames of agreement
      const need = raw === 'palm' || raw === 'fist' ? 3 : raw === 'none' && m.gesture === 'point' ? 5 : 2;
      m.lastSeen = now;
      if (m.count >= need) m.gesture = raw;
      m.seq = (m.seq || 0) + 1;

      const tip = m.tip.filter(1 - lm[8].x, lm[8].y, now);
      const pc = [0, 5, 9, 13, 17].reduce((a, k) => ({ x: a.x + lm[k].x / 5, y: a.y + lm[k].y / 5 }), { x: 0, y: 0 });
      const palm = m.palm.filter(1 - pc.x, pc.y, now);
      out.push({ id: label, gesture: m.gesture, tip, palm, size: dist(lm[0], lm[9]), seq: m.seq });
    });
    for (const [label, m] of this.handMemory) {
      // a hand missing for a frame or two keeps its gesture, so the stroke resumes seamlessly
      if (!seen.has(label) && now - (m.lastSeen || 0) > 220) {
        m.tip.reset();
        m.palm.reset();
        m.gesture = 'none';
        m.count = 0;
      }
    }
    this.state.hands = out;
  }
}

export const tracker = new Tracker();
