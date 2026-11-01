/* =========================================================
   STEM Origin — interactions
   Everything here is progressive enhancement: every page
   reads and works without JavaScript.
   ========================================================= */
(() => {
  'use strict';

  const doc = document.documentElement;
  const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  const fineMQ = window.matchMedia('(hover: hover) and (pointer: fine)');
  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const fontsReady = () => Promise.race([
    document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve(),
    new Promise((resolve) => setTimeout(resolve, 1500)),
  ]);

  /* ---------- Text helpers ---------- */
  function splitChars(el) {
    const text = el.textContent.replace(/\s+/g, ' ').trim();
    const sr = document.createElement('span');
    sr.className = 'sr-only';
    sr.textContent = text;
    const vis = document.createElement('span');
    vis.className = 'chars';
    vis.setAttribute('aria-hidden', 'true');
    let i = 0;
    text.split(' ').forEach((word, wi) => {
      if (wi) {
        const sp = document.createElement('span');
        sp.className = 'ch sp';
        sp.textContent = '\u00A0';
        sp.style.setProperty('--i', i++);
        vis.appendChild(sp);
      }
      const w = document.createElement('span');
      w.className = 'w';
      for (const c of word) {
        const s = document.createElement('span');
        s.className = 'ch';
        s.textContent = c;
        s.style.setProperty('--i', i++);
        w.appendChild(s);
      }
      vis.appendChild(w);
    });
    el.textContent = '';
    el.append(sr, vis);
    return [...vis.querySelectorAll('.ch')];
  }

  // Scale an inline-block element so it exactly fills its parent's content width.
  function fit(el, max = 320) {
    const box = el.parentElement;
    const cs = getComputedStyle(box);
    const avail = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    el.style.fontSize = '100px';
    const w = el.getBoundingClientRect().width;
    if (w > 0 && avail > 0) el.style.fontSize = Math.min((100 * avail) / w, max).toFixed(2) + 'px';
  }

  /* ---------- Logo growth ---------- */
  function grow(svg) {
    if (!svg) return;
    svg.classList.remove('is-growing');
    void svg.getBoundingClientRect();
    svg.classList.add('is-growing');
  }

  /* =========================================================
     CircuitRoots — PCB-style traces that grow like roots.
     Traces route on a grid at 45° angles, avoid each other,
     end in vias, carry pulses of "current", lean toward the
     pointer, and a click plants a new sprout.
     ========================================================= */
  const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  const THEMES = {
    light: {
      trace: '15,22,38', traceA: .3, dot: 'rgba(15,22,38,.12)',
      via: '#F4F4F7', viaStroke: 'rgba(15,22,38,.5)', head: '#2B59FF',
      pulse: '43,89,255', ring: '43,89,255', leaf: '#45A74E', leafDeep: '#1E6B34',
    },
    dark: {
      trace: '141,165,255', traceA: .42, dot: 'rgba(244,244,247,.08)',
      via: '#0F1626', viaStroke: 'rgba(160,180,255,.75)', head: '#FFFFFF',
      pulse: '255,255,255', ring: '160,180,255', leaf: '#5CC166', leafDeep: '#2E8B45',
    },
  };

  class CircuitRoots {
    constructor(canvas, opts = {}) {
      this.c = canvas;
      this.ctx = canvas.getContext('2d');
      this.o = Object.assign({
        cell: 24, max: 34, maxGrowing: 10, spawnEvery: 240, branch: .08,
        minLen: 7, maxLen: 30, speed: .12, hold: [5000, 9500], fade: 1800,
        theme: 'light', seeds: () => [], host: canvas.parentElement, interactive: true,
      }, opts);
      this.k = THEMES[this.o.theme] || THEMES.light;
      this.reduce = reduceMQ.matches;
      this.traces = [];
      this.pulses = [];
      this.fx = [];
      this.seeds = [];
      this.uid = 1;
      this.lastSpawn = 0;
      this.lastPulse = 0;
      this.target = null;
      this.active = false;
      this.visible = !('IntersectionObserver' in window);
      this.started = false;
      this.t0 = Infinity;
      this.loop = 0;
      this.w = 0;
      this.h = 0;

      this.resize();
      if ('ResizeObserver' in window) new ResizeObserver(() => this.resize()).observe(canvas);
      else window.addEventListener('resize', () => this.resize());
      if (this.o.interactive) this.bindPointer();
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; this.toggle(); }, { rootMargin: '80px' }).observe(canvas);
      }
      document.addEventListener('visibilitychange', () => this.toggle());
    }

    begin(delay = 0) {
      this.started = true;
      this.t0 = performance.now() + (this.reduce ? 0 : delay);
      if (this.reduce) { this.prefill(); this.draw(); }
      this.toggle();
      return this;
    }

    refresh() {
      try { this.seeds = this.o.seeds(this.c.getBoundingClientRect(), this) || []; }
      catch (e) { this.seeds = []; }
    }

    resize() {
      const r = this.c.getBoundingClientRect();
      const w = Math.round(r.width);
      const h = Math.round(r.height);
      if (!w || !h || (w === this.w && h === this.h)) return;
      const sameW = w === this.w && !!this.occ;
      const cell = this.o.cell;
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.w = w;
      this.h = h;
      this.c.width = Math.round(w * this.dpr);
      this.c.height = Math.round(h * this.dpr);
      if (!sameW) {
        this.cols = Math.floor(w / cell) + 1;
        this.ox = (w - (this.cols - 1) * cell) / 2;
        this.oy = this.ox;
      }
      const rows = Math.max(1, Math.floor((h - this.oy) / cell) + 1);
      if (sameW) {
        const occ = new Uint16Array(this.cols * rows);
        occ.set(this.occ.subarray(0, Math.min(this.occ.length, occ.length)));
        this.occ = occ;
      } else {
        this.occ = new Uint16Array(this.cols * rows);
        this.traces = [];
        this.pulses = [];
        this.fx = [];
      }
      this.rows = rows;
      this.buildGrid();
      this.refresh();
      if (this.reduce && this.started) this.prefill();
      this.draw();
    }

    buildGrid() {
      const g = this.grid || (this.grid = document.createElement('canvas'));
      g.width = this.c.width;
      g.height = this.c.height;
      const x = g.getContext('2d');
      x.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      x.clearRect(0, 0, this.w, this.h);
      x.fillStyle = this.k.dot;
      for (let j = 0; j < this.rows; j++) {
        for (let i = 0; i < this.cols; i++) {
          const [px, py] = this.node(i, j);
          x.fillRect(px - .75, py - .75, 1.5, 1.5);
        }
      }
    }

    node(i, j) { return [this.ox + i * this.o.cell, this.oy + j * this.o.cell]; }
    cellOf(x, y) {
      return [
        clamp(Math.round((x - this.ox) / this.o.cell), 0, this.cols - 1),
        clamp(Math.round((y - this.oy) / this.o.cell), 0, this.rows - 1),
      ];
    }
    inb(i, j) { return i >= 0 && j >= 0 && i < this.cols && j < this.rows; }

    spawn(x, y, dir, extra = {}) {
      const [i, j] = this.cellOf(x, y);
      const idx = j * this.cols + i;
      if (this.occ[idx] && !extra.force) return null;
      this.uid = this.uid >= 65000 ? 1 : this.uid + 1;
      const [nx, ny] = this.node(i, j);
      const exact = Math.abs(nx - x) > .5 || Math.abs(ny - y) > .5;
      const t = {
        id: this.uid, i, j, dir,
        run: extra.run == null ? 2 : extra.run,
        len: 0,
        max: extra.max || Math.round(rand(this.o.minLen, this.o.maxLen)),
        pts: exact ? [[x, y], [nx, ny]] : [[nx, ny]],
        seg: exact ? 0 : 1,
        state: 'grow', t: 0, a: 1, cells: [],
        branch: !!extra.branch,
        hold: rand(this.o.hold[0], this.o.hold[1]),
      };
      if (!this.occ[idx]) { this.occ[idx] = t.id; t.cells.push(idx); }
      this.traces.push(t);
      return t;
    }

    advance(t) {
      if (t.len >= t.max) return this.finish(t);
      const cand = [];
      const consider = (deltas, wStraight, wTurn) => {
        for (const dd of deltas) {
          const d = (t.dir + dd + 8) % 8;
          const [dx, dy] = DIRS[d];
          const ni = t.i + dx;
          const nj = t.j + dy;
          if (!this.inb(ni, nj)) continue;
          const idx = nj * this.cols + ni;
          if (this.occ[idx]) continue;
          if (dx && dy) { // don't cut across another trace's diagonal
            const a = this.occ[t.j * this.cols + ni];
            const b = this.occ[nj * this.cols + t.i];
            if (a && a === b) continue;
          }
          let w = dd === 0 ? wStraight : wTurn;
          if (this.target) {
            const [px, py] = this.node(t.i, t.j);
            const vx = this.target.x - px;
            const vy = this.target.y - py;
            const L = Math.hypot(vx, vy) || 1;
            const dot = (dx * vx + dy * vy) / (L * Math.hypot(dx, dy));
            w *= Math.pow(1.5 + dot, 3);
          }
          cand.push([d, w, ni, nj, idx]);
        }
      };
      consider(t.run < 2 ? [0] : [0, 1, -1], .74, .13);
      if (!cand.length) consider([1, -1, 2, -2], 0, .25);
      if (!cand.length) return this.finish(t);

      let sum = 0;
      for (const c of cand) sum += c[1];
      let r = Math.random() * sum;
      let choice = cand[0];
      for (const c of cand) { r -= c[1]; if (r <= 0) { choice = c; break; } }
      const [d, , ni, nj, idx] = choice;
      t.run = d === t.dir ? t.run + 1 : 1;
      t.dir = d;
      t.i = ni;
      t.j = nj;
      t.len++;
      this.occ[idx] = t.id;
      t.cells.push(idx);
      t.pts.push(this.node(ni, nj));
      t.seg = 0;

      if (t.len > 2 && this.traces.length < this.o.max && Math.random() < this.o.branch * (t.branch ? .4 : 1)) {
        const [bx, by] = this.node(t.i, t.j);
        this.spawn(bx, by, (d + (Math.random() < .5 ? 2 : 6)) % 8, {
          force: true, branch: true, run: 2, max: Math.round(rand(3, 11)),
        });
      }
    }

    finish(t) {
      t.state = this.reduce ? 'static' : 'hold';
      t.t = 0;
      t.seg = 1;
      const d = [0];
      for (let k = 1; k < t.pts.length; k++) {
        d.push(d[k - 1] + Math.hypot(t.pts[k][0] - t.pts[k - 1][0], t.pts[k][1] - t.pts[k - 1][1]));
      }
      t.d = d;
      t.total = d[d.length - 1];
      if (!this.reduce && t.total > 60 && Math.random() < .7) this.pulses.push({ tr: t, s: 0 });
    }

    update(now, dt) {
      if (this.target && now - this.target.time > 2600) this.target = null;

      let growing = 0;
      for (const t of this.traces) if (t.state === 'grow') growing++;
      if (this.seeds.length && now - this.lastSpawn > this.o.spawnEvery &&
          growing < this.o.maxGrowing && this.traces.length < this.o.max) {
        const s = pick(this.seeds);
        this.spawn(s.x, s.y, pick(s.dirs), { force: true });
        this.lastSpawn = now;
      }

      const step = this.o.speed * dt;
      for (const t of this.traces) {
        if (t.state === 'grow') {
          let budget = step;
          let guard = 0;
          while (budget > 0 && t.state === 'grow' && guard++ < 8) {
            if (t.seg >= 1) { this.advance(t); if (t.state !== 'grow') break; }
            const n = t.pts.length;
            const a = t.pts[n - 2];
            const b = t.pts[n - 1];
            const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
            const need = (1 - t.seg) * L;
            if (budget >= need) { t.seg = 1; budget -= need; }
            else { t.seg += budget / L; budget = 0; }
          }
        } else if (t.state === 'hold') {
          t.t += dt;
          if (t.t > t.hold) { t.state = 'fade'; t.t = 0; }
        } else if (t.state === 'fade') {
          t.t += dt;
          t.a = 1 - t.t / this.o.fade;
          if (t.a <= 0) t.dead = true;
        }
      }

      if (this.traces.some((t) => t.dead)) {
        this.traces = this.traces.filter((t) => {
          if (!t.dead) return true;
          for (const idx of t.cells) if (idx < this.occ.length && this.occ[idx] === t.id) this.occ[idx] = 0;
          return false;
        });
        this.pulses = this.pulses.filter((p) => !p.tr.dead);
      }

      if (now - this.lastPulse > 700) {
        this.lastPulse = now;
        const pool = this.traces.filter((t) => t.state === 'hold' && t.total > 90);
        if (pool.length && this.pulses.length < 6) this.pulses.push({ tr: pick(pool), s: 0 });
      }
      for (const p of this.pulses) p.s += .32 * dt;
      this.pulses = this.pulses.filter((p) => p.s < p.tr.total + 34);

      for (const f of this.fx) f.t += dt;
      this.fx = this.fx.filter((f) => f.t < f.life);
    }

    prefill() {
      const target = Math.round(this.o.max * .8);
      let guard = 0;
      while (this.seeds.length && this.traces.length < target && guard++ < 300) {
        const s = this.seeds[guard % this.seeds.length];
        this.spawn(s.x, s.y, pick(s.dirs), { force: true });
        this.completeAll();
      }
    }

    completeAll() {
      let guard = 0;
      let any = true;
      while (any && guard++ < 4000) {
        any = false;
        for (const t of this.traces) {
          if (t.state === 'grow') { any = true; t.seg = 1; this.advance(t); }
        }
      }
      for (const t of this.traces) t.state = 'static';
    }

    strokeRange(t, s0, s1) {
      s0 = Math.max(0, s0);
      s1 = Math.min(t.total, s1);
      if (s1 <= s0) return null;
      const { ctx } = this;
      const p = t.pts;
      const d = t.d;
      let k = 0;
      while (k < d.length - 2 && d[k + 1] < s0) k++;
      const at = (seg, s) => {
        const L = d[seg + 1] - d[seg] || 1;
        const u = (s - d[seg]) / L;
        return [p[seg][0] + (p[seg + 1][0] - p[seg][0]) * u, p[seg][1] + (p[seg + 1][1] - p[seg][1]) * u];
      };
      const a = at(k, s0);
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      while (k < d.length - 2 && d[k + 1] < s1) { k++; ctx.lineTo(p[k][0], p[k][1]); }
      const b = at(k, s1);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
      return b;
    }

    draw() {
      const { ctx, k } = this;
      if (!this.w) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, this.c.width, this.c.height);
      if (this.grid) ctx.drawImage(this.grid, 0, 0);
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const traceCol = `rgba(${k.trace},${k.traceA})`;
      for (const t of this.traces) {
        const p = t.pts;
        const n = p.length;
        if (n < 2) continue;
        ctx.globalAlpha = t.a;
        ctx.strokeStyle = traceCol;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(p[0][0], p[0][1]);
        for (let i = 1; i < n - 1; i++) ctx.lineTo(p[i][0], p[i][1]);
        const a = p[n - 2];
        const b = p[n - 1];
        const hx = a[0] + (b[0] - a[0]) * t.seg;
        const hy = a[1] + (b[1] - a[1]) * t.seg;
        ctx.lineTo(hx, hy);
        ctx.stroke();
        if (t.state === 'grow') {
          ctx.fillStyle = k.head;
          ctx.beginPath();
          ctx.arc(hx, hy, 2.3, 0, TAU);
          ctx.fill();
        } else {
          ctx.fillStyle = k.via;
          ctx.strokeStyle = k.viaStroke;
          ctx.lineWidth = 1.3;
          ctx.beginPath();
          ctx.arc(b[0], b[1], 3.1, 0, TAU);
          ctx.fill();
          ctx.stroke();
        }
      }

      ctx.lineWidth = 2.2;
      for (const pl of this.pulses) {
        const t = pl.tr;
        if (!t.d) continue;
        ctx.globalAlpha = t.a;
        ctx.strokeStyle = `rgba(${k.pulse},.85)`;
        const head = this.strokeRange(t, pl.s - 32, pl.s);
        if (head) {
          ctx.fillStyle = `rgba(${k.pulse},.16)`;
          ctx.beginPath();
          ctx.arc(head[0], head[1], 6.5, 0, TAU);
          ctx.fill();
          ctx.fillStyle = `rgba(${k.pulse},1)`;
          ctx.beginPath();
          ctx.arc(head[0], head[1], 2.2, 0, TAU);
          ctx.fill();
        }
      }

      for (const f of this.fx) this.drawFx(f);
      ctx.globalAlpha = 1;
    }

    drawFx(f) {
      const { ctx, k } = this;
      if (f.type === 'ring') {
        const u = f.t / f.life;
        const e = 1 - Math.pow(1 - u, 3);
        ctx.globalAlpha = 1 - u;
        ctx.strokeStyle = `rgba(${k.ring},.65)`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(f.x, f.y, 4 + e * 32, 0, TAU);
        ctx.stroke();
        return;
      }
      const g = Math.min(1, f.t / 650);
      const e = 1 - Math.pow(1 - g, 3);
      ctx.globalAlpha = f.life === Infinity ? 1 : clamp((f.life - f.t) / 1400, 0, 1);
      const { x, y } = f;
      ctx.strokeStyle = k.leafDeep;
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - 14 * e);
      ctx.stroke();
      drawLeaf(ctx, x, y - 6 * e, x - 12 * e, y - 12 * e, 7 * e, k.leaf);
      drawLeaf(ctx, x, y - 11 * e, x + 13 * e, y - 20 * e, 8 * e, k.leaf);
      ctx.fillStyle = k.via;
      ctx.strokeStyle = k.viaStroke;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(x, y, 3.1, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }

    bindPointer() {
      const host = this.o.host;
      host.addEventListener('pointermove', (e) => {
        const r = this.c.getBoundingClientRect();
        this.target = { x: e.clientX - r.left, y: e.clientY - r.top, time: performance.now() };
      }, { passive: true });
      host.addEventListener('pointerleave', () => { this.target = null; });
      host.addEventListener('click', (e) => {
        if (e.target.closest('a, button, input, label, select, textarea')) return;
        const sel = window.getSelection && String(window.getSelection());
        if (sel) return;
        const r = this.c.getBoundingClientRect();
        const x = e.clientX - r.left;
        const y = e.clientY - r.top;
        if (x < 0 || y < 0 || x > r.width || y > r.height) return;
        this.plant(x, y);
      });
    }

    plant(x, y) {
      const [i, j] = this.cellOf(x, y);
      const [nx, ny] = this.node(i, j);
      if (this.reduce) {
        this.fx.push({ type: 'sprout', x: nx, y: ny, t: 650, life: Infinity });
      } else {
        this.fx.push({ type: 'ring', x: nx, y: ny, t: 0, life: 900 });
        this.fx.push({ type: 'sprout', x: nx, y: ny, t: 0, life: 7000 });
      }
      const dirs = [0, 1, 2, 3, 4, 5, 6, 7].sort(() => Math.random() - .5).slice(0, 5);
      for (const d of dirs) this.spawn(nx, ny, d, { force: true, run: 2, max: Math.round(rand(5, 16)) });
      let over = this.traces.length - this.o.max;
      for (const t of this.traces) {
        if (over <= 0) break;
        if (t.state === 'hold') { t.state = 'fade'; t.t = 0; over--; }
      }
      if (this.reduce) { this.completeAll(); this.draw(); }
    }

    toggle() {
      const run = this.started && this.visible && !document.hidden && !this.reduce;
      if (run && !this.active) {
        this.active = true;
        const id = ++this.loop;
        let last = performance.now();
        const tick = (now) => {
          if (!this.active || id !== this.loop) return;
          const dt = Math.min(50, now - last);
          last = now;
          if (now >= this.t0) this.update(now, dt);
          this.draw();
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      } else if (!run) {
        this.active = false;
      }
    }
  }

  function drawLeaf(ctx, x0, y0, x1, y1, w, color) {
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    const L = Math.hypot(x1 - x0, y1 - y0) || 1;
    const px = (-(y1 - y0) / L) * w;
    const py = ((x1 - x0) / L) * w;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(mx + px, my + py, x1, y1);
    ctx.quadraticCurveTo(mx - px, my - py, x0, y0);
    ctx.fill();
  }

  // Seeds that start at the terminals of an on-page logo mark.
  function markSeeds(mark) {
    return (rect) => {
      if (!mark) return [];
      const m = mark.getBoundingClientRect();
      const cx = m.left + m.width / 2;
      return [...mark.querySelectorAll('.term')].map((el) => {
        const r = el.getBoundingClientRect();
        const x = r.left + r.width / 2;
        const y = r.top + r.height / 2;
        const side = x < cx - 4 ? -1 : x > cx + 4 ? 1 : 0;
        return {
          x: x - rect.left,
          y: y - rect.top,
          dirs: side < 0 ? [3, 4, 2, 3] : side > 0 ? [1, 0, 2, 1] : [2, 2, 1, 3],
        };
      });
    };
  }

  // Seeds along the edges of a page header.
  function edgeSeeds(rect, b) {
    const pts = [];
    for (let s = 1; s <= 4; s++) {
      const [x, y] = b.node(0, Math.round((b.rows - 1) * s / 5));
      pts.push({ x, y, dirs: [0, 0, 1, 7] });
    }
    for (let s = 1; s <= 3; s++) {
      const [x, y] = b.node(b.cols - 1, Math.round((b.rows - 1) * s / 4));
      pts.push({ x, y, dirs: [4, 4, 3, 5] });
    }
    for (let s = 1; s <= 3; s++) {
      const [x, y] = b.node(Math.round((b.cols - 1) * (s / 4 + .1)), b.rows - 1);
      pts.push({ x, y, dirs: [6, 5, 7] });
    }
    return pts;
  }

  /* ---------- Navigation ---------- */
  function initNav() {
    const toggle = document.querySelector('[data-menu-toggle]');
    const menu = document.getElementById('menu');
    if (toggle && menu) {
      const label = toggle.querySelector('[data-menu-label]');
      const setOpen = (open) => {
        toggle.setAttribute('aria-expanded', String(open));
        menu.classList.toggle('is-open', open);
        document.body.classList.toggle('menu-open', open);
        menu.inert = !open;
        if (label) label.textContent = open ? 'Close' : 'Menu';
      };
      menu.inert = true;
      toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && menu.classList.contains('is-open')) { setOpen(false); toggle.focus(); }
      });
      const wide = window.matchMedia('(min-width: 961px)');
      const onWide = (e) => { if (e.matches) setOpen(false); };
      if (wide.addEventListener) wide.addEventListener('change', onWide);
    }

    const nav = document.querySelector('.nav');
    if (nav) {
      let ticking = false;
      const update = () => {
        ticking = false;
        const max = doc.scrollHeight - window.innerHeight;
        const p = max > 0 ? clamp(window.scrollY / max, 0, 1) : 0;
        nav.style.setProperty('--progress', p.toFixed(4));
        nav.style.setProperty('--progress-dot', p > .002 ? 1 : 0);
      };
      window.addEventListener('scroll', () => {
        if (!ticking) { ticking = true; requestAnimationFrame(update); }
      }, { passive: true });
      window.addEventListener('resize', update);
      update();
    }
  }

  /* ---------- Section reveals (structural lines draw in) ---------- */
  function initReveal() {
    const els = [...document.querySelectorAll('[data-reveal]')].filter((el) => el.dataset.reveal !== 'manual');
    if (!('IntersectionObserver' in window) || reduceMQ.matches) {
      els.forEach((el) => el.classList.add('is-in'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: .05 });
    els.forEach((el) => io.observe(el));
  }

  /* ---------- Logo marks ---------- */
  function initMarks() {
    document.querySelectorAll('[data-regrow]').forEach((btn) => {
      btn.addEventListener('click', () => grow(btn.querySelector('.mark')));
    });
    if (reduceMQ.matches || !('IntersectionObserver' in window)) {
      document.querySelectorAll('.mark[data-grow="view"]').forEach(grow);
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { grow(e.target); io.unobserve(e.target); }
      });
    }, { threshold: .35 });
    document.querySelectorAll('.mark[data-grow="view"]').forEach((m) => io.observe(m));
  }

  /* ---------- Home hero ---------- */
  function initHero() {
    const hero = document.querySelector('[data-hero]');
    if (!hero) return;
    const fitEl = hero.querySelector('.fit');
    const mark = hero.querySelector('.hero__mark');
    const canvas = hero.querySelector('.hero__canvas');
    splitChars(fitEl);
    const doFit = () => fit(fitEl, 300);
    doFit();

    const small = window.innerWidth < 720;
    const board = new CircuitRoots(canvas, {
      host: hero,
      seeds: markSeeds(mark),
      max: small ? 22 : 40,
      maxGrowing: small ? 6 : 11,
      spawnEvery: 210,
    });

    let lastW = hero.clientWidth;
    if ('ResizeObserver' in window) {
      new ResizeObserver(() => {
        if (hero.clientWidth !== lastW) { lastW = hero.clientWidth; doFit(); board.refresh(); }
      }).observe(hero);
    }

    fontsReady().then(() => requestAnimationFrame(() => {
      doFit();
      board.resize();
      board.refresh();
      hero.classList.add('is-in');
      if (!reduceMQ.matches) grow(mark);
      board.begin(850);
    }));
  }

  /* ---------- Other circuit boards (page headers, About) ---------- */
  function initBoards() {
    document.querySelectorAll('canvas[data-circuit]').forEach((canvas) => {
      const host = canvas.parentElement;
      if (canvas.dataset.circuit === 'board') {
        const mark = host.querySelector('.mark');
        const board = new CircuitRoots(canvas, {
          host, theme: 'dark', seeds: markSeeds(mark), max: 44, maxGrowing: 12, spawnEvery: 200,
        });
        fontsReady().then(() => { board.refresh(); board.begin(950); });
      } else {
        const board = new CircuitRoots(canvas, {
          host, seeds: edgeSeeds, max: 28, maxGrowing: 8, minLen: 6, maxLen: 26,
        });
        board.begin(300);
      }
    });
  }

  /* ---------- Footer wordmark: letters widen toward the pointer ---------- */
  function initFooterWordmark() {
    const el = document.querySelector('[data-proximity]');
    if (!el) return;
    const chars = splitChars(el);
    const BASE = [112, 800];
    const LO = [100, 700];
    const HI = [125, 900];
    const setAll = ([w, g]) => chars.forEach((c) => { c.style.fontStretch = w + '%'; c.style.fontWeight = g; });
    const refit = () => {
      el.classList.add('is-measuring');
      setAll(HI);
      fit(el, 260);
      setAll(BASE);
      void el.offsetWidth;
      el.classList.remove('is-measuring');
    };
    refit();
    fontsReady().then(refit);
    window.addEventListener('resize', refit);

    if (!fineMQ.matches || reduceMQ.matches) return;
    const footer = el.closest('footer') || el.parentElement;
    let raf = 0;
    let px = null;
    let py = null;
    const apply = () => {
      raf = 0;
      if (px == null) return;
      el.classList.add('is-tracking');
      const box = el.getBoundingClientRect();
      const R = box.width * .22;
      const rects = chars.map((c) => c.getBoundingClientRect());
      chars.forEach((c, i) => {
        const r = rects[i];
        const dx = px - (r.left + r.width / 2);
        const dy = (py - (r.top + r.height / 2)) * 1.4;
        const t = clamp(1 - Math.hypot(dx, dy) / R, 0, 1);
        const e = t * t * (3 - 2 * t);
        c.style.fontStretch = lerp(LO[0], HI[0], e).toFixed(1) + '%';
        c.style.fontWeight = Math.round(lerp(LO[1], HI[1], e));
      });
    };
    footer.addEventListener('pointermove', (e) => {
      px = e.clientX;
      py = e.clientY;
      if (!raf) raf = requestAnimationFrame(apply);
    });
    footer.addEventListener('pointerleave', () => {
      px = null;
      el.classList.remove('is-tracking');
      setAll(BASE);
    });
  }

  /* ---------- S / T / E / M tiles ---------- */
  function initStemTiles() {
    const tiles = [...document.querySelectorAll('.stem-tile')];
    if (!tiles.length) return;
    const words = [...document.querySelectorAll('.kw')];
    let pinned = null;
    const light = (key) => words.forEach((w) => w.classList.toggle('is-lit', w.dataset.kw === key));
    tiles.forEach((tile) => {
      const key = tile.dataset.kw;
      tile.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') light(key); });
      tile.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') light(pinned); });
      tile.addEventListener('focus', () => light(key));
      tile.addEventListener('blur', () => light(pinned));
      tile.addEventListener('click', () => {
        pinned = pinned === key ? null : key;
        tiles.forEach((t) => t.setAttribute('aria-pressed', String(t.dataset.kw === pinned)));
        light(pinned || (tile.matches(':hover') ? key : null));
      });
    });
  }

  /* ---------- Get Involved band: current runs toward the button ---------- */
  function initBand() {
    const band = document.querySelector('[data-band]');
    if (!band || reduceMQ.matches) return;
    const cta = band.querySelector('.btn');
    const on = () => band.classList.add('is-live');
    const off = () => {
      if (cta.matches(':hover') || document.activeElement === cta) return;
      band.classList.remove('is-live');
    };
    cta.addEventListener('pointerenter', on);
    cta.addEventListener('pointerleave', () => band.classList.remove('is-live'));
    cta.addEventListener('focus', on);
    cta.addEventListener('blur', () => band.classList.remove('is-live'));
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(([e]) => {
        if (e.isIntersecting) { on(); setTimeout(off, 3500); io.disconnect(); }
      }, { threshold: .5 });
      io.observe(band);
    }
  }

  /* ---------- Magnetic buttons ---------- */
  function initMagnetic() {
    if (!fineMQ.matches || reduceMQ.matches) return;
    document.querySelectorAll('[data-magnetic]').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const x = e.clientX - (r.left + r.width / 2);
        const y = e.clientY - (r.top + r.height / 2);
        el.style.transform = `translate(${(x * .22).toFixed(1)}px, ${(y * .32).toFixed(1)}px)`;
      });
      el.addEventListener('pointerleave', () => { el.style.transform = ''; });
    });
  }

  /* ---------- Circuit lists light up as you scroll ---------- */
  function initTraceLists() {
    const lists = [...document.querySelectorAll('[data-trace-list]')].map((l) => ({
      l,
      cur: l.querySelector('.trace-list__current'),
      items: [...l.querySelectorAll('.trace-list__item')].map((it) => ({ it, node: it.querySelector('.trace-list__node') })),
    }));
    if (!lists.length) return;
    let ticking = false;
    const update = () => {
      ticking = false;
      const vh = window.innerHeight;
      const atEnd = window.scrollY + vh >= doc.scrollHeight - 4;
      for (const { l, cur, items } of lists) {
        const r = l.getBoundingClientRect();
        const fill = reduceMQ.matches || atEnd ? r.height : clamp(vh * .72 - r.top, 0, r.height);
        cur.style.height = fill + 'px';
        for (const { it, node } of items) {
          const nr = node.getBoundingClientRect();
          it.classList.toggle('is-lit', fill >= nr.top + nr.height / 2 - r.top - 2);
        }
      }
    };
    window.addEventListener('scroll', () => {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  /* ---------- Chapter Leader eligibility switch ---------- */
  function initGate() {
    const box = document.querySelector('[data-eligibility]');
    if (!box) return;
    const panel = box.closest('.apply');
    const link = panel.querySelector('[data-gated]');
    const hint = panel.querySelector('[data-gate-hint]');
    const sw = box.closest('.switch');
    const sync = () => {
      const ok = box.checked;
      panel.classList.toggle('is-powered', ok);
      link.setAttribute('aria-disabled', String(!ok));
      hint.textContent = ok
        ? 'Application unlocked. It opens in a new tab.'
        : 'Turn on the switch to confirm you are in high school or older.';
    };
    box.addEventListener('change', sync);
    link.addEventListener('click', (e) => {
      if (box.checked) return;
      e.preventDefault();
      sw.classList.remove('is-nudged');
      void sw.offsetWidth;
      sw.classList.add('is-nudged');
      box.focus();
    });
    sync();
  }

  /* ---------- Copy email ---------- */
  function initCopy() {
    document.querySelectorAll('[data-copy]').forEach((btn) => {
      const label = btn.querySelector('[data-copy-label]');
      const original = label.textContent;
      let timer = 0;
      btn.addEventListener('click', async () => {
        const text = btn.dataset.copy;
        let ok = false;
        try {
          await navigator.clipboard.writeText(text);
          ok = true;
        } catch (err) {
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.setAttribute('readonly', '');
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
          ta.remove();
        }
        label.textContent = ok ? 'Copied' : 'Select the address to copy it';
        btn.classList.toggle('is-done', ok);
        clearTimeout(timer);
        timer = setTimeout(() => { label.textContent = original; btn.classList.remove('is-done'); }, 2200);
      });
    });
  }

  /* ---------- Boot ---------- */
  const boot = () => {
    initNav();
    initReveal();
    initMarks();
    initHero();
    initBoards();
    initFooterWordmark();
    initStemTiles();
    initBand();
    initMagnetic();
    initTraceLists();
    initGate();
    initCopy();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
