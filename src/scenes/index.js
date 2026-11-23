import { createFog } from './fog.js';
import { createFrost } from './frost.js';
import { createRain } from './rain.js';
import { createBubbles } from './bubbles.js';
import { createWater } from './water.js';
import { createPlasma } from './plasma.js';
import { createEmber } from './ember.js';

// ui: 'ink' = dark type for bright scenes, 'light' = white type for dark ones
export const SCENES = [
  {
    id: 'fog', touch: 'write', line: true, name: 'Fog', ui: 'ink', needs: { face: true, hands: true }, create: createFog,
    note: 'A steamed-up mirror. Breathe on it, write in it, wipe it clean.',
    hints: { breath: 'Breathe on the glass', point: 'One finger writes', hover: 'Two fingers lift the pen', palm: 'Open palm wipes' },
  },
  {
    id: 'frost', touch: 'scratch', line: true, name: 'Frost', ui: 'ink', needs: { face: true, hands: true }, create: createFrost,
    note: 'A frozen pane. Warm breath melts it; the ice grows back from the edges.',
    hints: { breath: 'Breathe to melt', point: 'One finger scratches', hover: 'Two fingers lift the pen', palm: 'Open palm rubs' },
  },
  {
    id: 'rain', touch: 'wipe', line: true, name: 'Rain', ui: 'light', needs: { face: false, hands: true }, create: createRain,
    note: 'Rain on the window. Every drop is a small lens.',
    hints: { point: 'One finger wipes', hover: 'Two fingers lift the pen', palm: 'Open palm clears' },
  },
  {
    id: 'bubbles', touch: 'pop', name: 'Bubbles', ui: 'light', needs: { face: true, hands: true }, create: createBubbles,
    note: 'Soap film, thinner by the second.',
    hints: { breath: 'Open your mouth to blow', point: 'Pop with a finger', palm: 'Push with your palm' },
  },
  {
    id: 'water', touch: 'ripple', name: 'Water', ui: 'light', needs: { face: false, hands: true }, create: createWater,
    note: 'Your reflection on still water.',
    hints: { point: 'Touch the surface', palm: 'Splash with your palm' },
  },
  {
    id: 'plasma', color: true, name: 'Plasma', ui: 'light', needs: { face: false, hands: true }, create: createPlasma,
    note: 'Hold out your palm and lightning gathers in it.',
    hints: { palm: 'Open palm gathers plasma', two: 'Two hands, a bigger orb', fist: 'Make a fist to release' },
    touchHint: 'Press and hold to charge   ·   Let go to release',
  },
  {
    id: 'ember', name: 'Ember', ui: 'light', needs: { face: false, hands: true }, create: createEmber,
    note: 'A small fire in your hand. Throw it, or let it go out.',
    hints: { palm: 'Open your palm to light a flame', hold: 'It stays in your hand', flick: 'Flick fast to throw', fist: 'Make a fist to put it out' },
    touchHint: 'Press and hold for a flame   ·   Fling to throw',
  },
];
