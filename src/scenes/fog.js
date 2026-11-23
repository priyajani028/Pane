// FOG — a steamed-up mirror over your live reflection.
// Breath condenses, a fingertip writes, a palm wipes. Wiped glass leaves beads and drips,
// and the steam slowly creeps back.
import { glScene, maskCanvas, rand } from './base.js';
import { tracePath } from '../tracking/input.js';

const FS = `
uniform sampler2D uMask; uniform sampler2D uWater;
uniform vec2 uRes; uniform vec2 uMaskRes; uniform float uTime;
float M(vec2 uv){ return texture2D(uMask, uv).a; }
float Wt(vec2 uv){ return texture2D(uWater, uv).a; }
void main(){
  vec2 uv = vUv; float aspect = uRes.x/uRes.y;
  vec2 e = 1.3/uMaskRes;
  float mc = M(uv);
  float mx = M(uv+vec2(e.x,0.)) - M(uv-vec2(e.x,0.));
  float my = M(uv+vec2(0.,e.y)) - M(uv-vec2(0.,e.y));
  float m = mc*.5 + (M(uv+vec2(e.x,e.y)) + M(uv-vec2(e.x,e.y)) + M(uv+vec2(-e.x,e.y)) + M(uv+vec2(e.x,-e.y)))*.125;
  float n = fbm(uv*vec2(aspect,1.)*2.2 + vec2(0., uTime*.012));
  float d = clamp(m*(.8 + .38*n + .12*uv.y), 0., 1.);

  float w = Wt(uv);
  vec2 wg = vec2(Wt(uv+vec2(e.x,0.)) - Wt(uv-vec2(e.x,0.)), Wt(uv+vec2(0.,e.y)) - Wt(uv-vec2(0.,e.y)));

  vec3 sharp = cam(uv);
  vec3 mid = camMid(uv);
  vec3 soft = camSoft(uv);
  vec3 behind = mix(sharp, mid, smoothstep(.0, .3, d));
  behind = mix(behind, soft, smoothstep(.25, .75, d));

  // condensation scatters light: milky, brighter where the room is bright
  float lum = dot(soft, vec3(.299,.587,.114));
  vec3 milk = vec3(.885,.9,.915) * (.72 + .38*lum);
  vec3 col = mix(behind, milk, .58*smoothstep(.04, 1., d));
  col += soft*.12*d;

  // micro-droplets you only notice up close
  vec2 px = uv*uRes;
  col += (hash(floor(px/2.)) - .5) * .028 * d;
  col += step(.986, hash(floor(px/3.) + 7.)) * .045 * d;

  // water pushed to the edge of a wipe catches the light
  float edge = clamp(length(vec2(mx, my))*1.8, 0., 1.);
  col += edge*.045;

  // beads and drips: clear water that refracts and holds a highlight
  float wa = smoothstep(.12, .55, w);
  vec3 nrm = normalize(vec3(-wg*7., 1.));
  vec3 drop = mix(cam(uv - wg*.05), camMid(uv), .25);
  col = mix(col, drop, wa*.85);
  col *= 1. - clamp(length(wg)*2., 0., 1.)*wa*.12;
  float spec = pow(max(dot(nrm, normalize(vec3(-.45,-.65,.6))), 0.), 18.);
  col += spec*wa*.6;

  col *= mix(.84, 1., smoothstep(1.35, .35, length((uv-.5)*vec2(aspect,1.))));
  gl_FragColor = vec4(col, 1.);
}`;

export function createFog({ root }) {
  const S = glScene(root, FS);
  const maskTex = S.R.texture();
  const waterTex = S.R.texture();
  const SCALE = 0.5;
  const fog = maskCanvas(SCALE);
  const trails = maskCanvas(SCALE);
  const water = maskCanvas(SCALE);
  let W = 0, H = 0, t = 0;
  let breathAge = 0, breathIdle = 0;
  let drips = [];

  const fullFog = (x, w, h) => { x.globalCompositeOperation = 'source-over'; x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); };

  function resize(w, h, dpr) {
    W = w; H = h;
    S.resize(w, h, dpr);
    fog.resize(w, h, fullFog);
    trails.resize(w, h);
    water.resize(w, h);
  }

  function puff(x, cx, cy, rad, a) {
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(0.4, `rgba(255,255,255,${a * 0.65})`);
    g.addColorStop(0.75, `rgba(255,255,255,${a * 0.18})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.beginPath(); x.arc(cx, cy, rad, 0, Math.PI * 2); x.fill();
  }

  function line(x, a, b, width, style, op = 'source-over') {
    x.globalCompositeOperation = op;
    x.strokeStyle = style;
    x.lineWidth = width;
    x.lineCap = 'round';
    x.lineJoin = 'round';
    x.beginPath(); x.moveTo(a.x, a.y); x.lineTo(b.x + 0.01, b.y); x.stroke();
  }

  function pathLine(x, path, width, style, op) {
    x.globalCompositeOperation = op;
    x.strokeStyle = style;
    x.lineWidth = width;
    x.lineCap = 'round';
    x.lineJoin = 'round';
    tracePath(x, path, SCALE);
    x.stroke();
  }

  function bead(x, cx, cy, r) {
    x.globalCompositeOperation = 'source-over';
    x.fillStyle = '#fff';
    x.beginPath(); x.ellipse(cx, cy, r, r * 1.08, 0, 0, Math.PI * 2); x.fill();
  }

  function frame(input, dt) {
    t += dt;
    const k = dt * 60;
    const fx = fog.x, tx = trails.x;
    const unit = Math.min(W, H) * SCALE;

    // steam creeps back; old water slowly dries
    fx.globalCompositeOperation = 'source-over';
    fx.fillStyle = `rgba(255,255,255,${0.0011 * k})`;
    fx.fillRect(0, 0, fog.c.width, fog.c.height);
    tx.globalCompositeOperation = 'destination-out';
    tx.fillStyle = `rgba(0,0,0,${0.0012 * k})`;
    tx.fillRect(0, 0, trails.c.width, trails.c.height);

    const b = input.breath;
    if (b.active) {
      breathAge += dt; breathIdle = 0;
      const grow = Math.min(1, breathAge / 2);
      const rad = unit * (0.16 + 0.38 * grow) * rand(0.94, 1.06);
      const bx = b.x * SCALE, by = b.y * SCALE + unit * 0.03;
      fx.globalCompositeOperation = 'source-over';
      puff(fx, bx, by, rad, 0.06 * b.strength * k);
      for (let i = 0; i < 3; i++) {
        const a = rand(0, Math.PI * 2), d = rad * rand(0.2, 0.8);
        puff(fx, bx + Math.cos(a) * d, by + Math.sin(a) * d * 0.8, rad * rand(0.3, 0.55), 0.03 * b.strength * k);
      }
    } else if ((breathIdle += dt) > 0.5) breathAge = 0;

    for (const a of input.agents) {
      const p = { x: a.x * SCALE, y: a.y * SCALE };
      const q = a.prev ? { x: a.prev.x * SCALE, y: a.prev.y * SCALE } : p;
      const len = Math.hypot(p.x - q.x, p.y - q.y);
      if (a.kind === 'point' || a.kind === 'pinch') {
        const w = Math.max(1.5, a.r * 2 * SCALE);
        pathLine(fx, a.path, w * 1.7, 'rgba(0,0,0,0.35)', 'destination-out');
        pathLine(fx, a.path, w, 'rgba(0,0,0,1)', 'destination-out');
        // the finger pushes water to the sides of the stroke
        if (len > 0.5) {
          const nx = -(p.y - q.y) / len, ny = (p.x - q.x) / len;
          const n = Math.min(4, Math.ceil(len / 6));
          for (let i = 0; i < n; i++) {
            if (Math.random() > 0.45) continue;
            const s = Math.random() < 0.5 ? -1 : 1;
            const tt = Math.random();
            bead(tx, q.x + (p.x - q.x) * tt + nx * s * w * rand(0.45, 0.62), q.y + (p.y - q.y) * tt + ny * s * w * rand(0.45, 0.62), rand(0.5, 1.1));
          }
          if (Math.random() < 0.02 * Math.min(5, len)) {
            drips.push({ x: p.x + rand(-0.2, 0.2) * w, y: p.y + w * 0.4, r: rand(1.3, 2.4), v: 0, run: 0, len: unit * rand(0.05, 0.35), hold: 0 });
          }
        }
      } else if (a.kind === 'palm') {
        const r = Math.max(14, a.r * SCALE);
        pathLine(fx, a.path, r * 2.1, 'rgba(0,0,0,0.5)', 'destination-out');
        pathLine(fx, a.path, r * 1.5, 'rgba(0,0,0,0.9)', 'destination-out');
        if (len > 2 && Math.random() < 0.35) {
          drips.push({ x: p.x + rand(-r, r), y: p.y + r * 0.6, r: rand(1.5, 2.8), v: 0, run: 0, len: unit * rand(0.08, 0.4), hold: 0 });
        }
        if (len > 1) for (let i = 0; i < 3; i++) bead(tx, p.x + rand(-1, 1) * r * 1.05, p.y + rand(-1, 1) * r * 1.05, rand(0.5, 1.3));
      }
    }

    // drips: stick, slip, slide, stop
    const wx = water.x;
    wx.globalCompositeOperation = 'source-over';
    wx.clearRect(0, 0, water.c.width, water.c.height);
    wx.drawImage(trails.c, 0, 0);
    drips = drips.filter((d) => {
      if (d.hold > 0) d.hold -= dt;
      else {
        d.v = Math.min(1.4, d.v + 0.03 * k);
        if (Math.random() < 0.01 * k) { d.hold = rand(0.1, 0.6); d.v = 0; }
      }
      const step = d.hold > 0 ? 0 : d.v * k;
      const nx = d.x + rand(-0.15, 0.15), ny = d.y + step;
      line(fx, { x: d.x, y: d.y }, { x: nx, y: ny }, d.r * 1.9, 'rgba(0,0,0,1)', 'destination-out');
      line(tx, { x: d.x, y: d.y }, { x: nx, y: ny }, d.r * 0.7, 'rgba(255,255,255,0.32)');
      d.x = nx; d.y = ny; d.run += step;
      if (d.run >= d.len) { bead(tx, d.x, d.y, d.r); return false; }
      bead(wx, d.x, d.y + d.r * 0.2, d.r * 1.05);
      return true;
    });

    maskTex.upload(fog.c);
    waterTex.upload(water.c);
    S.begin()
      .tex('uMask', maskTex)
      .tex('uWater', waterTex)
      .set('uMaskRes', fog.c.width, fog.c.height)
      .set('uTime', t)
      .draw();
  }

  return {
    resize,
    frame,
    reset() {
      fullFog(fog.x, fog.c.width, fog.c.height);
      trails.x.clearRect(0, 0, trails.c.width, trails.c.height);
      drips = [];
    },
    destroy: S.destroy,
  };
}
