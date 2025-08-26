(function () {
    class SoftBodyWorld {
        constructor(grid) {
            this.grid = grid;
            this.cellSize = grid?.cellSize || 50;
            this.nodes = new Map(); // key -> { x,y, off:{x,y}, vel:{x,y}, mass }
            this.bodies = new Map(); // id -> { keys:Set<string>, props: { ... } }
            this.keyToBody = new Map(); // key -> id
            this.nextId = 1;
            this.running = false;

            // spring params (tuned for pixel space scaled by cellSize)
            this.defaults = { kNeighbor: 25, kAnchor: 10, damping: 4, maxOffset: 0.6, mass: 1 };
            this.kNeighbor = 25;   // stiffness between neighbors (offset equalization)
            this.kAnchor = 10;     // pull back to base (zero offset)
            this.damping = 4;      // velocity damping
            this.maxOffset = 0.6;  // in cellSize units, clamp wobble amplitude
            this.lastTime = 0;

            this._step = this._step.bind(this);
        }

        setGrid(grid) {
            this.grid = grid;
        }

        setCellSize(size) {
            const old = this.cellSize || size;
            this.cellSize = size;
            const scale = size / old;
            // scale existing offsets/velocities to feel consistent under zoom
            this.nodes.forEach(n => {
                n.off.x *= scale;
                n.off.y *= scale;
                n.vel.x *= scale;
                n.vel.y *= scale;
            });
        }

        // grouping APIs
        groupKeys(keys) {
            const ks = Array.from(new Set(keys));
            if (!ks.length) return null;
            // detach from any existing bodies (keep nodes/offsets)
            ks.forEach(k => this._detachKey(k, { keepNode: true }));
            // create new body and assign keys
            const id = this.nextId++;
            const set = new Set();
            this.bodies.set(id, { keys: set, props: { ...this.defaults } });
            ks.forEach(k => {
                this.keyToBody.set(k, id);
                set.add(k);
                if (!this.nodes.has(k)) {
                    const [x, y] = k.split(',').map(Number);
                    this.nodes.set(k, {
                        x, y,
                        off: { x: 0, y: 0 },
                        vel: { x: 0, y: 0 },
                        mass: this.defaults.mass
                    });
                }
            });
            this._ensureRunning();
            return id;
        }

        removeKeys(keys) {
            keys.forEach(k => this._detachKey(k, { keepNode: false }));
            this._pruneEmptyBodies();
        }

        getBodyKeysForKey(key) {
            const id = this.keyToBody.get(key);
            if (!id) return null;
            const body = this.bodies.get(id);
            return body ? Array.from(body.keys) : null;
        }

        hasBodyForKey(key) {
            return this.keyToBody.has(key);
        }

        getOffset(key) {
            const n = this.nodes.get(key);
            return n ? { x: n.off.x, y: n.off.y } : null;
        }

        // new: set per-body properties
        setBodyProps(bodyId, props = {}) {
            const body = this.bodies.get(bodyId);
            if (!body) return;
            const p = body.props;
            if (typeof props.kNeighbor === 'number') p.kNeighbor = props.kNeighbor;
            if (typeof props.kAnchor === 'number') p.kAnchor = props.kAnchor;
            if (typeof props.damping === 'number') p.damping = props.damping;
            if (typeof props.maxOffset === 'number') p.maxOffset = props.maxOffset;
            if (typeof props.mass === 'number') {
                p.mass = props.mass;
                // apply mass to member nodes
                body.keys.forEach(k => {
                    const n = this.nodes.get(k);
                    if (n) n.mass = props.mass;
                });
            }
            this._ensureRunning();
        }

        // new: read props for a body or for any key
        getBodyProps(bodyId) {
            const body = this.bodies.get(bodyId);
            return body ? { ...body.props } : null;
        }

        getBodyPropsForKey(key) {
            const id = this.keyToBody.get(key);
            return id ? this.getBodyProps(id) : null;
        }

        impulseAtKeys(keys, cx, cy, strength = 0.8) {
            const cs = this.cellSize;
            const radius = cs * 2.5;
            keys.forEach(k => {
                const node = this.nodes.get(k);
                if (!node) return;
                const base = this._baseCenter(node.x, node.y);
                const dx = base.x - cx;
                const dy = base.y - cy;
                const dist = Math.hypot(dx, dy) || 1;
                if (dist > radius) return;
                const falloff = 1 - (dist / radius);
                const s = strength * falloff * cs; // impulse in px/s
                // push away from click
                node.vel.x += (dx / dist) * s;
                node.vel.y += (dy / dist) * s;
            });
            this._ensureRunning();
        }

        // internal helpers
        _detachKey(key, { keepNode }) {
            const id = this.keyToBody.get(key);
            if (id) {
                const body = this.bodies.get(id);
                if (body) body.keys.delete(key);
                this.keyToBody.delete(key);
            }
            if (!keepNode) {
                const n = this.nodes.get(key);
                if (n) this.nodes.delete(key);
                // clear any transform if element exists
                const [x, y] = key.split(',').map(Number);
                const el = document.querySelector(`.grid-cell[data-x="${x}"][data-y="${y}"]`);
                if (el) el.style.transform = '';
            }
        }

        _pruneEmptyBodies() {
            Array.from(this.bodies.entries()).forEach(([id, body]) => {
                if (!body.keys || body.keys.size === 0) this.bodies.delete(id);
            });
        }

        _ensureRunning() {
            if (!this.running) {
                this.running = true;
                this.lastTime = performance.now();
                requestAnimationFrame(this._step);
            }
        }

        _neighbors4(x, y) {
            return [
                [x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]
            ].map(([nx, ny]) => `${nx},${ny}`);
        }

        _baseCenter(x, y) {
            const g = this.grid;
            const cs = this.cellSize;
            return {
                x: x * cs - (g?.offsetX || 0) + cs / 2,
                y: y * cs - (g?.offsetY || 0) + cs / 2
            };
        }

        _step(now) {
            if (!this.running) return;
            const dtMs = Math.min(32, now - this.lastTime);
            this.lastTime = now;
            const dt = dtMs / 1000;

            // integrate springs in offset space
            const cs = this.cellSize;

            this.nodes.forEach((node, key) => {
                let fx = 0, fy = 0;

                const bodyId = this.keyToBody.get(key);
                const body = bodyId ? this.bodies.get(bodyId) : null;
                const props = body?.props || this.defaults;

                // neighbor springs (use per-body stiffness)
                if (body) {
                    this._neighbors4(node.x, node.y).forEach(nk => {
                        if (!body.keys.has(nk)) return;
                        const nn = this.nodes.get(nk);
                        if (!nn) return;
                        fx += -props.kNeighbor * (node.off.x - nn.off.x);
                        fy += -props.kNeighbor * (node.off.y - nn.off.y);
                    });
                }

                // anchor spring
                fx += -props.kAnchor * node.off.x;
                fy += -props.kAnchor * node.off.y;

                // damping
                fx += -props.damping * node.vel.x;
                fy += -props.damping * node.vel.y;

                // integrate with node.mass
                node.vel.x += (fx / node.mass) * dt;
                node.vel.y += (fy / node.mass) * dt;
                node.off.x += node.vel.x * dt;
                node.off.y += node.vel.y * dt;

                // clamp per-body max offset
                const maxOff = (props.maxOffset ?? this.defaults.maxOffset) * cs;
                const mag = Math.hypot(node.off.x, node.off.y);
                if (mag > maxOff) {
                    const s = maxOff / (mag || 1);
                    node.off.x *= s;
                    node.off.y *= s;
                }
            });

            // apply to DOM
            this.nodes.forEach((node) => {
                const el = document.querySelector(`.grid-cell[data-x="${node.x}"][data-y="${node.y}"]`);
                if (!el) return;
                el.style.transform = `translate(${node.off.x.toFixed(2)}px, ${node.off.y.toFixed(2)}px)`;
            });

            // keep running while bodies exist
            if (this.bodies.size > 0) {
                requestAnimationFrame(this._step);
            } else {
                this.running = false;
            }
        }
    }

    // singleton world
    window.SoftWorld = new SoftBodyWorld(window.appGrid || null);
})();
