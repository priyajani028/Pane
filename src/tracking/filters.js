// One-Euro filter: smooth when slow, responsive when fast.
class LowPass {
  constructor() { this.y = null; }
  filter(x, a) {
    this.y = this.y === null ? x : a * x + (1 - a) * this.y;
    return this.y;
  }
}

export class OneEuro {
  constructor(minCutoff = 1.2, beta = 0.02, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.x = new LowPass();
    this.dx = new LowPass();
    this.last = null;
    this.prevRaw = null;
  }
  alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }
  filter(value, t) {
    if (this.last === null) {
      this.last = t;
      this.prevRaw = value;
      return this.x.filter(value, 1);
    }
    const dt = Math.max(1e-3, (t - this.last) / 1000);
    this.last = t;
    const d = (value - this.prevRaw) / dt;
    this.prevRaw = value;
    const ed = this.dx.filter(d, this.alpha(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(ed);
    return this.x.filter(value, this.alpha(cutoff, dt));
  }
  reset() {
    this.x = new LowPass();
    this.dx = new LowPass();
    this.last = null;
  }
}

export class Filter2D {
  constructor(minCutoff, beta) {
    this.fx = new OneEuro(minCutoff, beta);
    this.fy = new OneEuro(minCutoff, beta);
  }
  filter(x, y, t) {
    return { x: this.fx.filter(x, t), y: this.fy.filter(y, t) };
  }
  reset() { this.fx.reset(); this.fy.reset(); }
}
