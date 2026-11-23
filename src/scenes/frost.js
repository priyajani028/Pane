// FROST — a frozen window over your reflection. Breath melts a clear patch,
// a fingertip scratches lines in the ice, a palm rubs it away. The frost grows back from the edges.
import { glScene, maskCanvas, rand } from './base.js';
import { tracePath } from '../tracking/input.js';

const FS = `
uniform sampler2D uMask; uniform sampler2D uCrystal;
uniform vec2 uRes; uniform vec2 uMaskRes; uniform float uTime;
float M(vec2 uv){ return texture2D(uMask, uv).a; }
void main(){
  vec2 uv = vUv; float aspect = uRes.x/uRes.y;
  vec2 e = 1.3/uMaskRes;
  float m = M(uv)*.5 + (M(uv+vec2(e.x,e.y)) + M(uv-vec2(e.x,e.y)) + M(uv+vec2(-e.x,e.y)) + M(uv+vec2(e.x,-e.y)))*.125;
  vec2 g = vec2(M(uv+vec2(e.x,0.)) - M(uv-vec2(e.x,0.)), M(uv+vec2(0.,e.y)) - M(uv-vec2(0.,e.y)));
  float cr = texture2D(uCrystal, uv).r;
  float ed = min(min(uv.x, 1.-uv.x)*aspect, min(uv.y, 1.-uv.y));
  float t = .8 - cr*.75 + .25*smoothstep(0., .45, ed);
  float f = smoothstep(t-.05, t+.05, m*1.1);

  // melted glass stays wet: a faint wobble in the clear patch
  vec2 wob = (vec2(fbm(uv*vec2(aspect,1.)*18.), fbm(uv*vec2(aspect,1.)*18.+9.)) - .5) * .006;
  vec3 clear = cam(uv + wob + g*.03);

  vec3 soft = camSoft(uv);
  float lum = dot(soft, vec3(.299,.587,.114));
  vec3 icy = soft*.42 + vec3(.80,.86,.93)*(.38 + .25*lum + .55*cr);
  icy += pow(cr, 3.)*.22;
  vec3 col = mix(clear, icy, clamp(f*(.8 + .25*cr), 0., .97));

  col += clamp(length(g)*2., 0., 1.)*.07;            // meltwater rim
  vec2 cell = uv*uRes/2.5;
  col += f * step(.997, hash(floor(cell))) * (.5+.5*sin(uTime*3. + hash(floor(cell)+2.)*40.)) * .4;
  col *= vec3(.965, .99, 1.03);
  col *= mix(.8, 1., smoothstep(1.35, .35, length((uv-.5)*vec2(aspect,1.))));
  gl_FragColor = vec4(col, 1.);
}`;

function paintCrystals(cv) {
  const c = cv.getContext('2d');
  const w = cv.width, h = cv.height, u = Math.min(w, h);
  c.fillStyle = '#000';
  c.fillRect(0, 0, w, h);
  c.globalCompositeOperation = 'lighter';
  c.lineCap = 'round';
  const fern = (x, y, ang, len, depth, alpha) => {
    const steps = 6;
    const st = len / steps;
    let px = x, py = y, a = ang;
    for (let i = 0; i < steps; i++) {
      a += (Math.random() - 0.5) * 0.12;
      const nx = px + Math.cos(a) * st, ny = py + Math.sin(a) * st;
      c.strokeStyle = `rgba(255,255,255,${alpha})`;
      c.lineWidth = Math.max(0.5, depth * 0.45);
      c.beginPath(); c.moveTo(px, py); c.lineTo(nx, ny); c.stroke();
      if (depth > 0 && i > 0) {
        const side = len * (0.42 - i * 0.03) * (0.7 + Math.random() * 0.4);
        fern(nx, ny, a + 1.05, side, depth - 1, alpha * 0.85);
        fern(nx, ny, a - 1.05, side, depth - 1, alpha * 0.85);
      }
      px = nx; py = ny;
    }
  };
  const n = Math.round((w * h) / (u * u) * 75);
  for (let i = 0; i < n; i++) {
    // seeds hug the window edges, a few float inside
    let x, y, ang;
    const r = Math.random();
    if (r < 0.75) {
      const side = Math.floor(Math.random() * 4);
      const t = Math.random();
      x = side === 0 ? 0 : side === 1 ? w : t * w;
      y = side === 2 ? 0 : side === 3 ? h : t * h;
      ang = Math.atan2(h / 2 - y, w / 2 - x) + (Math.random() - 0.5) * 1.6;
    } else {
      x = Math.random() * w; y = Math.random() * h; ang = Math.random() * Math.PI * 2;
    }
    fern(x, y, ang, u * (0.05 + Math.random() * 0.13), 2, 0.12 + Math.random() * 0.16);
  }
  for (let i = 0; i < n * 3; i++) {
    const x = Math.random() * w, y = Math.random() * h;
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI + Math.random() * 0.2, l = u * (0.004 + Math.random() * 0.01);
      c.strokeStyle = 'rgba(255,255,255,0.25)';
      c.lineWidth = 0.6;
      c.beginPath(); c.moveTo(x - Math.cos(a) * l, y - Math.sin(a) * l); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke();
    }
  }
}

export function createFrost({ root }) {
  const S = glScene(root, FS);
  const maskTex = S.R.texture();
  const crystalTex = S.R.texture();
  const SCALE = 0.5;
  const mask = maskCanvas(SCALE);
  const crystal = document.createElement('canvas');
  let W = 0, H = 0, t = 0, breathAge = 0;
  const full = (x, w, h) => { x.globalCompositeOperation = 'source-over'; x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); };

  function resize(w, h, dpr) {
    W = w; H = h;
    S.resize(w, h, dpr);
    mask.resize(w, h, full);
    crystal.width = Math.round(w * 0.75);
    crystal.height = Math.round(h * 0.75);
    paintCrystals(crystal);
    crystalTex.upload(crystal);
  }

  function clear(x, cx, cy, rad, a) {
    x.globalCompositeOperation = 'destination-out';
    const g = x.createRadialGradient(cx, cy, rad * 0.2, cx, cy, rad);
    g.addColorStop(0, `rgba(0,0,0,${a})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.beginPath(); x.arc(cx, cy, rad, 0, Math.PI * 2); x.fill();
  }

  function frame(input, dt) {
    t += dt;
    const k = dt * 60;
    const x = mask.x;
    const unit = Math.min(W, H) * SCALE;
    x.globalCompositeOperation = 'source-over';
    x.fillStyle = `rgba(255,255,255,${0.0022 * k})`;
    x.fillRect(0, 0, mask.c.width, mask.c.height);

    const b = input.breath;
    if (b.active) {
      breathAge += dt;
      const rad = unit * (0.08 + 0.2 * Math.min(1, breathAge / 3));
      const bx = b.x * SCALE, by = b.y * SCALE;
      clear(x, bx, by, rad, 0.05 * b.strength * k);
      for (let i = 0; i < 2; i++) clear(x, bx + rand(-1, 1) * rad * 0.6, by + rand(-1, 1) * rad * 0.5, rad * 0.5, 0.03 * b.strength * k);
    } else breathAge = 0;

    for (const a of input.agents) {
      const p = { x: a.x * SCALE, y: a.y * SCALE };
      const q = a.prev ? { x: a.prev.x * SCALE, y: a.prev.y * SCALE } : p;
      x.globalCompositeOperation = 'destination-out';
      x.lineCap = 'round';
      if (a.kind === 'point' || a.kind === 'pinch') {
        const w = Math.max(1.5, a.r * 2 * SCALE);
        x.lineJoin = 'round';
        x.strokeStyle = 'rgba(0,0,0,0.4)'; x.lineWidth = w * 1.6;
        tracePath(x, a.path, SCALE); x.stroke();
        x.strokeStyle = '#000'; x.lineWidth = w;
        tracePath(x, a.path, SCALE); x.stroke();
      } else if (a.kind === 'palm') {
        const r = Math.max(14, a.r * SCALE);
        x.lineJoin = 'round';
        x.strokeStyle = 'rgba(0,0,0,0.45)'; x.lineWidth = r * 1.8;
        tracePath(x, a.path, SCALE); x.stroke();
        clear(x, p.x, p.y, r * 1.1, 0.25);
      }
    }

    maskTex.upload(mask.c);
    S.begin().tex('uMask', maskTex).tex('uCrystal', crystalTex).set('uMaskRes', mask.c.width, mask.c.height).set('uTime', t).draw();
  }

  return {
    resize,
    frame,
    reset() { full(mask.x, mask.c.width, mask.c.height); },
    destroy: S.destroy,
  };
}
