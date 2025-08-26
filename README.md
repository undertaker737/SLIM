# Slime Simulator

Lightweight pixel grid sandbox with pan/zoom, drawing tools, selection, and jiggly soft-body physics.

## Quickstart
- Open index.html in a modern browser.
- No build required. Any static server also works.

## Controls
- Move: W/A/S/D or Arrow keys
- Zoom: Q (out), E (in)
- Deselect all: Ctrl/Cmd + D
- Undo / Redo: Ctrl/Cmd + Z, Ctrl/Cmd + Y or Shift + Ctrl/Cmd + Z

## Tools
- Shift + F: Paint tool
  - Subtools: Shift + P (Brush), Shift + E (Eraser), Shift + R (Polygon pen), Shift + C (Bucket fill)
- Shift + B: Lasso select
- Shift + X: Delete tool
- Shift + S: Save selection (JSON)
- Shift + G: Group selection (make one object)
- Shift + H: Hammer (apply impulse to grouped object)

## Physics
- Select pixels, then Shift + G to group into one solid soft-body object.
- Use Hammer (Shift + H) and click to jiggle the object as a whole.
- Offsets persist while panning/zooming; zoom scales the wobble.

## Features
- Infinite grid with persistent cell state
- Dark theme UI and toolbar
- Brush, eraser, ink pen, polygon pen, bucket fill
- Lasso selection and delete
- Grouping into a single physics object and hammer impulses
- Undo/redo and save selection

## Structure
```
src/
  app.js        // bootstrap, pan/zoom wiring
  grid.js       // infinite grid model
  renderer.js   // cell rendering
  input.js      // keyboard input
  tools.js      // tools, selection, shortcuts
  physics.js    // soft-body (solid and jelly) dynamics
  styles/dark.css
index.html
```

## License
MIT
