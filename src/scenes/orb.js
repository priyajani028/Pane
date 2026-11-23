// Shared "something in your hand" controller for Plasma and Ember.
//  • Open your palm to start it (or press with mouse/touch). It charges while the palm is open.
//  • Once started it stays with that hand whatever shape the hand makes, so holding your palm
//    face-up (edge-on to the camera) doesn't lose it.
//  • A clear fist releases it ('closed'). A fast flick reports 'flick'. If the hand leaves for a
//    while, 'gone'. Lifting the pointer: 'gone' with the drag velocity.
export function createOrbControl({ keepAlive = 0.4 } = {}) {
  const st = { active: false, hand: null, x: 0, y: 0, r: 0, charge: 0, vx: 0, vy: 0, lost: 0, two: false, cool: 0 };

  function handPos(a) {
    if (a.kind === 'palm') return { x: a.x, y: a.y, r: a.r };
    if (a.palm) return { x: a.palm.x, y: a.palm.y, r: (a.size || 100) * 0.95 };
    return { x: a.x, y: a.y, r: a.r };
  }

  function release(why) {
    st.active = false;
    return { why, hand: st.hand, x: st.x, y: st.y, r: st.r, charge: st.charge, vx: st.vx, vy: st.vy, speed: Math.hypot(st.vx, st.vy) };
  }

  function update(input, dt, W, H) {
    const unit = Math.min(W, H);
    st.cool = Math.max(0, st.cool - dt);
    const palms = input.agents.filter((a) => a.kind === 'palm');
    const ptr = input.agents.find((a) => a.id.startsWith('ptr-'));

    if (!st.active) {
      const a = palms[0] || ptr;
      if (!a) return null;
      const p = ptr && !palms.length ? { x: ptr.x, y: ptr.y, r: unit * 0.17 } : handPos(a);
      Object.assign(st, { active: true, hand: ptr && !palms.length ? 'ptr' : a.hand, x: p.x, y: p.y, r: p.r * 0.6, charge: 0, vx: 0, vy: 0, lost: 0 });
    }

    // find "our" hand in any pose
    let me = null, open = false, fist = false;
    if (st.hand === 'ptr') { me = ptr ? { x: ptr.x, y: ptr.y, r: unit * 0.17 } : null; open = !!ptr; }
    else {
      const mine = input.agents.filter((a) => a.hand === st.hand);
      const a = mine[0] || palms[0];
      if (a) { me = handPos(a); open = a.kind === 'palm'; fist = a.kind === 'hover' && a.pen === 'fist'; if (!mine.length) st.hand = a.hand; }
    }

    // two open palms close together make one bigger orb
    st.two = false;
    if (palms.length >= 2) {
      const [a, b] = palms;
      if (Math.hypot(a.x - b.x, a.y - b.y) < (a.r + b.r) * 2.2) {
        me = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, r: ((a.r + b.r) / 2) * 1.45 };
        open = true;
        st.two = true;
      }
    }

    if (!me) {
      st.lost += dt;
      st.vx *= 0.9; st.vy *= 0.9;
      const fast = Math.hypot(st.vx, st.vy) > unit * 1.2;
      if (st.hand === 'ptr' || st.lost > keepAlive || (fast && st.lost > 0.06)) return release(fast ? 'flick' : 'gone');
      return null;
    }
    st.lost = 0;
    if (fist) return release('closed');

    const ivx = (me.x - st.x) / Math.max(dt, 1e-3), ivy = (me.y - st.y) / Math.max(dt, 1e-3);
    st.vx = st.vx * 0.65 + ivx * 0.35;
    st.vy = st.vy * 0.65 + ivy * 0.35;
    st.x += (me.x - st.x) * Math.min(1, dt * 30);
    st.y += (me.y - st.y) * Math.min(1, dt * 30);
    st.r += (me.r - st.r) * Math.min(1, dt * 6);
    if (open) st.charge = Math.min(1, st.charge + dt * (st.two ? 0.9 : 0.55));

    if (st.hand !== 'ptr' && st.cool <= 0 && st.charge > 0.3 && Math.hypot(st.vx, st.vy) > unit * 2.2) {
      st.cool = 0.6;
      const r = { why: 'flick', hand: st.hand, x: st.x, y: st.y, r: st.r, charge: st.charge, vx: st.vx, vy: st.vy, speed: Math.hypot(st.vx, st.vy) };
      st.charge = 0; // stays attached; open your palm to light it again
      return r;
    }
    return null;
  }

  return { st, update };
}
