// PLASMA — hold out an open palm and a ball of plasma gathers in it: a turbulent violet-white
// core, lightning filaments crawling outward, and real light thrown onto you and the room.
// Two hands make a bigger orb. Close your hand to release it in a burst.
import { glScene, rand } from './base.js';
import { createOrbControl } from './orb.js';
import { plasmaColor } from '../tracking/settings.js';

const FS = `
uniform vec4 uOrb; uniform vec4 uFlash; uniform vec2 uRes; uniform float uTime; uniform vec3 uTint;
float filament(vec2 q, float r, float t, float i){
  float base = hash(vec2(i, 7.))*6.2831 + t*(.25 + .35*hash(vec2(i, 3.))) + sin(t*.7 + i*1.7)*.9;
  float a = atan(q.y, q.x);
  float jag = (fbm(vec2(r*2.6 - t*2.2, i*7.1)) - .5)*1.3 + (vnoise(vec2(r*11. - t*7., i*3.3)) - .5)*.45;
  float d = a - base - jag/(r + .35);
  float da = abs(atan(sin(d), cos(d)));
  float w = .016 + .012/(r + .2);
  float line = exp(-da*r/w);
  float len = 1.35 + 1.5*hash(vec2(i, floor(t*3. + i)));
  return line * smoothstep(len, len*.55, r) * smoothstep(.82, 1.02, r);
}
void main(){
  vec2 uv = vUv; float aspect = uRes.x/uRes.y; float t = uTime;
  vec2 P = uv*uRes;
  vec3 room = cam(uv);
  float ch = uOrb.w;
  vec3 col = room;
  if (ch > .001) {
    vec2 q = (P - uOrb.xy)/uOrb.z;
    float r = length(q);
    float flick = .85 + .15*sin(t*37.) * sin(t*23.1);
    col = room*mix(1., .55, ch);                                     // the room dims around it
    col += room*mix(uTint, vec3(1.), .4)*ch*1.9*flick/(1. + pow(r/2.4, 2.)); // and is lit by it
    col += uTint*ch*.3*exp(-max(r - 1., 0.)*1.4);                      // halo in the air
    float inside = smoothstep(1.02, .9, r);
    vec2 sq = q*(1.2 - .2*r*r);                                         // bulge: a sphere, not a disc
    float turb = fbm(sq*2.6 + vec2(t*1.4, -t*1.1)) + .5*fbm(sq*5.5 - vec2(t*2.3, t*1.7));
    float core = exp(-r*r*3.);
    vec3 plasma = mix(uTint*.8, mix(uTint, vec3(1.), .88), core + .25*turb) * (.55 + .9*turb);
    plasma += mix(uTint, vec3(1.), .75)*pow(max(0., turb - .75), 2.)*4.;
    float rim = smoothstep(.75, 1., r)*inside;
    col = mix(col, plasma*1.25 + mix(uTint, vec3(1.), .4)*rim*.5, inside*ch);
    float fil = 0.;
    for (int i = 0; i < 8; i++) fil += filament(q, r, t, float(i));
    float k = ch*smoothstep(.15, .5, ch);
    col += (mix(uTint, vec3(1.), .4)*fil*1.2 + vec3(1.)*pow(min(fil, 1.5), 3.)*.8)*k;
  }
  if (uFlash.w > .001) {
    float fr = length(P - uFlash.xy);
    float ring = exp(-abs(fr - uFlash.z)/(6. + uFlash.z*.06));
    col += mix(uTint, vec3(1.), .4)*ring*uFlash.w*1.4;
    col += room*mix(uTint, vec3(1.), .5)*uFlash.w*.9*exp(-fr/(uFlash.z + 60.));
  }
  col = col/(1. + .35*max(vec3(0.), col - .85));
  col *= mix(.82, 1., smoothstep(1.35, .35, length((uv - .5)*vec2(aspect, 1.))));
  gl_FragColor = vec4(col, 1.);
}`;

export function createPlasma({ root }) {
  const S = glScene(root, FS);
  const fx = document.createElement('canvas');
  fx.className = 'layer';
  root.appendChild(fx);
  const c = fx.getContext('2d');
  const ctl = createOrbControl({ keepAlive: 0.4 });
  let W = 0, H = 0, D = 1, t = 0;
  let orb = { x: 0, y: 0, r: 0, charge: 0 };
  let flash = { x: 0, y: 0, r: 0, a: 0 };
  let sparks = [];

  function resize(w, h, dpr) {
    W = w; H = h; D = Math.min(dpr, 2);
    S.resize(w, h, dpr);
    fx.width = Math.round(w * D); fx.height = Math.round(h * D);
  }

  function frame(input, dt) {
    t += dt;
    const k = dt * 60;
    const tint = plasmaColor.rgb();
    const sc = tint.map((v) => Math.round((v * 0.55 + 0.45) * 255)).join(',');
    const rel = ctl.update(input, dt, W, H);
    const st = ctl.st;
    if (st.active) {
      orb = { x: st.x, y: st.y, r: st.r * (0.32 + 0.38 * st.charge) * (st.two ? 1.25 : 1), charge: st.charge };
    } else {
      orb.charge = Math.max(0, orb.charge - dt * 4);
    }
    // a fist (or letting go of the mouse) releases it in a burst; if your hand just leaves, it fades
    if (rel) {
      if (rel.charge > 0.2 && (rel.why !== 'gone' || rel.hand === 'ptr')) {
        flash = { x: rel.x, y: rel.y, r: rel.r * 0.3, a: 0.6 + rel.charge * 0.6 };
        const n = Math.round(30 + rel.charge * 60);
        for (let i = 0; i < n; i++) {
          const a = rand(0, Math.PI * 2), sp = rand(4, 16) * (0.5 + rel.charge);
          sparks.push({ x: rel.x, y: rel.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.25, 0.7), max: 0.7 });
        }
      }
      orb.charge = Math.min(orb.charge, 0.6);
    }
    if (flash.a > 0) { flash.r += (Math.min(W, H) * 0.035 + flash.r * 0.06) * k; flash.a = Math.max(0, flash.a - dt * 2.2); }
    // stray crackles off the surface while charged
    if (st.active && Math.random() < st.charge * 0.5 * k) {
      const a = rand(0, Math.PI * 2);
      sparks.push({ x: orb.x + Math.cos(a) * orb.r, y: orb.y + Math.sin(a) * orb.r, vx: Math.cos(a) * rand(1, 4), vy: Math.sin(a) * rand(1, 4), life: rand(0.1, 0.3), max: 0.3 });
    }

    const s = S.canvas.width / W;
    S.begin()
      .set('uOrb', orb.x * s, orb.y * s, Math.max(1, orb.r * s), orb.charge)
      .set('uFlash', flash.x * s, flash.y * s, flash.r * s, flash.a)
      .set('uTime', t)
      .set('uTint', ...tint)
      .draw();

    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, fx.width, fx.height);
    c.setTransform(D, 0, 0, D, 0, 0);
    c.globalCompositeOperation = 'lighter';
    c.lineCap = 'round';
    sparks = sparks.filter((p) => {
      p.life -= dt;
      const ox = p.x, oy = p.y;
      p.vx *= Math.pow(0.93, k); p.vy *= Math.pow(0.93, k);
      p.x += p.vx * k; p.y += p.vy * k;
      const a = Math.max(0, p.life / p.max);
      c.strokeStyle = `rgba(${sc},${a})`;
      c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(ox, oy); c.lineTo(p.x, p.y); c.stroke();
      return p.life > 0;
    });
    c.globalCompositeOperation = 'source-over';
  }

  return {
    resize,
    frame,
    reset() { sparks = []; orb.charge = 0; flash.a = 0; },
    destroy() { S.destroy(); fx.remove(); },
  };
}
