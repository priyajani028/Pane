import { createRenderer } from '../gl/gl.js';
import { createCamera, CAM_GLSL } from '../gl/camera.js';

/** A full-screen WebGL scene whose shader can sample the graded camera (sharp / mid / soft). */
export function glScene(root, fs) {
  const canvas = document.createElement('canvas');
  canvas.className = 'layer';
  root.appendChild(canvas);
  const R = createRenderer(canvas);
  const camera = createCamera(R);
  const prog = R.program(CAM_GLSL + fs);
  return {
    canvas,
    R,
    camera,
    prog,
    resize(w, h, dpr) {
      const r = Math.min(dpr, w * h > 1.6e6 ? 1.25 : 1.5);
      R.resize(Math.round(w * r), Math.round(h * r));
      camera.resize(canvas.width, canvas.height);
    },
    begin() {
      camera.update();
      return camera.bind(prog.begin()).set('uRes', canvas.width, canvas.height);
    },
    destroy() {
      R.destroy();
      canvas.remove();
    },
  };
}

/** Canvas helper: a 2D mask kept at a fraction of screen size that survives resizes. */
export function maskCanvas(scale) {
  const c = document.createElement('canvas');
  const x = c.getContext('2d');
  let inited = false;
  return {
    c, x, scale,
    resize(w, h, init) {
      const nw = Math.max(2, Math.round(w * scale)), nh = Math.max(2, Math.round(h * scale));
      if (inited) {
        const o = document.createElement('canvas');
        o.width = c.width; o.height = c.height;
        o.getContext('2d').drawImage(c, 0, 0);
        c.width = nw; c.height = nh;
        x.drawImage(o, 0, 0, nw, nh);
      } else {
        c.width = nw; c.height = nh;
        init?.(x, nw, nh);
        inited = true;
      }
    },
  };
}

export const rand = (a, b) => a + Math.random() * (b - a);
