// RAIN — rain on the window in front of you. Drops gather, run and leave trails;
// each one is a tiny lens showing the room sharp. Wipe the glass with a finger or palm.
import { glScene, maskCanvas } from './base.js';
import { tracePath } from '../tracking/input.js';

const FS = `
uniform sampler2D uMask; uniform vec2 uRes; uniform vec2 uMaskRes; uniform float uTime;
float aspect;

// One layer of beaded drops sitting on the glass.
// Sizes are skewed: lots of small ones, a few large. Shapes are slightly irregular
// and heavier at the bottom. Drops slowly grow, then vanish (merged or ran off).
// returns: lens displacement (uv units) .xy, coverage .z, normalised radius position |q| .w
vec4 beads(vec2 uv, float t, float dens, float seed, float rmin, float rmax, float presence){
  vec2 p = uv*vec2(aspect,1.)*dens;
  vec2 id = floor(p); vec2 f = fract(p) - .5;
  float h1 = hash(id+seed), h2 = hash(id+seed+1.7), h3 = hash(id+seed+3.1), h4 = hash(id+seed+5.3), h5 = hash(id+seed+8.9);
  if (h5 > presence) return vec4(0.);
  float life = fract(t*(.012 + .025*h3) + h4);
  float grow = smoothstep(0., .5, life);
  float gone = smoothstep(1., .94, life);
  float r = mix(rmin, rmax, h1*h1*h1) * (.55 + .45*grow) * gone;
  vec2 c = (vec2(h2, h3) - .5) * (.9 - 2.*r);
  vec2 q = f - c;
  float ang = atan(q.y, q.x);
  float irr = 1. + .06*sin(ang*3. + h2*6.28) + .035*sin(ang*5. + h4*6.28) + .02*sin(ang*7. + h1*6.28);
  vec2 qs = q; qs.y *= q.y > 0. ? .88 : 1.06;          // gravity: flatter top, fuller bottom
  float d = length(qs)/irr;
  float m = smoothstep(r, r*.82, d);
  vec2 nq = qs/(max(r, 1e-4)*irr);
  // lens: a drop shows a wide, flipped view of what's behind it
  vec2 disp = -nq * (r/dens) * 4.5 / vec2(aspect, 1.);
  return vec4(disp*m, m, length(nq)*m);
}

// Running drops: a round head with a short tail, stick–slip motion, a wet trail with stranded beads.
// returns: disp.xy, head coverage, trail
vec4 runner(vec2 uv, float t, float cols, float seed){
  vec2 a = vec2(aspect, 1.);
  vec2 p = uv*a*vec2(cols, cols*.38);
  float cx = floor(p.x);
  p.y += hash(vec2(cx, seed))*13.7;
  vec2 id = floor(p);
  vec2 f = fract(p);
  float h = hash(id + seed);
  if (h < .5) return vec4(0.);
  float s = fract(t*(.035 + .06*hash(id+seed+4.)) + h*7.);
  float y = s + sin(s*31.)*.01 + sin(s*11.)*.008;
  float x0 = .5 + (hash(id+seed+2.) - .5)*.6;
  float xAt = x0 + sin(f.y*7. + h*6.)*.03 + sin(f.y*23. + h)*.006;
  vec2 pos = vec2(x0 + sin(y*7. + h*6.)*.03 + sin(y*23. + h)*.006, y);
  float R = (.035 + .05*hash(id+seed+6.)*hash(id+seed+6.));
  vec2 q = (f - pos)*vec2(1., 1./.38);
  q.y *= q.y < 0. ? .75 : 1.;
  float d = length(q);
  float head = smoothstep(R, R*.8, d);
  float above = pos.y - f.y;
  float tw = R*.45*(1. - smoothstep(0., .5, above)) + .006;
  float trail = smoothstep(tw, tw*.4, abs(f.x - xAt)) * smoothstep(0., .02, above) * smoothstep(.55, .05, above);
  // beads left behind in the trail
  float by = fract(f.y*18. + h*3.) - .5;
  float bsz = .12 + .2*hash(floor(vec2(cx*3.1, f.y*18.)) + seed);
  vec2 bq = vec2((f.x - xAt)*7., by);
  float bead = smoothstep(bsz, bsz*.7, length(bq)) * trail * step(.45, hash(floor(vec2(cx, f.y*18.)) + seed + 2.));
  vec2 nq = q/R;
  vec2 disp = -nq*(R/cols)*4.5/a*head - bq*.004*bead;
  return vec4(disp, max(head, bead), trail);
}

void main(){
  vec2 uv = vUv; aspect = uRes.x/uRes.y;
  float t = uTime;
  float wet = texture2D(uMask, uv).a;               // 1 = rainy glass, 0 = freshly wiped

  // fine mist → small → medium → a few heavy beads
  vec4 b0 = beads(uv, t,       150., 11., .10, .28, .55);
  vec4 b1 = beads(uv, t*1.1,    70., 1.,  .08, .30, .55);
  vec4 b2 = beads(uv, t*.9,     30., 7.,  .06, .30, .5);
  vec4 b3 = beads(uv, t*.8,     13., 4.,  .05, .26, .35);
  vec4 r1 = runner(uv, t, 6., 3.);
  vec4 r2 = runner(uv, t*1.15, 10., 9.);

  vec2 disp = (b0.xy + b1.xy + b2.xy + b3.xy) * wet + r1.xy + r2.xy;
  float cov = clamp(max(max(b1.z, b2.z), b3.z)*wet + max(r1.z, r2.z), 0., 1.);
  float mist = b0.z * wet;
  float rr = max(max(b1.w, b2.w), b3.w)*wet;
  float trail = max(r1.w, r2.w);

  vec3 sharp = cam(uv);
  vec3 misted = mix(camMid(uv), camSoft(uv), .5);
  misted = mix(misted, vec3(.6,.64,.68), .14);
  float clearAmt = max(trail*.75, 1. - wet);
  vec3 col = mix(misted, mix(camMid(uv), sharp, .65), clearAmt);

  // tiny mist droplets: just a sparkle and a dark speck
  col = mix(col, cam(uv + b0.xy)*.9, mist*.6);

  // proper drops: sharp, flipped room inside; dark rim; light gathered at the bottom
  vec3 lens = cam(uv + disp);
  float len = length(disp)*uRes.y;               // ~how far from the drop centre we sample
  vec2 n2 = normalize(disp + 1e-5);
  vec2 nqe = -n2*rr;                              // estimated position inside the drop
  vec3 dropCol = lens*1.06;
  dropCol *= 1. - .6*smoothstep(.55, 1., rr);      // dark refracting rim
  dropCol += smoothstep(.45, .95, nqe.y)*.06;      // light gathers at the bottom
  col = mix(col, dropCol, cov);
  float spec = smoothstep(.32, .04, length(nqe - vec2(-.28, -.4)));
  col += spec*cov*.55;

  col *= vec3(.94, .975, 1.04);
  col *= mix(.78, 1., smoothstep(1.35, .35, length((uv-.5)*vec2(aspect,1.))));
  gl_FragColor = vec4(col, 1.);
}`;

export function createRain({ root }) {
  const S = glScene(root, FS);
  const maskTex = S.R.texture();
  const SCALE = 0.35;
  const mask = maskCanvas(SCALE);
  let t = 0;
  const full = (x, w, h) => { x.globalCompositeOperation = 'source-over'; x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); };

  function resize(w, h, dpr) {
    S.resize(w, h, dpr);
    mask.resize(w, h, full);
  }

  function frame(input, dt) {
    t += dt;
    const k = dt * 60;
    const x = mask.x;
    // the rain fills the glass back in
    x.globalCompositeOperation = 'source-over';
    x.fillStyle = `rgba(255,255,255,${0.0035 * k})`;
    x.fillRect(0, 0, mask.c.width, mask.c.height);
    x.globalCompositeOperation = 'destination-out';
    x.lineCap = 'round';
    for (const a of input.agents) {
      if (a.kind === 'hover') continue;
      const p = { x: a.x * SCALE, y: a.y * SCALE };
      const q = a.prev ? { x: a.prev.x * SCALE, y: a.prev.y * SCALE } : p;
      const w = a.kind === 'palm' ? Math.max(14, a.r * 2 * SCALE) : Math.max(1.5, a.r * 2.2 * SCALE);
      x.lineJoin = 'round';
      x.strokeStyle = 'rgba(0,0,0,0.5)'; x.lineWidth = w * 1.5;
      tracePath(x, a.path, SCALE); x.stroke();
      x.strokeStyle = '#000'; x.lineWidth = w;
      tracePath(x, a.path, SCALE); x.stroke();
    }
    maskTex.upload(mask.c);
    S.begin().tex('uMask', maskTex).set('uMaskRes', mask.c.width, mask.c.height).set('uTime', t).draw();
  }

  return {
    resize,
    frame,
    reset() { full(mask.x, mask.c.width, mask.c.height); },
    destroy: S.destroy,
  };
}
