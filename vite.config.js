import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// MediaPipe's bundle points at a source map it doesn't ship, which makes Vite log an
// ENOENT warning on every start. Serve the file with that comment stripped.
const quietMediapipe = {
  name: 'quiet-mediapipe-sourcemap',
  enforce: 'pre',
  load(id) {
    const file = id.split('?')[0];
    if (!file.includes('@mediapipe/tasks-vision') || !/\.m?js$/.test(file)) return null;
    const code = readFileSync(file, 'utf8').replace(/\/\/# sourceMappingURL=\S+\s*$/gm, '');
    return { code, map: null };
  },
};

export default defineConfig({
  plugins: [quietMediapipe, react()],
  optimizeDeps: { exclude: ['@mediapipe/tasks-vision'] },
});
