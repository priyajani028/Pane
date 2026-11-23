# Pane — breathe, touch, wipe

Seven surfaces drawn over your **live camera image**, so they look photo-real. You play with them using your breath and your hands.
Everything runs in the browser (MediaPipe, on your device). There's no microphone and nothing is uploaded.

| | Open mouth | One finger | Open palm |
|---|---|---|---|
| **01 Fog**: steamed-up mirror | fogs the glass | writes (beads + drips) | wipes |

Writing words: ☝️ one finger = pen down · ✌️ two fingers = pen up (move, a ring shows where you are) · ✊ fist = rest · 🖐 open palm held briefly = wipe.
| **02 Frost**: frozen window | melts | scratches | rubs away |
| **03 Rain**: rain on the window | — | wipes | clears |
| **04 Bubbles**: soap film | blows bubbles | pops | pushes |
| **05 Water**: reflection on water | — | ripples | splashes |
| **06 Plasma**: a ball of lightning | — | — | open palm charges it (two hands = bigger) · fist releases it in a burst · **Colour** picker top-right |
| **07 Ember**: fire in your hand | — | — | open palm lights it, then it stays in your hand in any pose · flick fast to throw · fist puts it out |

Keys: `← →` change scene · `[ ]` line width · `R` reset · `I` info. The **Line** control (top right) sets how thick your finger draws in Fog, Frost and Rain. No camera? Drag to draw, use two fingers to wipe, and hold the **Hold to breathe** button.

## Run
```bash
npm install
npm run dev
```

## Deploy (free)
Push to GitHub and import it on Vercel or Netlify (build `npm run build`, output `dist`). The camera needs HTTPS, which both provide.

## How it looks real
`src/gl/camera.js` grades the webcam image and builds a medium blur and a heavy gaussian blur on the GPU. Each scene in `src/scenes/` is one shader that
mixes the sharp and blurred camera image through a mask painted by your breath and hands, plus scene physics: drips, ripple simulation, thin-film bubbles and lens-like raindrops.

Debug: `?src=/photo.jpg` uses a still image in place of the camera, which is handy for screenshots.
