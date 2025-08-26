(function () {
    const state = {
        tool: null, // 'brush' | 'delete' | 'lasso' | 'hammer' | 'group'
        painting: false,
        paintAdd: true,
        lasso: {
            active: false,
            startX: 0,
            startY: 0,
            box: null
        },
        // new: brush subtool state
        brush: {
            mode: 'brush', // 'brush' | 'eraser' | 'pen' | 'poly' | 'bucket'
            color: '#4caf50'
        },
        // new: polygon drawing state
        poly: {
            active: false,
            points: [],     // array of [x, y]
            cursor: null,   // [x, y] for live preview
            svg: null,
            polyline: null
        }
    };

    // history stacks
    const undoStack = [];
    const redoStack = [];
    const MAX_HISTORY = 100;

    // current action accumulator
    let currentAction = null;

    // take a snapshot of a cell's relevant state
    function snapshot(el) {
        return {
            active: el.classList.contains('active'),
            bg: el.style.backgroundColor || '',
            bc: el.style.borderColor || '',
            bw: el.style.borderWidth || ''
        };
    }

    // patch model for a given cell element
    function updateModel(el, fields) {
        const g = window.appGrid;
        if (!g || !el) return;
        const x = Number(el.dataset.x), y = Number(el.dataset.y);
        const c = g.getCell(x, y);
        Object.assign(c, fields);
    }

    // apply a snapshot back to a cell (DOM + model)
    function applySnapshot(el, snap) {
        el.classList.toggle('active', !!snap.active);
        el.style.backgroundColor = snap.bg || '';
        el.style.borderColor = snap.bc || '';
        el.style.borderWidth = snap.bw || '';

        updateModel(el, {
            active: !!snap.active,
            bg: snap.bg || '',
            bc: snap.bc || '',
            bw: snap.bw || '',
            colored: !!(snap.bg && snap.bg !== '')
        });
        // sync 'colored' class with model
        el.classList.toggle('colored', !!(snap.bg && snap.bg !== ''));
    }

    function startAction(kind) {
        currentAction = { kind, before: new Map(), after: null };
        // starting a new action clears redo stack
        redoStack.length = 0;
    }

    function recordBefore(el) {
        if (!currentAction) return;
        const key = cellKey(el);
        if (!currentAction.before.has(key)) {
            currentAction.before.set(key, snapshot(el));
        }
    }

    function finalizeAction() {
        if (!currentAction) return;
        // collect "after" snapshots
        const container = getContainer();
        const after = new Map();
        currentAction.before.forEach((_, key) => {
            const el = container.querySelector(`.grid-cell[data-x="${key.split(',')[0]}"][data-y="${key.split(',')[1]}"]`);
            if (el) after.set(key, snapshot(el));
        });
        currentAction.after = after;
        undoStack.push(currentAction);
        if (undoStack.length > MAX_HISTORY) undoStack.shift();
        currentAction = null;
    }

    function undo() {
        const action = undoStack.pop();
        if (!action) return;
        const container = getContainer();
        action.before.forEach((snap, key) => {
            const [x, y] = key.split(',');
            const el = container.querySelector(`.grid-cell[data-x="${x}"][data-y="${y}"]`);
            if (el) applySnapshot(el, snap);
        });
        redoStack.push(action);
        if (redoStack.length > MAX_HISTORY) redoStack.shift();
    }

    function redo() {
        const action = redoStack.pop();
        if (!action) return;
        const container = getContainer();
        action.after.forEach((snap, key) => {
            const [x, y] = key.split(',');
            const el = container.querySelector(`.grid-cell[data-x="${x}"][data-y="${y}"]`);
            if (el) applySnapshot(el, snap);
        });
        undoStack.push(action);
        if (undoStack.length > MAX_HISTORY) undoStack.shift();
    }

    function getContainer() {
        return document.getElementById('grid-container');
    }

    function mapLabelToTool(label) {
        const key = (label || '').toLowerCase();
        if (key.includes('paint')) return 'brush';
        if (key.includes('lasso')) return 'lasso';
        if (key.includes('save')) return 'save';
        if (key.includes('delete') || key === 'x') return 'delete';
        if (key.includes('hammer')) return 'hammer';
        if (key.includes('group')) return 'group'; // new action
        return null;
    }

    function setActiveButton(btn) {
        document.querySelectorAll('.tool-btn').forEach(b => {
            b.classList.remove('active');
            b.setAttribute('aria-pressed', 'false');
            b.style.outline = '';
        });
        if (btn) {
            btn.classList.add('active');
            btn.setAttribute('aria-pressed', 'true');
            btn.style.outline = '2px solid #555';
        }
    }

    function setTool(tool, btn) {
        if (tool === 'save') {
            saveSelection();
            return;
        }
        if (tool === 'group') {
            groupSelectionToBody();
            return;
        }
        state.tool = tool;
        setActiveButton(btn || null);
        // show/hide paint panel based on tool
        showPaintPanel(tool === 'brush');
        if (tool !== 'brush' || state.brush.mode !== 'poly') cancelPoly(); // cleanup if leaving poly
        // show slime panel when hammer is chosen
        if (tool === 'hammer') {
            openSlimePanel();
        } else {
            hideSlimePanel();
        }
    }

    function handleToolbarClick(e) {
        const btn = e.target.closest('.tool-btn');
        if (!btn) return;
        const tool = mapLabelToTool(btn.getAttribute('aria-label') || btn.title);
        if (!tool) return;
        if (tool === 'delete' && state.tool === 'delete') {
            // quick action: clear all active cells on second click
            clearAllActive();
        }
        setTool(tool, btn);
    }

    function clearAllActive() {
        const container = getContainer();
        const cells = container.querySelectorAll('.grid-cell.active');
        if (!cells.length) return;
        const keys = Array.from(cells).map(c => `${c.dataset.x},${c.dataset.y}`);
        // remove from physics
        if (window.SoftWorld) window.SoftWorld.removeKeys(keys);

        startAction('clear');
        cells.forEach(c => {
            recordBefore(c);
            c.classList.remove('active', 'colored');
            c.style.backgroundColor = '';
            c.style.borderColor = '';
            c.style.borderWidth = '';
            updateModel(c, { active: false, colored: false, bg: '', bc: '', bw: '' });
        });
        finalizeAction();
    }

    function saveSelection() {
        const cells = Array.from(getContainer().querySelectorAll('.grid-cell.active'))
            .map(el => ({ x: Number(el.dataset.x), y: Number(el.dataset.y) }));
        const payload = { selected: cells, timestamp: Date.now() };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'grid-selection.json';
        document.body.appendChild(a);
        a.click();
        URL.revokeObjectURL(a.href);
        a.remove();
    }

    // Brush interactions
    function onContainerMouseDown(e) {
        if (e.button !== 0) return;
        const container = getContainer();
        if (!container.contains(e.target)) return;

        if (state.tool === 'brush') {
            if (state.brush.mode === 'poly') {
                handlePolyClick(e);
                e.preventDefault();
                return;
            }
            const cell = e.target.closest('.grid-cell');
            if (!cell) return;

            if (state.brush.mode === 'bucket') {
                startAction('bucket');
                e.preventDefault();
                bucketFill(cell);
                finalizeAction();
                return;
            }

            startAction('brush');
            // record the first cell before painting
            recordBefore(cell);
            state.painting = true;
            applyBrush(cell);
            e.preventDefault();
        } else if (state.tool === 'lasso') {
            // lasso itself starts and finalizes on finishLasso
            startLasso(e);
            e.preventDefault();
        } else if (state.tool === 'delete') {
            const cell = e.target.closest('.grid-cell');
            if (cell) {
                // detach from physics if present
                if (window.SoftWorld) window.SoftWorld.removeKeys([`${cell.dataset.x},${cell.dataset.y}`]);

                startAction('delete');
                recordBefore(cell);
                cell.classList.remove('active', 'colored');
                cell.style.backgroundColor = '';
                cell.style.borderColor = '';
                cell.style.borderWidth = '';
                updateModel(cell, { active: false, colored: false, bg: '', bc: '', bw: '' });
                finalizeAction();
                e.preventDefault();
            }
        } else if (state.tool === 'hammer') {
            // optional: clicking grid while Hammer is active jiggles current body/selection
            const cell = e.target.closest('.grid-cell');
            if (!cell) return;
            e.preventDefault();
            const key = `${cell.dataset.x},${cell.dataset.y}`;
            const world = window.SoftWorld;
            if (!world) return;
            const bodyKeys = world.getBodyKeysForKey(key);
            const keys = (bodyKeys && bodyKeys.length) ? bodyKeys : getSelectionKeys();
            if (!keys.length) return;
            // center impulse around click
            world.impulseAtKeys(keys, e.clientX, e.clientY, 1.0);
        }
    }

    function onContainerMouseMove(e) {
        if (state.tool === 'brush' && state.brush.mode === 'poly' && state.poly.active) {
            state.poly.cursor = [e.clientX, e.clientY];
            renderPolyPreview();
        } else if (state.tool === 'brush' && state.painting) {
            const cell = document.elementFromPoint(e.clientX, e.clientY)?.closest('.grid-cell');
            if (cell) {
                recordBefore(cell);
                applyBrush(cell);
            }
        } else if (state.tool === 'lasso' && state.lasso.active) {
            updateLasso(e);
        }
    }

    function onContainerMouseUp() {
        if (state.tool === 'brush') {
            if (state.brush.mode === 'poly') {
                return; // nothing on mouseup for polygon
            }
            state.painting = false;
            finalizeAction();
        } else if (state.tool === 'lasso' && state.lasso.active) {
            finishLasso();
        }
    }

    function applyBrush(cell) {
        switch (state.brush.mode) {
            case 'eraser':
                cell.classList.remove('active', 'colored');
                cell.style.backgroundColor = '';
                cell.style.borderColor = '';
                cell.style.borderWidth = '';
                updateModel(cell, { active: false, colored: false, bg: '', bc: '', bw: '' });
                break;
            case 'pen':
                cell.classList.add('active');
                cell.classList.remove('colored');
                cell.style.borderColor = state.brush.color;
                cell.style.borderWidth = '2px';
                updateModel(cell, { active: true, colored: false, bc: state.brush.color, bw: '2px' });
                break;
            default: // 'brush'
                cell.classList.add('active', 'colored');
                cell.style.backgroundColor = state.brush.color;
                // keep default border for brush fill
                updateModel(cell, { active: true, colored: true, bg: state.brush.color });
                break;
        }
    }

    // helper: normalize a cell's "fill" color using inline style only (ignores hover)
    function bgKey(el) {
        return el.style.backgroundColor || '__DEFAULT__';
    }

    // Bucket fill (visible cells, 4-way adjacency, match by inline background)
    function bucketFill(startEl) {
        const container = getContainer();
        if (!container || !startEl) return;

        const targetKey = bgKey(startEl);
        const fillColor = state.brush.color;

        const map = getVisibleCellMap();
        const startKey = cellKey(startEl);
        if (!map.has(startKey)) return;

        // If target already equals fill color, no-op
        const temp = document.createElement('div');
        temp.style.backgroundColor = fillColor;
        const fillKey = temp.style.backgroundColor || fillColor;

        if (targetKey === fillKey) return;

        const visited = new Set();
        const queue = [startKey];

        while (queue.length) {
            const key = queue.shift();
            if (visited.has(key)) continue;
            visited.add(key);

            const el = map.get(key);
            if (!el) continue;

            if (bgKey(el) !== targetKey) continue;

            // record before once per cell
            recordBefore(el);

            // paint like brush
            el.classList.add('active', 'colored');
            el.style.backgroundColor = fillColor;
            el.style.borderColor = ''; // keep default border for fill
            el.style.borderWidth = '';
            updateModel(el, { active: true, colored: true, bg: fillColor, bc: '', bw: '' });

            // enqueue neighbors
            const [x, y] = key.split(',').map(Number);
            const neighbors = [
                `${x + 1},${y}`,
                `${x - 1},${y}`,
                `${x},${y + 1}`,
                `${x},${y - 1}`,
            ];
            neighbors.forEach(nk => {
                if (map.has(nk) && !visited.has(nk)) queue.push(nk);
            });
        }
    }

    function getVisibleCellMap() {
        const container = getContainer();
        const map = new Map();
        container.querySelectorAll('.grid-cell').forEach(el => {
            map.set(cellKey(el), el);
        });
        return map;
    }

    function cellKey(el) {
        return `${el.dataset.x},${el.dataset.y}`;
    }

    // gather connected active cluster (4-way) starting at element
    function getActiveClusterKeys(startEl) {
        const container = getContainer();
        if (!container || !startEl) return [];
        const start = cellKey(startEl);
        const map = getVisibleCellMap();
        if (!map.has(start)) return [];
        const q = [start];
        const seen = new Set();
        const keys = [];
        while (q.length) {
            const key = q.shift();
            if (seen.has(key)) continue;
            seen.add(key);
            const el = map.get(key);
            if (!el || !el.classList.contains('active')) continue;
            keys.push(key);
            const [x, y] = key.split(',').map(Number);
            [`${x+1},${y}`, `${x-1},${y}`, `${x},${y+1}`, `${x},${y-1}`].forEach(nk => {
                if (map.has(nk) && !seen.has(nk)) q.push(nk);
            });
        }
        return keys;
    }

    // Polygon ("old timey pen") support
    function ensurePolyOverlay() {
        if (state.poly.svg) return;
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.style.position = 'fixed';
        svg.style.left = '0';
        svg.style.top = '0';
        svg.style.width = '100vw';
        svg.style.height = '100vh';
        svg.style.pointerEvents = 'none';
        svg.style.zIndex = '1002';

        const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        polyline.setAttribute('fill', 'rgba(255,255,255,0.04)');
        polyline.setAttribute('stroke', state.brush.color);
        polyline.setAttribute('stroke-width', '2');
        polyline.setAttribute('stroke-linejoin', 'round');
        polyline.setAttribute('stroke-linecap', 'round');

        svg.appendChild(polyline);
        document.body.appendChild(svg);

        state.poly.svg = svg;
        state.poly.polyline = polyline;
    }

    function updatePolyStrokeColor() {
        if (state.poly.polyline) {
            state.poly.polyline.setAttribute('stroke', state.brush.color);
        }
    }

    function handlePolyClick(e) {
        const pt = [e.clientX, e.clientY];
        if (!state.poly.active) {
            startPoly(pt);
            return;
        }
        // if near first point and we have enough vertices, finish
        if (state.poly.points.length >= 3 && isNear(pt, state.poly.points[0], 10)) {
            finishPoly();
            return;
        }
        state.poly.points.push(pt);
        renderPolyPreview();
    }

    function startPoly(firstPoint) {
        state.poly.active = true;
        state.poly.points = [firstPoint];
        state.poly.cursor = firstPoint.slice();
        ensurePolyOverlay();
        updatePolyStrokeColor();
        renderPolyPreview();
    }

    function renderPolyPreview() {
        if (!state.poly.polyline) return;
        const pts = [...state.poly.points];
        if (state.poly.cursor) pts.push(state.poly.cursor);
        const str = pts.map(p => p.join(',')).join(' ');
        state.poly.polyline.setAttribute('points', str);
    }

    function finishPoly() {
        if (!state.poly.active || state.poly.points.length < 3) {
            cancelPoly();
            return;
        }
        const polygon = [...state.poly.points]; // final polygon vertices
        applyPolygonToCells(polygon);
        cancelPoly();
    }

    function cancelPoly() {
        state.poly.active = false;
        state.poly.points = [];
        state.poly.cursor = null;
        if (state.poly.svg) {
            state.poly.svg.remove();
            state.poly.svg = null;
            state.poly.polyline = null;
        }
    }

    function isNear(a, b, threshold) {
        const dx = a[0] - b[0], dy = a[1] - b[1];
        return (dx*dx + dy*dy) <= threshold*threshold;
    }

    function pointInPolygon(point, polygon) {
        // ray-casting algorithm
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i][0], yi = polygon[i][1];
            const xj = polygon[j][0], yj = polygon[j][1];
            const intersect = ((yi > point[1]) !== (yj > point[1])) &&
                (point[0] < (xj - xi) * (point[1] - yi) / (yj - yi + 0.000001) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    function applyPolygonToCells(polygon) {
        const container = getContainer();
        if (!container) return;
        // wrap polygon application in a single action
        startAction('poly');
        const cells = container.querySelectorAll('.grid-cell');
        cells.forEach(cell => {
            const r = cell.getBoundingClientRect();
            const center = [r.left + r.width / 2, r.top + r.height / 2];
            if (pointInPolygon(center, polygon)) {
                recordBefore(cell);
                cell.classList.add('active');
                cell.classList.remove('colored');
                cell.style.borderColor = state.brush.color;
                cell.style.borderWidth = '2px';
                updateModel(cell, { active: true, colored: false, bc: state.brush.color, bw: '2px' });
            }
        });
        finalizeAction();
    }

    // Lasso helpers
    function startLasso(e) {
        const container = getContainer();
        const rect = container.getBoundingClientRect();
        state.lasso.active = true;
        state.lasso.startX = e.clientX;
        state.lasso.startY = e.clientY;

        const box = document.createElement('div');
        box.style.position = 'fixed';
        box.style.left = `${e.clientX}px`;
        box.style.top = `${e.clientY}px`;
        box.style.width = '0px';
        box.style.height = '0px';
        box.style.border = '1px dashed #aaa';
        box.style.background = 'rgba(255,255,255,0.06)';
        box.style.pointerEvents = 'none';
        box.style.zIndex = '1001';
        document.body.appendChild(box);
        state.lasso.box = box;

        // prevent text selection while lassoing
        document.body.style.userSelect = 'none';
    }

    function updateLasso(e) {
        const x1 = state.lasso.startX;
        const y1 = state.lasso.startY;
        const x2 = e.clientX;
        const y2 = e.clientY;
        const left = Math.min(x1, x2);
        const top = Math.min(y1, y2);
        const width = Math.abs(x2 - x1);
        const height = Math.abs(y2 - y1);
        const box = state.lasso.box;
        if (!box) return;
        box.style.left = `${left}px`;
        box.style.top = `${top}px`;
        box.style.width = `${width}px`;
        box.style.height = `${height}px`;
    }

    function finishLasso() {
        const box = state.lasso.box;
        if (!box) return;
        const boxRect = box.getBoundingClientRect();

        // wrap lasso selection in a single action
        startAction('lasso');
        const cells = getContainer().querySelectorAll('.grid-cell');
        cells.forEach(cell => {
            const r = cell.getBoundingClientRect();
            const intersects =
                r.right >= boxRect.left &&
                r.left <= boxRect.right &&
                r.bottom >= boxRect.top &&
                r.top <= boxRect.bottom;
            if (intersects) {
                recordBefore(cell);
                cell.classList.add('active');
                updateModel(cell, { active: true });
            }
        });
        finalizeAction();

        box.remove();
        state.lasso.box = null;
        state.lasso.active = false;
        document.body.style.userSelect = '';
    }

    // Paint panel UI
    let paintPanel = null;

    function createPaintPanel() {
        if (paintPanel) return paintPanel;
        paintPanel = document.createElement('div');
        paintPanel.className = 'paint-panel';
        paintPanel.innerHTML = `
            <div class="panel-row">
                <label class="color-label" for="paint-color">Color</label>
                <input id="paint-color" class="color-input" type="color" value="${state.brush.color}" aria-label="Paint color"/>
            </div>
            <div class="panel-row subtools">
                <button class="subtool-btn" data-mode="eraser" title="Eraser" aria-label="Eraser">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M16 3l5 5-9 9H7L2 12l9-9h5zM7 17h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
                    </svg>
                </button>
                <button class="subtool-btn" data-mode="brush" title="Brush" aria-label="Brush">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M3 17c0 2.5 2 4 4 4 2.2 0 3-1.3 3.5-2.5.3-.7.3-1.5.8-2 .5-.5 1.3-.5 2-.8C14.7 15 16 14.2 16 12c0-2-1.5-4-4-4-2.2 0-3 1.3-3.5 2.5-.3.7-.3 1.5-.8 2-.5.5-1.3.5-2 .8C4.3 13.3 3 14 3 16v1zM14 4l6 6 1.5-1.5c.7-.7.7-1.8 0-2.5L18 1.5c-.7-.7-1.8-.7-2.5 0L14 3v1z" fill="currentColor"/>
                    </svg>
                </button>
                <button class="subtool-btn" data-mode="pen" title="Ink pen" aria-label="Ink pen">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M3 21l6-2 9-9-4-4-9 9-2 6zM14 6l4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
                    </svg>
                </button>
                <button class="subtool-btn" data-mode="poly" title="Polygon pen" aria-label="Polygon pen">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M12 3l6 4v6l-6 4-6-4V7l6-4z" fill="none" stroke="currentColor" stroke-width="2"/>
                        <circle cx="12" cy="3" r="1.5" fill="currentColor"/>
                        <circle cx="18" cy="7" r="1.5" fill="currentColor"/>
                        <circle cx="18" cy="13" r="1.5" fill="currentColor"/>
                        <circle cx="12" cy="17" r="1.5" fill="currentColor"/>
                        <circle cx="6" cy="13" r="1.5" fill="currentColor"/>
                        <circle cx="6" cy="7" r="1.5" fill="currentColor"/>
                    </svg>
                </button>
                <button class="subtool-btn" data-mode="bucket" title="Bucket fill" aria-label="Bucket fill">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M4 10l6-6 8 8-6 6-8-8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
                        <path d="M18 15c1.5 0 3 1.2 3 2.7S19.5 21 18 21s-3-1.2-3-2.3S16.5 15 18 15z" fill="currentColor"/>
                    </svg>
                </button>
            </div>
        `;
        document.body.appendChild(paintPanel);

        // events
        const colorInput = paintPanel.querySelector('#paint-color');
        colorInput.addEventListener('input', (e) => {
            state.brush.color = e.target.value;
            updatePolyStrokeColor();
        });

        paintPanel.addEventListener('click', (e) => {
            const btn = e.target.closest('.subtool-btn');
            if (!btn) return;
            const mode = btn.dataset.mode;
            state.brush.mode = mode;
            updateSubtoolActive();
        });

        updateSubtoolActive();
        positionPaintPanel();
        return paintPanel;
    }

    function updateSubtoolActive() {
        if (!paintPanel) return;
        paintPanel.querySelectorAll('.subtool-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.mode === state.brush.mode);
            b.setAttribute('aria-pressed', b.dataset.mode === state.brush.mode ? 'true' : 'false');
        });
    }

    function positionPaintPanel() {
        if (!paintPanel) return;
        const toolbar = document.getElementById('toolbar');
        if (!toolbar) return;
        const rect = toolbar.getBoundingClientRect();
        paintPanel.style.position = 'fixed';
        paintPanel.style.right = `${Math.max(10, window.innerWidth - rect.right + 10)}px`;
        paintPanel.style.top = `${rect.bottom + 8}px`;
    }

    function showPaintPanel(show) {
        if (!paintPanel) createPaintPanel();
        paintPanel.style.display = show ? 'block' : 'none';
        if (show) {
            positionPaintPanel();
            updateSubtoolActive();
        }
    }

    // helper: find a toolbar button by aria-label/title substring
    function findToolbarButton(substr) {
        const toolbar = document.getElementById('toolbar');
        if (!toolbar) return null;
        const s = (substr || '').toLowerCase();
        return Array.from(toolbar.querySelectorAll('.tool-btn')).find(b => {
            const label = (b.getAttribute('aria-label') || b.title || '').toLowerCase();
            return label.includes(s);
        }) || null;
    }

    // helper: switch to brush tool and set a specific subtool mode
    function chooseBrushMode(mode) {
        const brushBtn = findToolbarButton('paint');
        setTool('brush', brushBtn || null);
        if (state.brush.mode === 'poly' && mode !== 'poly') {
            cancelPoly();
        }
        state.brush.mode = mode;
        showPaintPanel(true);
        updateSubtoolActive();
    }

    // convert all active cells into one physics body
    function groupSelectionToBody() {
        const container = getContainer();
        if (!container || !window.SoftWorld) return;
        const keys = Array.from(container.querySelectorAll('.grid-cell.active'))
            .map(el => `${el.dataset.x},${el.dataset.y}`);
        if (!keys.length) return;
        window.SoftWorld.groupKeys(keys);
    }

    // selection helpers
    function getSelectionKeys() {
        const container = getContainer();
        if (!container) return [];
        return Array.from(container.querySelectorAll('.grid-cell.active'))
            .map(el => `${el.dataset.x},${el.dataset.y}`);
    }

    // Slime properties panel
    let slimePanel = null;

    function openSlimePanel() {
        if (!slimePanel) slimePanel = createSlimePanel();
        // preload values from existing body if possible
        const keys = getSelectionKeys();
        const world = window.SoftWorld;
        let props = null;
        if (world && keys.length) {
            // try to read props from any selected key
            props = world.getBodyPropsForKey(keys[0]);
        }
        const d = getSlimePanelDom();
        const defaults = { kNeighbor: 25, kAnchor: 10, damping: 4, maxOffset: 0.6, mass: 1 };
        d.kNeighbor.value = (props?.kNeighbor ?? defaults.kNeighbor);
        d.kAnchor.value = (props?.kAnchor ?? defaults.kAnchor);
        d.damping.value = (props?.damping ?? defaults.damping);
        d.maxOffset.value = (props?.maxOffset ?? defaults.maxOffset);
        d.mass.value = (props?.mass ?? defaults.mass);
        d.count.textContent = `${keys.length} selected`;
        slimePanel.style.display = 'block';
    }
    function hideSlimePanel() {
        if (slimePanel) slimePanel.style.display = 'none';
    }

    function getSlimePanelDom() {
        return {
            root: slimePanel,
            count: slimePanel.querySelector('[data-field="count"]'),
            kNeighbor: slimePanel.querySelector('[name="kNeighbor"]'),
            kAnchor: slimePanel.querySelector('[name="kAnchor"]'),
            damping: slimePanel.querySelector('[name="damping"]'),
            maxOffset: slimePanel.querySelector('[name="maxOffset"]'),
            mass: slimePanel.querySelector('[name="mass"]'),
            applyBtn: slimePanel.querySelector('[data-action="apply"]'),
            jiggleBtn: slimePanel.querySelector('[data-action="jiggle"]'),
            closeBtn: slimePanel.querySelector('[data-action="close"]'),
        };
    }

    function createSlimePanel() {
        const panel = document.createElement('div');
        panel.className = 'slime-panel';
        panel.innerHTML = `
            <div class="slime-header">
                <span>Slime properties</span>
                <button class="slime-close" data-action="close" title="Close" aria-label="Close">✕</button>
            </div>
            <div class="slime-row"><span data-field="count">0 selected</span></div>
            <div class="slime-grid
