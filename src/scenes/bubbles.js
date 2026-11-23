// BUBBLES — soap bubbles over your reflection, rendered as real thin films:
// interference colours that swirl and drain, the room reflected in each sphere, window highlights.
import { glScene, rand } from './base.js';

const MAX = 20;

const FS = `
uniform vec4 uB[${MAX}]; uniform vec4 uBX[${MAX}]; uniform float uN;
uniform vec2 uRes; uniform float uTime;
void main(){
  vec2 uv = vUv; vec2 P = uv*uRes; float aspect = uRes.x/uRes.y;
  vec3 col = cam(uv);
  for (int i = 0; i < ${MAX}; i++) {
    if (float(i) >= uN) break;
    vec4 b = uB[i]; vec4 x = uBX[i];
    vec2 q = (P - b.xy)/b.z;
    float r2 = dot(q, q);
    if (r2 > 1.03) continue;
    float r = sqrt(r2);
    float z = sqrt(max(0., 1. - r2));
    vec3 n = vec3(q, z);
    float aa = smoothstep(1.03, .99, r2);
    vec3 behind = cam(uv + q*(b.z/uRes)*.05*(1.-z));
    // the room reflected in a convex mirror
    vec2 ruv = clamp(vec2(.5) - q*.42, 0., 1.);
    vec3 env = camMid(ruv);
    // thin film: swirling, draining (thicker at the bottom), thinner over time
    float sw = fbm(q*1.7 + vec2(x.y*.3, uTime*.12) + b.w);
    float th = .55 + .3*q.y + .5*sw - x.z*.35;
    float path = th*2.6/max(z, .22);
    vec3 film = .5 + .5*cos(6.2831*(path + vec3(0., .33, .67)));
    film = mix(vec3(dot(film, vec3(.33))), film, .85);
    float fres = .035 + .965*pow(1. - z, 3.2);
    vec3 c = behind*(1. - fres*.5) + env*film*(.07 + 1.2*fres) + film*.015;
    // window highlights
    vec2 hp = n.xy - vec2(-.42, -.47);
    hp = mat2(.8, .6, -.6, .8)*hp;
    float h1 = smoothstep(.16, .02, length(hp*vec2(1., 2.1)));
    float h2 = smoothstep(.09, .0, length((n.xy - vec2(.5, .55))*vec2(1., 1.8)))*.3;
    float h3 = smoothstep(.05, .0, length(n.xy - vec2(-.2, -.72)))*.6;
    c += h1*.9 + h2 + h3;
    c += smoothstep(.93, 1., r)*.06;
    col = mix(col, c, aa*x.x);
  }
  col *= mix(.84, 1., smoothstep(1.35, .35, length((uv-.5)*vec2(aspect,1.))));
  gl_FragColor = vec4(col, 1.);
}`;

export function createBubbles({ root }) {
  const S = glScene(root, FS);
  const spray = document.createElement('canvas');
  spray.className = 'layer';
  root.appendChild(spray);
  const sc = spray.getContext('2d');
  const B = new Float32Array(MAX * 4);
  const BX = new Float32Array(MAX * 4);
  let W = 0, H = 0, D = 1, t = 0, acc = 0;
  let bubbles = [], drops = [];

  function resize(w, h, dpr) {
    W = w; H = h; D = Math.min(dpr, 2);
    S.resize(w, h, dpr);
    spray.width = Math.round(w * D);
    spray.height = Math.round(h * D);
  }

  function spawn(x, y, strength, unit) {
    const a = -Math.PI / 2 + rand(-1.2, 1.2);
    const sp = unit * rand(0.0015, 0.005) * (0.6 + strength);
    const big = Math.random() < 0.12;
    bubbles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - unit * 0.001,
      r: 2, target: unit * rand(0.035, 0.085) * (big ? 1.7 : 1),
      phase: rand(0, 50), age: 0, life: rand(8, 18), alpha: 1, popping: 0,
    });
  }

  function pop(b) {
    if (b.popping) return;
    b.popping = 0.001;
    const n = 12 + Math.floor(b.r / 5);
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), sp = rand(0.05, 0.14) * b.r;
      drops.push({ x: b.x + Math.cos(a) * b.r, y: b.y + Math.sin(a) * b.r, vx: Math.cos(a) * sp * 0.2, vy: Math.sin(a) * sp * 0.2, life: rand(0.25, 0.55), s: rand(0.6, 1.6) });
    }
  }

  function frame(input, dt) {
    t += dt;
    const k = dt * 60;
    const unit = Math.min(W, H);
    const br = input.breath;
    if (br.active && br.strength > 0.15) {
      acc += dt * (1.5 + br.strength * 6);
      while (acc > 1 && bubbles.length < MAX) { acc -= 1; spawn(br.x + rand(-5, 5), br.y + rand(-3, 3), br.strength, unit); }
      if (acc > 1) acc = 0;
    } else acc = 0;

    for (const b of bubbles) {
      b.age += dt;
      if (b.popping) { b.popping += dt; b.alpha = Math.max(0, 1 - b.popping / 0.07); b.r *= 1.01; continue; }
      b.r += (b.target - b.r) * Math.min(1, 0.1 * k);
      b.vy += unit * 0.000005 * k;
      b.vx += Math.sin(t * 0.6 + b.phase) * unit * 0.000018 * k;
      b.vx *= Math.pow(0.986, k); b.vy *= Math.pow(0.986, k);
      b.x += b.vx * k; b.y += b.vy * k;
      if (b.age > b.life) pop(b);
      for (const a of input.agents) {
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if ((a.kind === 'point' || a.kind === 'pinch') && d < b.r + a.r * 0.4) pop(b);
        else if (a.kind === 'palm' && d < b.r + a.r * 1.15) {
          const nx = (b.x - a.x) / (d || 1), ny = (b.y - a.y) / (d || 1);
          b.vx += nx * 0.3 * k + a.vx * 0.025; b.vy += ny * 0.3 * k + a.vy * 0.025;
        }
      }
    }
    for (let i = 0; i < bubbles.length; i++) for (let j = i + 1; j < bubbles.length; j++) {
      const p = bubbles[i], q = bubbles[j];
      const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy), m = p.r + q.r;
      if (d > 0 && d < m) { const f = (m - d) * 0.015; p.vx -= dx / d * f; p.vy -= dy / d * f; q.vx += dx / d * f; q.vy += dy / d * f; }
    }
    bubbles = bubbles.filter((b) => b.alpha > 0 && b.x > -b.r * 3 && b.x < W + b.r * 3 && b.y > -b.r * 3 && b.y < H + b.r * 3);

    const s = S.canvas.width / W;
    const list = [...bubbles].sort((a, b) => a.r - b.r);
    list.forEach((b, i) => {
      B.set([b.x * s, b.y * s, b.r * s, b.phase], i * 4);
      BX.set([b.alpha, b.phase, Math.min(1, b.age / b.life), 0], i * 4);
    });
    S.begin().setv4('uB', B).setv4('uBX', BX).set('uN', list.length).set('uTime', t).draw();

    sc.setTransform(1, 0, 0, 1, 0, 0);
    sc.clearRect(0, 0, spray.width, spray.height);
    sc.setTransform(D, 0, 0, D, 0, 0);
    sc.fillStyle = 'rgba(240,246,255,0.85)';
    drops = drops.filter((d) => {
      d.life -= dt; d.x += d.vx * k; d.y += d.vy * k; d.vy += 0.12 * k;
      sc.globalAlpha = Math.max(0, Math.min(1, d.life * 2.5));
      sc.beginPath(); sc.arc(d.x, d.y, d.s, 0, Math.PI * 2); sc.fill();
      return d.life > 0;
    });
    sc.globalAlpha = 1;
  }

  return {
    resize,
    frame,
    reset() { bubbles.forEach(pop); },
    destroy() { S.destroy(); spray.remove(); },
  };
}
