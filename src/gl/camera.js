// Shared camera layer for every scene: uploads the webcam (or a soft placeholder),
// grades it, and builds a medium + heavy gaussian blur used for fog, frost and glass.
import { tracker } from '../tracking/tracker.js';

export const CAM_GLSL = `
uniform sampler2D uCam; uniform sampler2D uMid; uniform sampler2D uSoft;
uniform vec2 uCover; uniform float uMirror;
vec3 grade(vec3 c){
  c = mix(c, c*c*(3.-2.*c), .35);                 // gentle filmic contrast
  float l = dot(c, vec3(.299,.587,.114));
  c = mix(vec3(l), c, .88);                         // a touch less saturated
  c = c*vec3(1.015,1.,.975) + vec3(.012,.01,.008);  // warm, lifted blacks
  return c;
}
vec2 camUV(vec2 uv){ vec2 v = vec2(mix(uv.x, 1.-uv.x, uMirror), uv.y); return (v-.5)*uCover+.5; }
vec3 cam(vec2 uv){ return grade(texture2D(uCam, camUV(uv)).rgb); }
vec3 camMid(vec2 uv){ return rt(uMid, uv).rgb; }
vec3 camSoft(vec2 uv){ return rt(uSoft, uv).rgb; }
`;

const PREP = `
${CAM_GLSL}
void main(){ gl_FragColor = vec4(cam(vUv), 1.); }`;

const BLUR = `
uniform sampler2D uT; uniform vec2 uDir;
void main(){
  vec3 c = rt(uT, vUv).rgb * .227027;
  c += (rt(uT, vUv + uDir*1.3846).rgb + rt(uT, vUv - uDir*1.3846).rgb) * .3162162;
  c += (rt(uT, vUv + uDir*3.2307).rgb + rt(uT, vUv - uDir*3.2307).rgb) * .0702703;
  gl_FragColor = vec4(c, 1.);
}`;

function paintPlaceholder() {
  // A softly lit room with a figure — only ever seen through fog before the camera starts.
  const c = document.createElement('canvas');
  c.width = 640; c.height = 480;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 480);
  g.addColorStop(0, '#cfc6ba'); g.addColorStop(0.6, '#b3a796'); g.addColorStop(1, '#8a7d6c');
  x.fillStyle = g; x.fillRect(0, 0, 640, 480);
  const w = x.createRadialGradient(520, 140, 10, 520, 140, 260);
  w.addColorStop(0, 'rgba(255,250,240,0.95)'); w.addColorStop(1, 'rgba(255,250,240,0)');
  x.fillStyle = w; x.fillRect(0, 0, 640, 480);
  x.fillStyle = '#e9e4dc'; x.fillRect(430, 40, 150, 230);
  x.fillStyle = 'rgba(70,58,48,0.55)'; x.fillRect(80, 330, 120, 150);
  // figure
  x.fillStyle = '#3a2f29';
  x.beginPath(); x.ellipse(320, 215, 78, 96, 0, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#c7a48c';
  x.beginPath(); x.ellipse(320, 232, 56, 72, 0, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#d9d2c8';
  x.beginPath(); x.ellipse(320, 470, 190, 150, 0, Math.PI, Math.PI * 2); x.fill();
  return c;
}

function testSource() {
  // Debug hook: ?src=/some-image.jpg stands in for the camera (useful for screenshots).
  try {
    const src = new URLSearchParams(location.search).get('src');
    if (!src) return null;
    const img = new Image();
    img.src = src;
    return img;
  } catch { return null; }
}

export function createCamera(R) {
  const src = R.texture();
  const prep = R.program(PREP);
  const blur = R.program(BLUR);
  const placeholder = paintPlaceholder();
  const test = testSource();
  let A, B, C, D, E;
  let lastStatic = null;
  let cover = [1, 1];
  let mirror = 1;
  let W = 1, H = 1;

  function resize(w, h) {
    W = w; H = h;
    const q = [Math.ceil(w / 4), Math.ceil(h / 4)];
    const e = [Math.ceil(w / 10), Math.ceil(h / 10)];
    if (!A) { A = R.target(...q); B = R.target(...q); C = R.target(...q); D = R.target(...e); E = R.target(...e); }
    else { A.resize(...q); B.resize(...q); C.resize(...q); D.resize(...e); E.resize(...e); }
  }

  function coverFor(sw, sh) {
    const rs = W / H, rt = sw / sh;
    return rs > rt ? [1, rt / rs] : [rs / rt, 1];
  }

  function pass(p, from, to, dx, dy) {
    p.begin().tex('uT', from).set('uDir', dx / from.w, dy / from.h).draw(to);
  }

  function update() {
    const v = tracker.video;
    const live = tracker.status === 'ready' && v && v.readyState >= 2 && v.videoWidth;
    let s;
    if (live) { src.upload(v); s = v; mirror = 1; lastStatic = null; }
    else {
      s = test && test.complete && test.naturalWidth ? test : placeholder;
      mirror = s === test ? 0 : 1;
      if (lastStatic !== s) { src.upload(s); lastStatic = s; }
    }
    cover = coverFor(s.videoWidth || s.naturalWidth || s.width, s.videoHeight || s.naturalHeight || s.height);
    bind(prep.begin()).draw(A);
    pass(blur, A, B, 1.2, 0); pass(blur, B, C, 0, 1.2);     // C: medium blur
    pass(blur, C, D, 1.5, 0); pass(blur, D, E, 0, 1.5);     // E: heavy blur
    pass(blur, E, D, 3, 0); pass(blur, D, E, 0, 3);
    return live;
  }

  function bind(p) {
    return p.tex('uCam', src).tex('uMid', C).tex('uSoft', E).set('uCover', cover[0], cover[1]).set('uMirror', mirror);
  }

  return { resize, update, bind };
}
