// WATER — your reflection on still water. Touch the surface and it ripples;
// a palm makes a splash. A real wave simulation bends your real image.
import { glScene } from './base.js';

const FS = `
uniform sampler2D uH; uniform vec2 uGrid; uniform vec2 uRes; uniform float uTime;
float Hh(vec2 uv){ return texture2D(uH, uv).r - .5; }
void main(){
  vec2 uv = vUv; float aspect = uRes.x/uRes.y; float t = uTime;
  vec2 e = 1./uGrid;
  float hx = Hh(uv+vec2(e.x,0.)) - Hh(uv-vec2(e.x,0.));
  float hy = Hh(uv+vec2(0.,e.y)) - Hh(uv-vec2(0.,e.y));
  // a breath of wind on the surface
  vec2 p = uv*vec2(aspect,1.);
  vec2 wind = vec2(
    sin(p.x*13. + t*.9) + .6*sin((p.x+p.y)*8.7 - t*.7) + .3*sin(p.y*23. + t*1.3),
    cos(p.y*11. - t*.8) + .6*cos((p.x-p.y)*7.3 + t*.5) + .3*cos(p.x*19. - t*1.1)) * .0032;
  vec3 n = normalize(vec3(-hx*5. + wind.x*40., -hy*5. + wind.y*40., 1.));
  vec2 dis = n.xy*.055 + wind;
  vec3 refl = cam(uv + dis);
  vec3 deep = vec3(.02, .05, .055);
  float fres = .62 + (1. - n.z)*2.5;
  vec3 col = mix(deep, refl*vec3(.78, .88, .92), clamp(fres, 0., .9));
  // sky sheen sliding across the surface
  col += vec3(.55,.62,.66) * .07 * smoothstep(.2, 1., fbm(p*1.3 + n.xy*3. + vec2(t*.02, 0.)));
  float spec = pow(max(dot(n, normalize(vec3(-.35, -.55, .76))), 0.), 220.);
  col += vec3(1., .98, .94)*spec*.9;
  col += (n.x*.5 - n.y*.4)*.06;
  col *= mix(.6, 1., smoothstep(1.3, .3, length((uv-.5)*vec2(aspect,1.))));
  gl_FragColor = vec4(col, 1.);
}`;

export function createWater({ root }) {
  const S = glScene(root, FS);
  const hTex = S.R.texture();
  let W = 0, H = 0, gw = 0, gh = 0, A, B, bytes;
  let t = 0, acc = 0;

  function resize(w, h, dpr) {
    W = w; H = h;
    S.resize(w, h, dpr);
    gw = w < 700 ? 120 : 200;
    gh = Math.max(24, Math.round(gw * (h / w)));
    A = new Float32Array(gw * gh);
    B = new Float32Array(gw * gh);
    bytes = new Uint8Array(gw * gh);
  }

  function disturb(x, y, rad, amt) {
    const gx = (x / W) * gw, gy = (y / H) * gh;
    const r = Math.max(1.2, rad * (gw / W)), r2 = r * r;
    for (let j = Math.max(1, Math.floor(gy - r)); j < Math.min(gh - 1, Math.ceil(gy + r)); j++)
      for (let i = Math.max(1, Math.floor(gx - r)); i < Math.min(gw - 1, Math.ceil(gx + r)); i++) {
        const d2 = (i - gx) ** 2 + (j - gy) ** 2;
        if (d2 < r2) A[j * gw + i] += amt * (0.5 + 0.5 * Math.cos((Math.PI * Math.sqrt(d2)) / r));
      }
  }

  function step() {
    for (let j = 1; j < gh - 1; j++) {
      const row = j * gw;
      for (let i = 1; i < gw - 1; i++) {
        const k = row + i;
        B[k] = ((A[k - 1] + A[k + 1] + A[k - gw] + A[k + gw]) * 0.5 - B[k]) * 0.988;
      }
    }
    const tmp = A; A = B; B = tmp;
  }

  function frame(input, dt) {
    t += dt;
    const unit = Math.min(W, H);
    for (const a of input.agents) {
      const sp = Math.hypot(a.vx, a.vy);
      if (a.kind === 'point' || a.kind === 'pinch') {
        const r = unit * 0.011;
        if (!a.prev) disturb(a.x, a.y, r * 2, -5);
        else if (sp > 0.4) disturb(a.x, a.y, r, -Math.min(3.2, 0.5 + sp * 0.14));
      } else if (a.kind === 'palm') {
        const r = Math.max(unit * 0.05, a.r * 0.8);
        if (!a.prev) disturb(a.x, a.y, r, -10);
        else if (sp > 1) disturb(a.x, a.y, r * 0.8, -Math.min(6, sp * 0.25));
      }
    }
    if (Math.random() < dt * 0.5) disturb(Math.random() * W, Math.random() * H, unit * 0.005, -2.5);
    acc += Math.min(dt, 0.05);
    while (acc > 1 / 60) { step(); acc -= 1 / 60; }
    for (let i = 0; i < A.length; i++) {
      const v = 128 + A[i] * 18;
      bytes[i] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
    hTex.uploadLum(bytes, gw, gh);
    S.begin().tex('uH', hTex).set('uGrid', gw, gh).set('uTime', t).draw();
  }

  return {
    resize,
    frame,
    reset() { A.fill(0); B.fill(0); },
    destroy: S.destroy,
  };
}
