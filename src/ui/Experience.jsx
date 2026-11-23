import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { tracker } from '../tracking/tracker.js';
import { createInput } from '../tracking/input.js';
import { SCENES } from '../scenes/index.js';
import { settings, plasmaColor, PLASMA_COLORS } from '../tracking/settings.js';

function ColorControl() {
  const color = useSyncExternalStore(plasmaColor.subscribe, plasmaColor.get);
  const [open, setOpen] = useState(false);
  return (
    <div className={`linectl ${open ? 'open' : ''}`}>
      <button className="txt" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        Colour <span className="dot swatch" style={{ width: 10, height: 10, background: color }} />
      </button>
      {open && (
        <div className="pop colors">
          <div className="swatches">
            {PLASMA_COLORS.map((c) => (
              <button
                key={c.hex}
                className={`sw ${color.toLowerCase() === c.hex ? 'on' : ''}`}
                style={{ '--c': c.hex }}
                onClick={() => plasmaColor.set(c.hex)}
                aria-label={c.name}
                title={c.name}
              />
            ))}
          </div>
          <div className="scale names"><span>{PLASMA_COLORS.find((c) => c.hex === color.toLowerCase())?.name || 'Custom'}</span>
            <label className="custom">
              Custom
              <input type="color" value={color} onChange={(e) => plasmaColor.set(e.target.value)} />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

function LineControl() {
  const line = useSyncExternalStore(settings.subscribe, settings.get);
  const [open, setOpen] = useState(false);
  const d = Math.max(2, settings.radius(window.innerWidth, window.innerHeight) * 2);
  return (
    <div className={`linectl ${open ? 'open' : ''}`}>
      <button className="txt" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        Line <span className="dot" style={{ width: Math.min(14, 3 + line * 11), height: Math.min(14, 3 + line * 11) }} />
      </button>
      {open && (
        <div className="pop">
          <div className="preview"><span style={{ width: d, height: d }} /></div>
          <input
            type="range" min="0" max="1" step="0.01" value={line}
            onChange={(e) => settings.setLine(parseFloat(e.target.value))}
            aria-label="Line width"
          />
          <div className="scale"><span>Fine</span><span>Broad</span></div>
        </div>
      )}
    </div>
  );
}

const KEY = 'pane-camera';
const readPref = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const writePref = (v) => { try { localStorage.setItem(KEY, v); } catch { /* private mode */ } };

export default function Experience({ scene, go }) {
  const stageRef = useRef(null);
  const rootRef = useRef(null);
  const markRef = useRef(null);
  const inputRef = useRef(null);
  const instRef = useRef(null);
  const status = useSyncExternalStore(tracker.subscribe, tracker.getStatus);
  const [pref, setPref] = useState(readPref);
  const [hints, setHints] = useState(true);
  const [info, setInfo] = useState(false);
  const [fatal, setFatal] = useState(null);
  const live = status === 'ready';
  const gate = pref == null && status === 'idle';
  const touchMode = !live && !gate;

  useEffect(() => { if (pref === 'on') tracker.start(); }, [pref]);

  useEffect(() => {
    setHints(true);
    const id = setTimeout(() => setHints(false), 6500);
    return () => clearTimeout(id);
  }, [scene.id, live]);

  useEffect(() => {
    const stage = stageRef.current, root = rootRef.current, mark = markRef.current;
    const mc = mark.getContext('2d');
    let inst;
    try { inst = scene.create({ root }); }
    catch (e) { console.error(e); setFatal('This needs WebGL, which this browser has turned off.'); return; }
    setFatal(null);
    instRef.current = inst;
    const input = createInput(stage);
    inputRef.current = input;
    tracker.setNeeds(scene.needs);

    let W = 1, H = 1;
    const size = () => {
      const r = stage.getBoundingClientRect();
      W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
      const d = window.devicePixelRatio || 1;
      inst.resize(W, H, d);
      mark.width = Math.round(W * Math.min(d, 2)); mark.height = Math.round(H * Math.min(d, 2));
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(stage);

    let raf = 0, last = performance.now();
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const snap = input.read(W, H);
      inst.frame(snap, dt);
      // a faint touch-point so you know where your fingertip lands
      const s = mark.width / W;
      mc.setTransform(1, 0, 0, 1, 0, 0);
      mc.clearRect(0, 0, mark.width, mark.height);
      mc.setTransform(s, 0, 0, s, 0, 0);
      for (const a of snap.agents) {
        if (!a.id.startsWith('cam-') || a.kind === 'palm') continue;
        if (a.kind === 'hover') {
          // pen up: a hollow ring the size of the line, so you can place the next stroke
          if (a.pen !== 'hover') continue;
          mc.strokeStyle = 'rgba(255,255,255,0.85)';
          mc.lineWidth = 1.2;
          mc.shadowColor = 'rgba(0,0,0,0.35)';
          mc.shadowBlur = 4;
          mc.beginPath(); mc.arc(a.x, a.y, Math.max(5, a.r), 0, Math.PI * 2); mc.stroke();
          mc.shadowBlur = 0;
          continue;
        }
        const g = mc.createRadialGradient(a.x, a.y, 0, a.x, a.y, 9);
        g.addColorStop(0, 'rgba(255,255,255,0.55)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        mc.fillStyle = g;
        mc.beginPath(); mc.arc(a.x, a.y, 9, 0, Math.PI * 2); mc.fill();
      }
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); input.destroy(); inst.destroy(); instRef.current = null; };
  }, [scene]);

  // keyboard: ← → to change scene, R to reset, I for info
  useEffect(() => {
    const on = (e) => {
      if (e.target.closest?.('input,textarea')) return;
      const i = SCENES.findIndex((s) => s.id === scene.id);
      if (e.key === 'ArrowRight') go(SCENES[(i + 1) % SCENES.length].id);
      else if (e.key === 'ArrowLeft') go(SCENES[(i - 1 + SCENES.length) % SCENES.length].id);
      else if (e.key === 'r' || e.key === 'R') instRef.current?.reset();
      else if (e.key === 'i' || e.key === 'I') setInfo((v) => !v);
      else if (e.key === 'Escape') setInfo(false);
      else if (e.key === '[') settings.setLine(settings.line - 0.08);
      else if (e.key === ']') settings.setLine(settings.line + 0.08);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [scene, go]);

  const allow = () => { writePref('on'); setPref('on'); tracker.start(); };
  const touch = () => { writePref('off'); setPref('off'); };

  const hintList = Object.entries(scene.hints);
  const hintText = live || gate
    ? hintList.map(([, v]) => v).join('   ·   ')
    : scene.touchHint || [`Drag to ${scene.touch}`, 'Two fingers to wipe', scene.hints.breath ? 'Hold below to breathe' : null].filter(Boolean).join('   ·   ');

  return (
    <div className={`exp ui-${scene.ui}`}>
      <div className="stage" ref={stageRef}>
        <div className="layers" ref={rootRef} />
        <canvas className="layer mark" ref={markRef} />
      </div>

      <header className="top">
        <a className="wordmark" href="#/" onClick={(e) => { e.preventDefault(); go('fog'); }}>Pane</a>
        <div className="top-right">
          {scene.line && <LineControl />}
          {scene.color && <ColorControl />}
          <button className="txt" onClick={() => instRef.current?.reset()}>Reset</button>
          <button className="txt" onClick={() => setInfo(true)}>Info</button>
        </div>
      </header>

      <footer className="bottom">
        <p className={`hint ${hints && !gate ? 'on' : ''}`}>
          {status === 'loading' || status === 'requesting' ? 'Waking the camera' : hintText}
        </p>
        {touchMode && scene.hints.breath && (
          <button
            className="hold"
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); inputRef.current?.setBreathHold(true); }}
            onPointerUp={() => inputRef.current?.setBreathHold(false)}
            onPointerCancel={() => inputRef.current?.setBreathHold(false)}
            onContextMenu={(e) => e.preventDefault()}
          >
            Hold to breathe
          </button>
        )}
        <nav className="nav" aria-label="Scenes" ref={(el) => el?.querySelector('.on')?.scrollIntoView({ inline: 'center', block: 'nearest' })}>
          {SCENES.map((s, i) => (
            <button key={s.id} className={s.id === scene.id ? 'on' : ''} onClick={() => go(s.id)} aria-current={s.id === scene.id}>
              <span className="num">{String(i + 1).padStart(2, '0')}</span>{s.name}
            </button>
          ))}
        </nav>
      </footer>

      {gate && (
        <div className="gate">
          <h1>Breathe on the glass.</h1>
          <p>Pane uses your camera to see your hands and your breath.<br />Nothing is recorded. Nothing leaves this device.</p>
          <div className="gate-actions">
            <button className="pill" onClick={allow}>Allow camera</button>
            <button className="txt" onClick={touch}>Continue with touch</button>
          </div>
        </div>
      )}

      {(status === 'denied' || status === 'error') && pref === 'on' && (
        <div className="toast">{status === 'denied' ? 'Camera is blocked in your browser settings. Touch still works.' : 'Camera unavailable. Touch still works.'}</div>
      )}

      <aside className={`info ${info ? 'open' : ''}`} aria-hidden={!info}>
        <button className="txt close" onClick={() => setInfo(false)}>Close</button>
        <h2>Pane</h2>
        <p className="lede">Small, quiet surfaces that answer to your breath and your hands.</p>
        <ol className="scenes">
          {SCENES.map((s, i) => (
            <li key={s.id}>
              <button onClick={() => { go(s.id); setInfo(false); }}>
                <span className="num">{String(i + 1).padStart(2, '0')}</span>
                <span className="nm">{s.name}</span>
                <span className="nt">{s.note}</span>
              </button>
            </li>
          ))}
        </ol>
        <dl className="how">
          <div><dt>Open mouth</dt><dd>breath</dd></div>
          <div><dt>One finger</dt><dd>touch, write</dd></div>
          <div><dt>Two fingers</dt><dd>move without writing</dd></div>
          <div><dt>Fist</dt><dd>rest, release</dd></div>
          <div><dt>Open palm</dt><dd>wipe, push</dd></div>
        </dl>
        <p className="fine">
          Hands and face are tracked on this device with MediaPipe. Video is never recorded or uploaded, and the microphone is never used.
          Works best in soft, even light, about an arm’s length from the screen.
        </p>
        <p className="fine keys">← → scenes · [ ] line width · R reset · I info</p>
        {pref === 'off' && <button className="pill" onClick={() => { setInfo(false); allow(); }}>Turn on camera</button>}
      </aside>
      {info && <div className="scrim" onClick={() => setInfo(false)} />}

      {fatal && <div className="gate"><h1>Sorry.</h1><p>{fatal}</p></div>}
    </div>
  );
}
