// Canvas drawing for the maze, the search heat map, Pac-Man and the ghosts.
// Game coordinates have y = 0 at the bottom; the canvas has y = 0 at the top.

export const COLORS = {
  floor: '#0d0b2b',
  wall: '#3b4bff',
  dot: '#ffc9b5',
  pac: '#ffd23f',
  path: '#ffd23f',
  ghosts: ['#ff4f6d', '#ffb8f0', '#3ee6f0', '#ffb852'],
  scared: '#3045ff',
};

// Early expansions are cyan, late ones pink: the colour shows the order the
// algorithm explored the maze in.
export function heatColor(fraction, alpha) {
  const hue = 190 + fraction * 140;
  return `hsla(${hue}, 95%, 60%, ${alpha})`;
}

export class BoardRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.board = null;
    this.cell = 20;
    this.wallLayer = document.createElement('canvas');
    this.heatLayer = document.createElement('canvas');
    this.heatDrawn = 0;
    this.heatCounts = new Map();
  }

  setBoard(board) {
    this.board = board;
    this.wallSet = new Set(board.walls.map(([x, y]) => `${x},${y}`));
    this.resetHeat();
  }

  fit(maxWidth, maxHeight) {
    if (!this.board) return;
    const { width, height } = this.board;
    const cell = Math.max(6, Math.floor(Math.min(maxWidth / width, maxHeight / height)));
    const dpr = window.devicePixelRatio || 1;
    this.cell = cell;
    this.dpr = dpr;
    for (const c of [this.canvas, this.wallLayer, this.heatLayer]) {
      c.width = width * cell * dpr;
      c.height = height * cell * dpr;
    }
    this.canvas.style.width = `${width * cell}px`;
    this.canvas.style.height = `${height * cell}px`;
    this.drawWalls();
    this.resetHeat();
  }

  px(x) { return (x + 0.5) * this.cell; }
  py(y) { return (this.board.height - 1 - y + 0.5) * this.cell; }

  drawWalls() {
    const ctx = this.wallLayer.getContext('2d');
    const { cell, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.wallLayer.width, this.wallLayer.height);
    const tube = new Path2D();
    for (const [x, y] of this.board.walls) {
      const cx = this.px(x);
      const cy = this.py(y);
      tube.moveTo(cx, cy);
      tube.lineTo(cx + 0.001, cy);
      if (this.wallSet.has(`${x + 1},${y}`)) { tube.moveTo(cx, cy); tube.lineTo(this.px(x + 1), cy); }
      if (this.wallSet.has(`${x},${y + 1}`)) { tube.moveTo(cx, cy); tube.lineTo(cx, this.py(y + 1)); }
    }
    const outer = cell * 0.62;
    const rim = Math.max(1.5, cell * 0.11);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = COLORS.wall;
    ctx.lineWidth = outer;
    ctx.stroke(tube);
    ctx.strokeStyle = COLORS.floor;
    ctx.lineWidth = Math.max(1, outer - rim * 2);
    ctx.stroke(tube);
  }

  resetHeat() {
    const ctx = this.heatLayer.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.heatLayer.width, this.heatLayer.height);
    this.heatDrawn = 0;
    this.heatCounts = new Map();
  }

  // Paint expansions [heatDrawn, upTo) onto the heat layer. Going backwards
  // (scrubbing) repaints from the start.
  paintHeat(order, upTo) {
    upTo = Math.max(0, Math.min(order.length, upTo));
    if (upTo < this.heatDrawn) this.resetHeat();
    const ctx = this.heatLayer.getContext('2d');
    const { cell, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const total = Math.max(1, order.length - 1);
    for (let i = this.heatDrawn; i < upTo; i += 1) {
      const [x, y] = order[i];
      const key = x * 4096 + y;
      const seen = this.heatCounts.get(key) || 0;
      this.heatCounts.set(key, seen + 1);
      ctx.fillStyle = seen === 0 ? heatColor(i / total, 0.55) : heatColor(i / total, 0.07);
      const inset = cell * 0.08;
      ctx.fillRect(x * cell + inset, (this.board.height - 1 - y) * cell + inset,
        cell - inset * 2, cell - inset * 2);
    }
    this.heatDrawn = upTo;
  }

  draw(scene) {
    const { ctx, dpr } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = COLORS.floor;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.heatLayer, 0, 0);
    ctx.drawImage(this.wallLayer, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (scene.cursor) this.drawCursor(scene.cursor);
    if (scene.food) this.drawFood(scene.food, scene.eaten);
    if (scene.capsules) this.drawCapsules(scene.capsules, scene.time || 0);
    if (scene.path && scene.path.length > 1) this.drawPath(scene.path, scene.pathShown ?? scene.path.length);
    for (const ghost of scene.ghosts || []) this.drawGhost(ghost, scene.time || 0);
    if (scene.pacman) this.drawPacman(scene.pacman, scene.time || 0);
  }

  drawCursor([x, y]) {
    const { ctx, cell } = this;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1.5, cell * 0.1);
    ctx.strokeRect(x * cell + 1, (this.board.height - 1 - y) * cell + 1, cell - 2, cell - 2);
  }

  drawFood(food, eaten) {
    const { ctx, cell } = this;
    ctx.fillStyle = COLORS.dot;
    const r = Math.max(1.5, cell * 0.1);
    for (const [x, y] of food) {
      if (eaten && eaten.has(x * 4096 + y)) continue;
      ctx.beginPath();
      ctx.arc(this.px(x), this.py(y), r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawCapsules(capsules, time) {
    const { ctx, cell } = this;
    const pulse = 0.75 + 0.25 * Math.sin(time / 180);
    ctx.fillStyle = COLORS.dot;
    for (const [x, y] of capsules) {
      ctx.beginPath();
      ctx.arc(this.px(x), this.py(y), cell * 0.3 * pulse, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawPath(path, shown) {
    const { ctx, cell } = this;
    ctx.strokeStyle = COLORS.path;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = Math.max(2, cell * 0.16);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash([cell * 0.05, cell * 0.3]);
    ctx.beginPath();
    const n = Math.min(path.length, Math.ceil(shown));
    for (let i = 0; i < n; i += 1) {
      const [x, y] = path[i];
      if (i === 0) ctx.moveTo(this.px(x), this.py(y));
      else ctx.lineTo(this.px(x), this.py(y));
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  drawPacman({ x, y, dir, dead }, time) {
    const { ctx, cell } = this;
    const angles = { East: 0, North: -Math.PI / 2, West: Math.PI, South: Math.PI / 2 };
    const facing = angles[dir] ?? 0;
    const mouth = dead ? Math.PI * 0.95 : (0.06 + 0.22 * Math.abs(Math.sin(time / 90))) * Math.PI;
    ctx.fillStyle = COLORS.pac;
    ctx.beginPath();
    ctx.moveTo(this.px(x), this.py(y));
    ctx.arc(this.px(x), this.py(y), cell * 0.44, facing + mouth, facing - mouth + Math.PI * 2);
    ctx.closePath();
    ctx.fill();
  }

  drawGhost({ x, y, dir, scared, index }, time) {
    const { ctx, cell } = this;
    const cx = this.px(x);
    const cy = this.py(y);
    const r = cell * 0.42;
    const flashing = scared > 0 && scared < 8 && Math.floor(time / 200) % 2 === 0;
    const body = scared > 0 ? (flashing ? '#f2f2ff' : COLORS.scared) : COLORS.ghosts[index % COLORS.ghosts.length];
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(cx, cy - r * 0.15, r, Math.PI, 0);
    const bottom = cy + r * 0.85;
    ctx.lineTo(cx + r, bottom);
    const waves = 3;
    const shift = Math.floor(time / 160) % 2 ? 0.5 : 0;
    for (let i = 0; i < waves; i += 1) {
      const x1 = cx + r - ((i + 0.5 + shift * 0.2) * 2 * r) / waves;
      const x2 = cx + r - ((i + 1) * 2 * r) / waves;
      ctx.lineTo(x1, bottom - r * 0.28);
      ctx.lineTo(x2, bottom);
    }
    ctx.closePath();
    ctx.fill();

    if (scared > 0) {
      ctx.fillStyle = flashing ? '#ff4f6d' : '#ffd6c9';
      for (const dx of [-0.35, 0.35]) {
        ctx.beginPath();
        ctx.arc(cx + dx * r, cy - r * 0.2, r * 0.12, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }
    const look = { East: [1, 0], West: [-1, 0], North: [0, -1], South: [0, 1] }[dir] || [0, 0];
    for (const dx of [-0.36, 0.36]) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(cx + dx * r, cy - r * 0.2, r * 0.26, r * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1b1bb8';
      ctx.beginPath();
      ctx.arc(cx + dx * r + look[0] * r * 0.12, cy - r * 0.2 + look[1] * r * 0.14, r * 0.13, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
