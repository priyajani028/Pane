import { useCallback, useEffect, useState } from 'react';
import { SCENES } from './scenes/index.js';
import Experience from './ui/Experience.jsx';

const read = () => window.location.hash.replace(/^#\/?/, '');

export default function App() {
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => setRoute(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = useCallback((id) => { window.location.hash = `/${id}`; }, []);
  const scene = SCENES.find((s) => s.id === route) || SCENES[0];

  useEffect(() => {
    document.title = scene.id === 'fog' ? 'Pane — breathe, touch, wipe' : `${scene.name} — Pane`;
  }, [scene]);

  return <Experience scene={scene} go={go} />;
}
