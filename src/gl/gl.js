// Minimal WebGL1 renderer: fullscreen-quad programs, textures and render targets.
// Convention: vUv has a top-left origin. Uploaded images sample with uv directly;
// render targets sample with flip(uv) (see GLSL `rt()` helper).
const VS = `
attribute vec2 p;
varying vec2 vUv;
void main(){ vUv = vec2(p.x*.5+.5, .5-p.y*.5); gl_Position = vec4(p,0.,1.); }`;

export const NOISE = `
float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){
  vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),u.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y);
}
float fbm(vec2 p){ float v=0., a=.5; for(int i=0;i<4;i++){ v+=a*vnoise(p); p=p*2.03+17.1; a*=.5; } return v; }
vec4 rt(sampler2D t, vec2 uv){ return texture2D(t, vec2(uv.x, 1.-uv.y)); }
`;

export function createRenderer(canvas) {
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, premultipliedAlpha: false, powerPreference: 'high-performance' });
  if (!gl) throw new Error('WebGL not available');
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };

  function program(fs) {
    const pr = gl.createProgram();
    gl.attachShader(pr, compile(gl.VERTEX_SHADER, VS));
    gl.attachShader(pr, compile(gl.FRAGMENT_SHADER, 'precision highp float;\nvarying vec2 vUv;\n' + NOISE + fs));
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    const loc = gl.getAttribLocation(pr, 'p');
    const uni = {};
    const u = (n) => (n in uni ? uni[n] : (uni[n] = gl.getUniformLocation(pr, n)));
    let unit = 0;
    return {
      begin() {
        gl.useProgram(pr);
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        unit = 0;
        return this;
      },
      set(n, ...v) {
        const l = u(n);
        if (l === null) return this;
        if (v.length === 1) gl.uniform1f(l, v[0]);
        else if (v.length === 2) gl.uniform2f(l, v[0], v[1]);
        else if (v.length === 3) gl.uniform3f(l, v[0], v[1], v[2]);
        else gl.uniform4f(l, v[0], v[1], v[2], v[3]);
        return this;
      },
      setv4(n, arr) {
        const l = u(n);
        if (l !== null) gl.uniform4fv(l, arr);
        return this;
      },
      tex(n, t) {
        const l = u(n);
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, t.tex || t);
        if (l !== null) gl.uniform1i(l, unit);
        unit++;
        return this;
      },
      draw(target = null) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
        gl.viewport(0, 0, target ? target.w : canvas.width, target ? target.h : canvas.height);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      },
    };
  }

  function makeTex(filter = gl.LINEAR) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    return t;
  }

  function texture() {
    const t = makeTex();
    return {
      tex: t,
      w: 1,
      h: 1,
      upload(src) {
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
        this.w = src.videoWidth || src.width;
        this.h = src.videoHeight || src.height;
      },
      uploadLum(data, w, h) {
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, w, h, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, data);
        this.w = w; this.h = h;
      },
    };
  }

  function target(w, h) {
    const t = makeTex();
    const fb = gl.createFramebuffer();
    const r = {
      tex: t, fb, w: 0, h: 0,
      resize(nw, nh) {
        r.w = Math.max(1, nw | 0);
        r.h = Math.max(1, nh | 0);
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, r.w, r.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      },
    };
    r.resize(w, h);
    return r;
  }

  return {
    gl,
    program,
    texture,
    target,
    resize(w, h) { canvas.width = w; canvas.height = h; },
    destroy() { gl.getExtension('WEBGL_lose_context')?.loseContext(); },
  };
}
