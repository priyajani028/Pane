// Copies MediaPipe's WASM runtime into /public so the app self-hosts it.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(root, 'node_modules/@mediapipe/tasks-vision/wasm');
const dest = resolve(root, 'public/mediapipe/wasm');

if (!existsSync(src)) {
  console.error('MediaPipe wasm not found. Run `npm install` first.');
  process.exit(1);
}
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log('✓ MediaPipe wasm copied to public/mediapipe/wasm');
