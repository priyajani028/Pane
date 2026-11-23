// EMBER — an open palm holds a living flame: warm flickering light on your face,
// heat shimmer bending the room, sparks drifting up. Flick to throw it; close your hand to snuff it.
import { glScene, rand } from './base.js';
import { createOrbControl } from './orb.js';

const MAXB = 4;

const FS = `
uniform vec4 uOrb; uniform vec4 uBalls[${MAXB}]; uniform vec4 uBallsV[${MAXB}]; uniform float uN;
uniform vec2 uRes; uniform float uTime;
vec3 ramp(float v){
  v = clamp(v, 0., 1.);
  return vec3(1., .28, .04)*smoothstep(.0, .35, v) + vec3(0., .42, .16)*smoothstep(.3, .65, v) + vec3(0., .25, .55)*smoothstep(.65, 1., v);
}
// flame in local units (y down, flame rises toward -y), base near y≈.35
float flame(vec2 q, float t){
  float h = clamp((.4 - q.y)/2.2, 0., 1.);                // 0 at the base … 1 at the tip
  float n  = fbm(vec2(q.x*2.1, q.y*1.5 + t*2.9));
  float n2 = fbm(vec2(q.x*4.6 + 3., q.y*3.6 + t*4.4));
  float sway = (n - .5)*.75*h + sin(t*2.3 + q.y*1.5)*.06*h;
  float width = mix(.62, .02, pow(h, .75));
  float body = 1. - abs(q.x + sway)/width;
  float d = body + (n2 - .5)*.55*h - h*.25;
  d *= smoothstep(.62, .25, q.y);                          // soft bottom
  d *= smoothstep(1.02, .7, h);                            // tongues break off at the top
  return clamp(d, 0., 1.);
}
float fireball(vec2 q, vec2 dir, float t){
  float along = dot(q, dir);
  vec2 qq = q; if (along < 0.) qq -= dir*along*.55;        // trailing side stretches into a tail
  float r = length(qq);
  float n = fbm(q*2.8 - dir*t*6. + t*1.5);
  return clamp(1.05 - r + (n - .5)*.9, 0., 1.);
}
void main(){
  vec2 uv = vUv; float aspect = uRes.x/uRes.y; float t = uTime;
  vec2 P = uv*uRes;
  float ch = uOrb.w;
  vec2 q = (P - uOrb.xy)/uOrb.z;
  float flick = .82 + .1*sin(t*13.) + .08*sin(t*29.7 + 1.3);
  // heat shimmer above the flame
  float heat = ch*exp(-length((q - vec2(0., -1.2))*vec2(1.4, .7))*1.1);
  vec2 sh = (vec2(vnoise(P*.045 + vec2(0., t*4.)), vnoise(P*.045 + vec2(5., t*4.))) - .5)*.012*heat;
  vec3 room = cam(uv + sh);
  vec3 col = room*mix(1., .6, ch);
  float r = length(q - vec2(0., -.4));
  col += room*vec3(1., .58, .26)*ch*1.05*flick/(1. + pow(r/2.6, 2.));
  float light2 = 0.;
  for (int i = 0; i < ${MAXB}; i++) {
    if (float(i) >= uN) break;
    vec4 b = uBalls[i];
    float rb = length(P - b.xy)/b.z;
    light2 += b.w*1.4/(1. + pow(rb/3., 2.));
  }
  col += room*vec3(1., .58, .26)*light2*.7;
  if (ch > .001) {
    float f = flame(q, t);
    float core = flame(q*vec2(1.6, 1.3) + vec2(0., .14), t + 3.);
    // flames are mostly opaque light: lay the colour over the room, then add the hot core
    float a = smoothstep(.02, .35, f)*ch;
    vec3 fc = ramp(.15 + f*.8);
    col = mix(col, fc, a*.88);
    col += vec3(1., .82, .5)*smoothstep(.35, .85, core)*.55*ch;
    col += vec3(1., .4, .1)*ch*.12*exp(-r*.9);             // glow in the air
  }
  for (int i = 0; i < ${MAXB}; i++) {
    if (float(i) >= uN) break;
    vec4 b = uBalls[i];
    vec2 bq = (P - b.xy)/b.z;
    float f = fireball(bq, uBallsV[i].xy, t + float(i)*3.);
    col = mix(col, ramp(.15 + f*.85), smoothstep(.02, .3, f)*.9*b.w);
    col += vec3(1., .85, .6)*smoothstep(.55, .95, f)*.5*b.w;
    col += vec3(1., .45, .12)*b.w*.2*exp(-length(bq)*.8);
  }
  col = col/(1. + .35*max(vec3(0.), col - .85));
  col *= mix(.8, 1., smoothstep(1.35, .35, length((uv - .5)*vec2(aspect, 1.))));
  gl_FragColor = vec4(col, 1.);
}`;

export function createEmber({ root }) {
  const S = glScene(root, FS);
  const fx = document.createElement('canvas');
  fx.className = 'layer';
  root.appendChild(fx);
  const c = fx.getContext('2d');
  const ctl = createOrbControl({ keepAlive: 1.0 });
  const B = new Float32Array(MAXB * 4), BV = new Float32Array(MAXB * 4);
  let W = 0, H = 0, D = 1, t = 0;
  let orb = { x: 0, y: 0, r: 0, charge: 0 };
  let balls = [], sparks = [], smoke = [];

  function resize(w, h, dpr) {
    W = w; H = h; D = Math.min(dpr, 2);
    S.resize(w, h, dpr);
    fx.width = Math.round(w * D); fx.height = Math.round(h * D);
  }

  function burst(x, y, n, sp) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), v = rand(1, sp);
      sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1, life: rand(0.4, 1.1), max: 1.1, s: rand(0.8, 2) });
    }
  }

  function frame(input, dt) {
    t += dt;
    const k = dt * 60;
    const unit = Math.min(W, H);
    const rel = ctl.update(input, dt, W, H);
    const st = ctl.st;
    if (st.active && st.charge > 0.01) {
      const size = st.r * (0.42 + 0.4 * st.charge) * (st.two ? 1.3 : 1);
      // the flame sits a little above the palm and lags a touch behind fast moves
      orb.x = st.x; orb.y = st.y - st.r * 0.25; orb.r = size;
      orb.charge = Math.min(1, orb.charge + dt * 4, 0.3 + st.charge);
    } else orb.charge = Math.max(0, orb.charge - dt * (st.active ? 6 : 1.2));

    if (rel) {
      if (rel.why === 'flick' && balls.length < MAXB && orb.r > 0) {
        // flick: the flame leaves your hand as a fireball
        const sp = Math.min(rel.speed, unit * 2.2);
        const d = rel.speed || 1;
        balls.push({ x: orb.x, y: orb.y, vx: (rel.vx / d) * sp, vy: (rel.vy / d) * sp, r: Math.max(18, orb.r * 0.9), life: 1 });
        orb.charge = 0;
      } else if (rel.why === 'closed' || rel.hand === 'ptr') {
        // snuffed: a curl of smoke and a few last sparks
        for (let i = 0; i < 14; i++) smoke.push({ x: orb.x + rand(-1, 1) * orb.r * 0.4, y: orb.y - orb.r * rand(0, 1), vx: rand(-0.4, 0.4), vy: rand(-1.6, -0.6), r: orb.r * rand(0.25, 0.5), life: rand(1.2, 2.4), max: 2.4 });
        burst(orb.x, orb.y - orb.r * 0.5, 12, 3);
        orb.charge = 0;
      }
      // hand left the frame: the flame just dies down
    }

    // flame sparks
    if (orb.charge > 0.05 && Math.random() < orb.charge * 0.9 * k) {
      sparks.push({ x: orb.x + rand(-0.4, 0.4) * orb.r, y: orb.y - orb.r * rand(0.4, 1.4), vx: rand(-0.6, 0.6), vy: rand(-3.2, -1.2), life: rand(0.5, 1.4), max: 1.4, s: rand(0.7, 1.8) });
    }

    balls = balls.filter((b) => {
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.vy += unit * 0.25 * dt;
      b.life -= dt * 0.55;
      if (Math.random() < 0.8 * k) sparks.push({ x: b.x + rand(-0.3, 0.3) * b.r, y: b.y + rand(-0.3, 0.3) * b.r, vx: -b.vx * 0.004 + rand(-0.8, 0.8), vy: -b.vy * 0.004 + rand(-1.5, 0.2), life: rand(0.3, 0.8), max: 0.8, s: rand(0.8, 2.2) });
      const out = b.x < -b.r || b.x > W + b.r || b.y < -b.r || b.y > H + b.r;
      if (b.life <= 0 || out) { burst(Math.max(0, Math.min(W, b.x)), Math.max(0, Math.min(H, b.y)), 26, 7); return false; }
      return true;
    });

    const s = S.canvas.width / W;
    balls.forEach((b, i) => {
      B.set([b.x * s, b.y * s, b.r * s, Math.min(1, b.life * 1.5)], i * 4);
      const v = Math.hypot(b.vx, b.vy) || 1;
      BV.set([b.vx / v, b.vy / v, 0, 0], i * 4);
    });
    S.begin()
      .set('uOrb', orb.x * s, orb.y * s, Math.max(1, orb.r * s), orb.charge)
      .setv4('uBalls', B).setv4('uBallsV', BV).set('uN', balls.length)
      .set('uTime', t)
      .draw();

    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, fx.width, fx.height);
    c.setTransform(D, 0, 0, D, 0, 0);
    smoke = smoke.filter((p) => {
      p.life -= dt; p.x += p.vx * k + Math.sin(t * 2 + p.r) * 0.3; p.y += p.vy * k; p.r *= 1 + 0.012 * k;
      const a = Math.max(0, p.life / p.max) * 0.22;
      const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      g.addColorStop(0, `rgba(180,175,170,${a})`);
      g.addColorStop(1, 'rgba(180,175,170,0)');
      c.fillStyle = g;
      c.beginPath(); c.arc(p.x, p.y, p.r, 0, Math.PI * 2); c.fill();
      return p.life > 0;
    });
    c.globalCompositeOperation = 'lighter';
    c.lineCap = 'round';
    sparks = sparks.filter((p) => {
      p.life -= dt;
      const ox = p.x, oy = p.y;
      p.vx += Math.sin(t * 6 + p.s * 10) * 0.05 * k;
      p.vy -= 0.02 * k;
      p.vx *= Math.pow(0.985, k); p.vy *= Math.pow(0.985, k);
      p.x += p.vx * k; p.y += p.vy * k;
      const a = Math.max(0, p.life / p.max);
      const g = Math.round(120 + 110 * a), bl = Math.round(40 * a);
      c.strokeStyle = `rgba(255,${g},${bl},${a})`;
      c.lineWidth = p.s;
      c.beginPath(); c.moveTo(ox, oy); c.lineTo(p.x + 0.01, p.y); c.stroke();
      return p.life > 0;
    });
    c.globalCompositeOperation = 'source-over';
  }

  return {
    resize,
    frame,
    reset() { balls = []; sparks = []; smoke = []; orb.charge = 0; },
    destroy() { S.destroy(); fx.remove(); },
  };
}
