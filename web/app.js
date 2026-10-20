import { BoardRenderer } from './render.js?v=4';

// ------------------------------------------------------------------ catalog

const PROBLEMS = {
  position: {
    label: 'Find the dot (Q1–Q4)',
    layouts: ['tinyMaze', 'smallMaze', 'mediumMaze', 'bigMaze', 'openMaze', 'contoursMaze',
      'mediumDottedMaze', 'mediumScaryMaze'],
    defaultLayout: 'mediumMaze',
    heuristics: ['manhattan', 'euclidean', 'null'],
  },
  corners: {
    label: 'Visit all four corners (Q5–Q6)',
    layouts: ['tinyCorners', 'mediumCorners', 'bigCorners'],
    defaultLayout: 'mediumCorners',
    heuristics: ['corners', 'null'],
  },
  food: {
    label: 'Eat all the dots (Q7–Q8)',
    layouts: ['tinySearch', 'testSearch', 'trickySearch', 'smallSearch', 'greedySearch',
      'oddSearch', 'boxSearch', 'mediumSearch'],
    defaultLayout: 'trickySearch',
    heuristics: ['food', 'null'],
  },
};

const ALGORITHMS = {
  dfs: {
    short: 'DFS',
    name: 'Depth-first search',
    about: 'Expands the <strong>deepest</strong> node first. The fringe is a <strong>Stack</strong> (last in, first out). Fast to find a path, but not the shortest one. Written by Chamara for Q1.',
  },
  bfs: {
    short: 'BFS',
    name: 'Breadth-first search',
    about: 'Expands the <strong>shallowest</strong> node first. The fringe is a <strong>Queue</strong> (first in, first out). Finds the shortest path when every step costs 1. Written by Kavisha for Q2.',
  },
  ucs: {
    short: 'UCS',
    name: 'Uniform cost search',
    about: 'Expands the <strong>cheapest path so far</strong>, g(n). The fringe is a <strong>PriorityQueue</strong> ordered by g. Optimal for any step costs. Written by Sawanya for Q3.',
  },
  astar: {
    short: 'A*',
    name: 'A* search',
    about: 'Expands the lowest <strong>g(n) + h(n)</strong>: the cost so far plus the heuristic\'s estimate of what is left. Optimal when the heuristic is admissible and consistent. Written by Rosheni for Q4.',
  },
  closest: {
    short: 'Greedy',
    name: 'Closest-dot search',
    about: 'Runs <strong>BFS to the nearest dot</strong>, eats it, and repeats until the maze is empty. Each search is tiny, so it is fast, but it is <strong>not optimal</strong>: grabbing the nearest dot can leave a long trip back later. This is Q8 of the CS188 project.',
    problems: ['food'],
  },
};

const algoKeys = (problem) => Object.keys(ALGORITHMS)
  .filter((key) => !ALGORITHMS[key].problems || ALGORITHMS[key].problems.includes(problem));

const HEURISTICS = {
  manhattan: 'Manhattan distance',
  euclidean: 'Straight-line distance',
  corners: 'Corners heuristic (Q6, Rosheni)',
  food: 'Food heuristic (Q7, Sawanya)',
  null: 'None, h = 0 (same as UCS)',
};

const COSTS = {
  uniform: 'Every step costs 1',
  stayEast: 'West side costs more',
  stayWest: 'East side costs more',
};

const PLAY_LAYOUTS = ['mediumClassic', 'smallClassic', 'originalClassic', 'trickyClassic',
  'openClassic', 'capsuleClassic', 'contestClassic', 'minimaxClassic', 'testClassic'];

const SPEEDS = {
  slow: { minRate: 15, seconds: 40, walk: 6 },
  normal: { minRate: 60, seconds: 10, walk: 11 },
  fast: { minRate: 250, seconds: 3, walk: 20 },
};

const fmt = (n) => (n == null ? '–' : Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 }));

// ------------------------------------------------------------------ python worker

class PyWorker {
  constructor(onReady, onProgress) {
    this.onReady = onReady;
    this.onProgress = onProgress;
    this.seq = 0;
    this.start();
  }

  start() {
    this.pending = new Map();
    this.worker = new Worker('web/worker.js?v=4');
    this.ready = new Promise((resolve, reject) => {
      this.worker.onmessage = ({ data }) => {
        if (data.id === 'progress') {
          this.onProgress(data);
          return;
        }
        if (data.id === 'ready') {
          if (data.ok) { resolve(); this.onReady(); } else reject(new Error(data.error));
          return;
        }
        const job = this.pending.get(data.id);
        if (!job) return;
        this.pending.delete(data.id);
        if (data.ok) job.resolve(data.result); else job.reject(new Error(data.error));
      };
      this.worker.onerror = (event) => reject(new Error(event.message || 'Python failed to load'));
    });
  }

  call(type, payload) {
    const id = (this.seq += 1);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, type, payload });
    });
  }

  // Terminating is the only way to interrupt Python mid-search.
  restart() {
    this.worker.terminate();
    for (const job of this.pending.values()) job.reject(new Error('stopped'));
    this.start();
  }
}

const status = document.getElementById('status');
function setStatus(text, isError = false) {
  status.textContent = text;
  status.classList.toggle('error', isError);
}

// ------------------------------------------------------------------ loading screen

const TIPS = [
  '<strong>BFS</strong> always finds the shortest path when every step costs the same.',
  '<strong>DFS</strong> uses a stack. On mediumMaze it finds a 130-step path when 68 steps is possible.',
  '<strong>UCS</strong> is Dijkstra’s algorithm that stops as soon as it pops the goal.',
  'An <strong>admissible</strong> heuristic never overestimates, so A* still finds the optimal path.',
  'On trickySearch, the food heuristic cuts A* from <strong>16,688</strong> expansions to <strong>4,137</strong>.',
  'The corners heuristic gets A* down to <strong>741</strong> expansions on mediumCorners. BFS needs 1,966.',
  '<strong>Greedy</strong> closest-dot search expands 31 times fewer nodes than A*, but its path is 8 steps longer.',
  'Everything here runs <strong>real Python</strong>, compiled to WebAssembly, inside your browser tab.',
];
const STAGES = ['runtime', 'files', 'import'];
const STAGE_TEXT = {
  runtime: 'Downloading Python…',
  files: 'Loading our search code…',
  import: 'Starting the game engine…',
};

const loader = {
  el: document.getElementById('loader'),
  stage: document.getElementById('loader-stage'),
  bar: document.getElementById('loader-bar'),
  fill: document.getElementById('loader-fill'),
  steps: document.getElementById('loader-steps'),
  tip: document.getElementById('loader-tip'),
  skip: document.getElementById('loader-skip'),
  value: 0,
  active: true,
};

function loaderSet(value) {
  loader.value = Math.max(loader.value, Math.min(100, value));
  loader.fill.style.width = `${loader.value}%`;
  loader.bar.setAttribute('aria-valuenow', String(Math.round(loader.value)));
}

function loaderSteps(current, state = 'active') {
  const index = STAGES.indexOf(current);
  loader.steps.querySelectorAll('li').forEach((li) => {
    const i = STAGES.indexOf(li.dataset.step);
    li.dataset.state = i < index ? 'done' : i === index ? state : '';
  });
}

// The runtime download gives no byte count, so ease toward 70% while it runs;
// the file and import stages then fill the rest with real progress.
const creep = setInterval(() => loaderSet(loader.value + (70 - loader.value) * 0.035), 150);

function onLoadProgress({ stage, done, total }) {
  if (!loader.active) return;
  loaderSteps(stage);
  loader.stage.textContent = STAGE_TEXT[stage];
  if (stage === 'files') {
    clearInterval(creep);
    loaderSet(70 + (20 * done) / Math.max(1, total));
  }
  if (stage === 'import') loaderSet(94);
}

let tipIndex = Math.floor(Math.random() * TIPS.length);
function showTip() {
  loader.tip.style.opacity = 0;
  setTimeout(() => {
    loader.tip.innerHTML = `💡 ${TIPS[tipIndex % TIPS.length]}`;
    loader.tip.style.opacity = 1;
    tipIndex += 1;
  }, 300);
}
showTip();
const tipTimer = setInterval(showTip, 5000);

function hideLoader() {
  loader.active = false;
  clearInterval(creep);
  clearInterval(tipTimer);
  loader.el.classList.add('done');
  setTimeout(() => { loader.el.hidden = true; }, 500);
}

loader.skip.addEventListener('click', () => {
  if (loader.el.classList.contains('failed')) location.reload();
  else hideLoader();
});

const py = new PyWorker(() => {
  setStatus('Python is ready. Pick a maze and run a search.');
  document.querySelectorAll('.run').forEach((b) => { b.disabled = false; });
  if (!loader.active) return;
  loader.steps.querySelectorAll('li').forEach((li) => { li.dataset.state = 'done'; });
  loader.stage.textContent = 'Ready! 🟡';
  loaderSet(100);
  setTimeout(hideLoader, 450);
}, onLoadProgress);

py.ready.catch((error) => {
  setStatus(`Python could not start: ${error.message}. Check your connection and reload.`, true);
  if (!loader.active) return;
  clearInterval(creep);
  loader.el.classList.add('failed');
  const current = loader.steps.querySelector('[data-state=active]')?.dataset.step || 'runtime';
  loaderSteps(current, 'failed');
  loader.stage.textContent = 'Python could not load. Check your internet connection.';
  loader.skip.textContent = 'Try again';
});

const boards = new Map();
async function getBoard(layout) {
  if (!boards.has(layout)) boards.set(layout, await py.call('board', { layout }));
  return boards.get(layout);
}

// ------------------------------------------------------------------ form helpers

function fillSelect(select, entries, selected) {
  select.replaceChildren(...entries.map(([value, label]) => {
    const option = new Option(label, value);
    option.selected = value === selected;
    return option;
  }));
}

function buildAlgoGroup(container, name, selected, problem) {
  const keys = algoKeys(problem);
  if (!keys.includes(selected)) selected = 'bfs';
  container.style.gridTemplateColumns = `repeat(${keys.length}, 1fr)`;
  container.replaceChildren(...keys.map((key) => {
    const algo = ALGORITHMS[key];
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = name;
    input.value = key;
    input.checked = key === selected;
    input.setAttribute('aria-label', algo.name);
    const span = document.createElement('span');
    span.textContent = algo.short;
    label.append(input, span);
    return label;
  }));
}

const layoutEntries = (problem) => PROBLEMS[problem].layouts.map((l) => [l, l]);
const heuristicEntries = (problem) => PROBLEMS[problem].heuristics.map((h) => [h, HEURISTICS[h]]);
const problemEntries = Object.entries(PROBLEMS).map(([k, p]) => [k, p.label]);
const costEntries = Object.entries(COSTS);

function toggleShown(form, flags) {
  form.querySelectorAll('[data-show]').forEach((el) => {
    el.hidden = !flags[el.dataset.show];
  });
}

function hudHTML(items) {
  return items.map(([label, value, cls]) => `<div><dt>${label}</dt><dd class="${cls || ''}">${value}</dd></div>`).join('');
}

function boardSpace(canvas, share = 1) {
  const wrap = canvas.parentElement;
  const style = getComputedStyle(wrap);
  const pad = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  const width = (wrap.clientWidth || 600) - pad;
  const height = Math.min(window.innerHeight * 0.66, 680) * share;
  return [width, height];
}

// ------------------------------------------------------------------ search playback

// One animated search result: expansions first, then Pac-Man walking the path.
class SearchTrack {
  constructor(renderer, board, result) {
    this.renderer = renderer;
    this.board = board;
    this.result = result;
    this.expanded = result.order.length;
    this.walk = Math.max(0, result.path.length - 1);
    this.food = board.food;
    this.start = board.agents.find((a) => a.pacman).pos;
  }

  get length() { return this.expanded + this.walk; }

  render(t, now) {
    const { renderer, result } = this;
    const searched = Math.max(0, Math.min(this.expanded, Math.floor(t)));
    renderer.paintHeat(result.order, searched);
    const scene = { food: this.food, capsules: this.board.capsules, time: now };
    if (t < this.expanded) {
      scene.cursor = searched > 0 ? result.order[searched - 1] : null;
      scene.pacman = { x: this.start[0], y: this.start[1], dir: 'East' };
      return renderer.draw(scene);
    }
    const s = Math.min(this.walk, t - this.expanded);
    const i = Math.min(Math.floor(s), Math.max(0, result.path.length - 1));
    const from = result.path[i] || this.start;
    const to = result.path[i + 1] || from;
    const f = s - Math.floor(s);
    const eaten = new Set();
    for (let k = 0; k <= Math.min(i + (f > 0.5 ? 1 : 0), result.path.length - 1); k += 1) {
      const [x, y] = result.path[k];
      eaten.add(x * 4096 + y);
    }
    scene.eaten = eaten;
    scene.path = result.path;
    scene.pathShown = result.path.length;
    scene.pacman = {
      x: from[0] + (to[0] - from[0]) * f,
      y: from[1] + (to[1] - from[1]) * f,
      dir: result.actions[Math.min(i, result.actions.length - 1)] || 'East',
    };
    return renderer.draw(scene);
  }
}

// Drives one or more tracks on a shared clock, with a scrubber and speed menu.
class Player {
  constructor(panel, onFrame) {
    this.panel = panel;
    this.toggle = panel.querySelector('.play-toggle');
    this.range = panel.querySelector('input[type=range]');
    this.speedSelect = panel.querySelector('select');
    this.onFrame = onFrame;
    this.tracks = [];
    this.t = 0;
    this.playing = false;
    this.toggle.addEventListener('click', () => (this.playing ? this.pause() : this.play()));
    this.range.addEventListener('input', () => {
      this.pause();
      this.t = (this.range.value / 1000) * this.length;
      this.draw(performance.now());
    });
    this.speedSelect.addEventListener('change', () => {
      if (this.speedSelect.value === 'instant') this.t = this.length;
      this.draw(performance.now());
    });
    this.loop = this.loop.bind(this);
  }

  get length() { return Math.max(0, ...this.tracks.map((tr) => tr.length)); }

  load(tracks) {
    this.tracks = tracks;
    this.panel.hidden = false;
    this.t = this.speedSelect.value === 'instant' ? this.length : 0;
    this.play();
  }

  play() {
    if (this.t >= this.length) this.t = 0;
    this.playing = true;
    this.toggle.textContent = '❚❚';
    this.toggle.setAttribute('aria-label', 'Pause');
    this.last = performance.now();
    requestAnimationFrame(this.loop);
  }

  pause() {
    this.playing = false;
    this.toggle.textContent = '▶';
    this.toggle.setAttribute('aria-label', 'Play');
  }

  // Expansion speed scales with the size of the search so big ones still
  // finish in a few seconds; walking speed is in cells per second.
  advance(dt) {
    const speed = SPEEDS[this.speedSelect.value];
    if (!speed) { this.t = this.length; return; }
    const maxExpanded = Math.max(1, ...this.tracks.map((tr) => tr.expanded));
    const inSearch = this.tracks.some((tr) => this.t < tr.expanded);
    const rate = inSearch ? Math.max(speed.minRate, maxExpanded / speed.seconds) : speed.walk;
    this.t = Math.min(this.length, this.t + rate * dt);
  }

  loop(now) {
    if (!this.playing) return;
    // rAF timestamps can be slightly older than performance.now() at play().
    this.advance(Math.max(0, now - this.last) / 1000);
    this.last = now;
    this.draw(now);
    if (this.t >= this.length) {
      this.pause();
      this.draw(now);
      return;
    }
    requestAnimationFrame(this.loop);
  }

  draw(now) {
    for (const track of this.tracks) track.render(Math.min(this.t, track.length), now);
    this.range.value = this.length ? Math.round((this.t / this.length) * 1000) : 0;
    this.onFrame?.(this.t);
  }
}

function describeOutcome(result) {
  if (result.status === 'limit') return `Stopped after ${fmt(result.limit)} expansions without reaching the goal.`;
  if (result.status === 'none') return 'The search finished without finding a path.';
  return null;
}

// Dims the maze with a "Searching…" overlay while Python works, so a long
// search never looks frozen. Short searches finish before it appears.
function showBusy(busyEls, text) {
  for (const el of busyEls) {
    el.hidden = false;
    el.querySelector('.busy-text').textContent = text;
  }
}

async function runGuarded(form, task, busyEls = []) {
  const run = form.querySelector('.run');
  const stop = form.querySelector('.stop');
  run.disabled = true;
  stop.hidden = false;
  const started = performance.now();
  const timer = setInterval(() => {
    const seconds = ((performance.now() - started) / 1000).toFixed(1);
    setStatus(`Searching… ${seconds} s`);
    if (performance.now() - started > 250) showBusy(busyEls, `Searching… ${seconds} s`);
  }, 100);
  try {
    await task();
  } catch (error) {
    clearInterval(timer);
    if (error.message === 'stopped') {
      setStatus('Search stopped. Restarting Python…');
      showBusy(busyEls, 'Restarting Python…');
      await py.ready.catch(() => {});
      setStatus('Search stopped. Try a smaller maze or a better heuristic.');
    } else {
      setStatus(`Something went wrong: ${error.message}`, true);
    }
  } finally {
    clearInterval(timer);
    for (const el of busyEls) el.hidden = true;
    run.disabled = false;
    stop.hidden = true;
  }
}

// ------------------------------------------------------------------ visualize mode

const viz = {
  form: document.getElementById('viz-form'),
  canvas: document.getElementById('viz-canvas'),
  hud: document.getElementById('viz-hud'),
  explain: document.getElementById('viz-explain'),
  code: document.getElementById('viz-code'),
};
viz.renderer = new BoardRenderer(viz.canvas);
viz.player = new Player(document.getElementById('viz-playback'), (t) => {
  const track = viz.player.tracks[0];
  if (!track) return;
  const searched = Math.max(0, Math.min(track.expanded, Math.floor(t)));
  const done = t >= track.expanded;
  viz.hud.innerHTML = hudHTML([
    ['Nodes expanded', fmt(searched), done ? 'good' : ''],
    ['Path cost', done ? fmt(track.result.cost) : '…'],
    ['Steps', done ? fmt(track.result.actions.length) : '…'],
    ['Python time', `${fmt(track.result.ms)} ms`],
  ]);
});

function vizConfig() {
  const f = viz.form;
  return {
    problem: f.problem.value,
    layout: f.layout.value,
    algorithm: f.querySelector('input[name=viz-algo]:checked').value,
    heuristic: f.heuristic.value,
    cost: f.cost.value,
  };
}

function vizSync() {
  const cfg = vizConfig();
  toggleShown(viz.form, { astar: cfg.algorithm === 'astar', position: cfg.problem === 'position' });
  let text = ALGORITHMS[cfg.algorithm].about;
  if (cfg.problem === 'corners') text += ' The corners problem itself was written by Chamara for Q5.';
  viz.explain.innerHTML = text;
}

async function vizShowBoard() {
  const version = (viz.version = (viz.version || 0) + 1);
  const board = await getBoard(viz.form.layout.value);
  if (version !== viz.version) return;
  viz.player.pause();
  viz.renderer.setBoard(board);
  viz.renderer.fit(...boardSpace(viz.canvas));
  viz.renderer.draw({ food: board.food, capsules: board.capsules, pacman: startOf(board), ghosts: [] });
  viz.player.tracks = [];
  viz.player.panel.hidden = true;
  viz.hud.innerHTML = hudHTML([['Nodes expanded', '–'], ['Path cost', '–'], ['Steps', '–'], ['Python time', '–']]);
}

function startOf(board) {
  const pac = board.agents.find((a) => a.pacman);
  return { x: pac.pos[0], y: pac.pos[1], dir: 'East' };
}

async function vizShowCode(cfg) {
  const keys = cfg.algorithm === 'closest' ? ['closestDot', 'anyFoodGoal', 'bfs'] : [cfg.algorithm];
  if (cfg.problem === 'corners') keys.push('corners');
  if (cfg.algorithm === 'astar' && cfg.heuristic === 'corners') keys.push('cornersHeuristic');
  if (cfg.algorithm === 'astar' && cfg.heuristic === 'food') keys.push('foodHeuristic');
  const parts = await Promise.all(keys.map((key) => py.call('source', { key })));
  viz.code.querySelector('code').textContent = parts.join('\n\n');
}

function setupVisualize() {
  const f = viz.form;
  fillSelect(f.problem, problemEntries, 'position');
  fillSelect(f.layout, layoutEntries('position'), PROBLEMS.position.defaultLayout);
  fillSelect(f.heuristic, heuristicEntries('position'), 'manhattan');
  fillSelect(f.cost, costEntries, 'uniform');
  buildAlgoGroup(f.querySelector('[data-algo-group=viz]'), 'viz-algo', 'bfs', 'position');
  vizSync();

  f.problem.addEventListener('change', () => {
    const p = f.problem.value;
    fillSelect(f.layout, layoutEntries(p), PROBLEMS[p].defaultLayout);
    fillSelect(f.heuristic, heuristicEntries(p), PROBLEMS[p].heuristics[0]);
    const current = f.querySelector('input[name=viz-algo]:checked').value;
    buildAlgoGroup(f.querySelector('[data-algo-group=viz]'), 'viz-algo', current, p);
    vizSync();
    vizShowBoard();
  });
  f.layout.addEventListener('change', vizShowBoard);
  f.addEventListener('change', vizSync);
  f.querySelector('.stop').addEventListener('click', () => py.restart());

  f.addEventListener('submit', (event) => {
    event.preventDefault();
    const cfg = vizConfig();
    const version = (viz.version = (viz.version || 0) + 1);
    runGuarded(f, async () => {
      const [board, result] = await Promise.all([getBoard(cfg.layout), py.call('search', { config: cfg })]);
      if (version !== viz.version) return;
      viz.renderer.setBoard(board);
      viz.renderer.fit(...boardSpace(viz.canvas));
      viz.player.load([new SearchTrack(viz.renderer, board, result)]);
      const algo = ALGORITHMS[cfg.algorithm].name;
      setStatus(describeOutcome(result)
        || `${algo} expanded ${fmt(result.expanded)} nodes and found a path costing ${fmt(result.cost)}.`);
      vizShowCode(cfg);
    }, [viz.canvas.parentElement.querySelector('.busy')]);
  });
}

// ------------------------------------------------------------------ compare mode

const cmp = {
  form: document.getElementById('cmp-form'),
  verdict: document.getElementById('cmp-verdict'),
  sides: ['a', 'b'].map((side) => ({
    side,
    canvas: document.getElementById(`cmp-canvas-${side}`),
    hud: document.getElementById(`cmp-hud-${side}`),
    name: document.getElementById(`cmp-name-${side}`),
  })),
};
cmp.sides.forEach((s) => { s.renderer = new BoardRenderer(s.canvas); });
cmp.player = new Player(document.getElementById('cmp-playback'), (t) => {
  cmp.player.tracks.forEach((track, i) => {
    const done = t >= track.expanded;
    cmp.sides[i].hud.innerHTML = hudHTML([
      ['Expanded', fmt(Math.min(track.expanded, Math.floor(t))), done ? 'good' : ''],
      ['Cost', done ? fmt(track.result.cost) : '…'],
    ]);
  });
});

function cmpConfig(side) {
  const f = cmp.form;
  return {
    problem: f.problem.value,
    layout: f.layout.value,
    algorithm: f.querySelector(`input[name=cmp-algo-${side}]:checked`).value,
    heuristic: f[`heuristic-${side}`].value,
    cost: f.cost.value,
  };
}

const HEURISTIC_PHRASES = {
  manhattan: 'Manhattan distance',
  euclidean: 'straight-line distance',
  corners: 'the corners heuristic',
  food: 'the food heuristic',
  null: 'no heuristic',
};

function cmpLabel(cfg) {
  const algo = ALGORITHMS[cfg.algorithm].name;
  return cfg.algorithm === 'astar' ? `A* with ${HEURISTIC_PHRASES[cfg.heuristic]}` : algo;
}

function cmpSync() {
  const f = cmp.form;
  const isPosition = f.problem.value === 'position';
  f.querySelector('[data-show=position]').hidden = !isPosition;
  for (const side of ['a', 'b']) {
    const algo = f.querySelector(`input[name=cmp-algo-${side}]:checked`).value;
    f.querySelector(`[data-side=${side}] [data-show=astar]`).hidden = algo !== 'astar';
  }
}

async function cmpShowBoards() {
  const version = (cmp.version = (cmp.version || 0) + 1);
  const board = await getBoard(cmp.form.layout.value);
  if (version !== cmp.version) return;
  cmp.player.pause();
  cmp.player.tracks = [];
  cmp.player.panel.hidden = true;
  cmp.verdict.textContent = '';
  for (const s of cmp.sides) {
    s.renderer.setBoard(board);
    s.renderer.fit(...boardSpace(s.canvas, 0.75));
    s.renderer.draw({ food: board.food, capsules: board.capsules, pacman: startOf(board) });
    s.hud.innerHTML = hudHTML([['Expanded', '–'], ['Cost', '–']]);
    s.name.textContent = cmpLabel(cmpConfig(s.side));
  }
}

function cmpVerdict(cfgs, results) {
  const [a, b] = results;
  const [na, nb] = cfgs.map(cmpLabel);
  if (a.status !== 'found' || b.status !== 'found') {
    return results.map((r, i) => `${[na, nb][i]}: ${describeOutcome(r) || `cost ${fmt(r.cost)}`}`).join(' ');
  }
  let text;
  if (a.expanded === b.expanded) text = `Both expanded ${fmt(a.expanded)} nodes.`;
  else {
    const [winner, loser, diff] = a.expanded < b.expanded ? [na, nb, b.expanded - a.expanded] : [nb, na, a.expanded - b.expanded];
    // Lowercase "Breadth-first search" mid-sentence, but leave "A*" alone.
    const midSentence = /^[A-Z][a-z]/.test(loser) ? loser.charAt(0).toLowerCase() + loser.slice(1) : loser;
    text = `${winner} expanded ${fmt(diff)} fewer nodes than ${midSentence}.`;
  }
  if (Math.abs(a.cost - b.cost) < 1e-9) text += ` Both paths cost ${fmt(a.cost)}.`;
  else text += ` Path cost: ${fmt(a.cost)} on the left, ${fmt(b.cost)} on the right.`;
  return text;
}

function setupCompare() {
  const f = cmp.form;
  fillSelect(f.problem, problemEntries, 'position');
  fillSelect(f.layout, layoutEntries('position'), PROBLEMS.position.defaultLayout);
  fillSelect(f.cost, costEntries, 'uniform');
  for (const side of ['a', 'b']) fillSelect(f[`heuristic-${side}`], heuristicEntries('position'), 'manhattan');
  buildAlgoGroup(f.querySelector('[data-algo-group=a]'), 'cmp-algo-a', 'bfs', 'position');
  buildAlgoGroup(f.querySelector('[data-algo-group=b]'), 'cmp-algo-b', 'astar', 'position');
  cmpSync();

  f.problem.addEventListener('change', () => {
    const p = f.problem.value;
    fillSelect(f.layout, layoutEntries(p), PROBLEMS[p].defaultLayout);
    for (const side of ['a', 'b']) {
      fillSelect(f[`heuristic-${side}`], heuristicEntries(p), PROBLEMS[p].heuristics[0]);
      // On the food problem, default to the Q8 greedy vs A* showdown.
      const current = f.querySelector(`input[name=cmp-algo-${side}]:checked`).value;
      const wanted = p === 'food' && side === 'a' ? 'closest' : current;
      buildAlgoGroup(f.querySelector(`[data-algo-group=${side}]`), `cmp-algo-${side}`, wanted, p);
    }
    cmpSync();
    cmpShowBoards();
  });
  f.layout.addEventListener('change', cmpShowBoards);
  f.addEventListener('change', () => {
    cmpSync();
    cmp.sides.forEach((s) => { s.name.textContent = cmpLabel(cmpConfig(s.side)); });
  });
  f.querySelector('.stop').addEventListener('click', () => py.restart());

  f.addEventListener('submit', (event) => {
    event.preventDefault();
    const cfgs = ['a', 'b'].map(cmpConfig);
    const version = (cmp.version = (cmp.version || 0) + 1);
    runGuarded(f, async () => {
      const board = await getBoard(cfgs[0].layout);
      const results = [];
      for (const cfg of cfgs) results.push(await py.call('search', { config: cfg }));
      if (version !== cmp.version) return;
      const tracks = cmp.sides.map((s, i) => {
        s.renderer.setBoard(board);
        s.renderer.fit(...boardSpace(s.canvas, 0.75));
        s.name.textContent = cmpLabel(cfgs[i]);
        return new SearchTrack(s.renderer, board, results[i]);
      });
      cmp.player.load(tracks);
      cmp.verdict.textContent = cmpVerdict(cfgs, results);
      setStatus('Both searches finished.');
    }, cmp.sides.map((s) => s.canvas.parentElement.querySelector('.busy')));
  });
}

// ------------------------------------------------------------------ play mode

const TICK_MS = 150;
const KEYS = {
  ArrowUp: 'North', ArrowDown: 'South', ArrowLeft: 'West', ArrowRight: 'East',
  w: 'North', s: 'South', a: 'West', d: 'East', W: 'North', S: 'South', A: 'West', D: 'East',
};

const game = {
  form: document.getElementById('play-form'),
  canvas: document.getElementById('play-canvas'),
  hud: document.getElementById('play-hud'),
  overlay: document.getElementById('play-overlay'),
  wanted: 'West',
  facing: 'West',
  running: false,
  session: 0,
};
game.renderer = new BoardRenderer(game.canvas);

function playScene(now) {
  const { prev, cur } = game;
  if (!cur) return;
  const f = game.running ? Math.min(1, (now - game.tickAt) / TICK_MS) : 1;
  const lerp = (a, b) => a + (b - a) * f;
  const pacDir = cur.pacman.dir === 'Stop' ? game.facing : cur.pacman.dir;
  if (cur.pacman.dir !== 'Stop') game.facing = cur.pacman.dir;
  const near = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) <= 1.01;
  const pos = (p, c) => (p && near(p, c) ? [lerp(p[0], c[0]), lerp(p[1], c[1])] : c);
  const pac = pos(prev?.pacman.pos, cur.pacman.pos);
  game.renderer.draw({
    food: cur.food,
    capsules: cur.capsules,
    time: now,
    pacman: { x: pac[0], y: pac[1], dir: pacDir, dead: cur.lose },
    ghosts: cur.ghosts.map((g, i) => {
      const p = pos(prev?.ghosts[i]?.pos, g.pos);
      return { x: p[0], y: p[1], dir: g.dir, scared: g.scared, index: i };
    }),
  });
}

function playHud() {
  const { cur } = game;
  game.hud.innerHTML = hudHTML([
    ['Score', fmt(cur.score), 'good'],
    ['Dots left', fmt(cur.food.length)],
  ]);
}

function playFrame(now) {
  playScene(now);
  if (game.cur && (game.running || game.cur.capsules.length)) requestAnimationFrame(playFrame);
}

async function playTick(session) {
  if (session !== game.session || !game.running) return;
  const next = await py.call('gameStep', { wanted: game.wanted, current: game.facing });
  if (session !== game.session) return;
  game.prev = game.cur;
  game.cur = next;
  game.tickAt = performance.now();
  playHud();
  if (next.win || next.lose) {
    game.running = false;
    game.overlay.hidden = false;
    game.overlay.classList.toggle('lost', next.lose);
    game.overlay.textContent = next.win
      ? `You cleared the maze! Score ${fmt(next.score)}`
      : `Caught by a ghost. Score ${fmt(next.score)}`;
    setStatus(next.win ? 'You won. Pick another maze or play again.' : 'Game over. Press Play again to retry.');
    game.form.querySelector('.run').textContent = 'Play again';
    return;
  }
  setTimeout(() => playTick(session), TICK_MS);
}

async function playStart() {
  const f = game.form;
  game.session += 1;
  const session = game.session;
  game.running = false;
  const [board, snapshot] = await Promise.all([
    getBoard(f.layout.value),
    py.call('gameNew', { layout: f.layout.value, ghosts: f.ghosts.value, count: Number(f.count.value) }),
  ]);
  game.renderer.setBoard(board);
  game.renderer.fit(...boardSpace(game.canvas));
  game.prev = null;
  game.cur = snapshot;
  game.wanted = 'West';
  game.facing = 'West';
  game.overlay.hidden = true;
  game.running = true;
  game.tickAt = performance.now();
  f.querySelector('.run').textContent = 'Restart game';
  playHud();
  setStatus('Game on. Use the arrow keys or W A S D.');
  game.canvas.focus?.();
  requestAnimationFrame(playFrame);
  setTimeout(() => playTick(session), TICK_MS);
}

async function playPreview() {
  game.session += 1;
  const session = game.session;
  game.running = false;
  const board = await getBoard(game.form.layout.value);
  if (session !== game.session) return;
  game.renderer.setBoard(board);
  game.renderer.fit(...boardSpace(game.canvas));
  game.cur = null;
  game.renderer.draw({ food: board.food, capsules: board.capsules, pacman: startOf(board) });
  game.overlay.hidden = false;
  game.overlay.classList.remove('lost');
  game.overlay.textContent = 'Press Start game';
  game.hud.innerHTML = hudHTML([['Score', '0', 'good'], ['Dots left', fmt(board.food.length)]]);
  game.form.querySelector('.run').textContent = 'Start game';
}

function setupPlay() {
  const f = game.form;
  fillSelect(f.layout, PLAY_LAYOUTS.map((l) => [l, l]), 'mediumClassic');
  f.layout.addEventListener('change', playPreview);
  f.addEventListener('submit', (event) => {
    event.preventDefault();
    playStart().catch((error) => setStatus(`Could not start the game: ${error.message}`, true));
  });
  window.addEventListener('keydown', (event) => {
    if (document.getElementById('play').hidden || !game.running) return;
    const dir = KEYS[event.key];
    if (!dir) return;
    event.preventDefault();
    game.wanted = dir;
  });
  document.querySelectorAll('.dpad button').forEach((button) => {
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      game.wanted = button.dataset.dir;
    });
  });
}

// ------------------------------------------------------------------ tabs

const MODES = ['visualize', 'compare', 'play'];
const shown = new Set();

function showMode(mode) {
  for (const m of MODES) {
    const tab = document.getElementById(`tab-${m}`);
    const active = m === mode;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    document.getElementById(m).hidden = !active;
  }
  if (mode !== 'play') { game.running = false; game.session += 1; }
  if (!shown.has(mode)) {
    shown.add(mode);
    const first = { visualize: vizShowBoard, compare: cmpShowBoards, play: playPreview }[mode];
    py.ready.then(first).catch(() => {});
  } else if (mode === 'play' && !game.running) {
    py.ready.then(playPreview).catch(() => {});
  }
  history.replaceState(null, '', `#${mode}`);
}

function setupTabs() {
  const tabs = MODES.map((m) => document.getElementById(`tab-${m}`));
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => showMode(MODES[i]));
    tab.addEventListener('keydown', (event) => {
      const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
      if (!step) return;
      const next = (i + step + MODES.length) % MODES.length;
      tabs[next].focus();
      showMode(MODES[next]);
    });
  });
  const initial = MODES.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'visualize';
  showMode(initial);
}

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (!document.getElementById('visualize').hidden && viz.renderer.board) {
      viz.renderer.fit(...boardSpace(viz.canvas));
      viz.player.tracks.length ? viz.player.draw(performance.now()) : vizShowBoard();
    }
    if (!document.getElementById('compare').hidden && cmp.sides[0].renderer.board) {
      cmp.sides.forEach((s) => s.renderer.fit(...boardSpace(s.canvas, 0.75)));
      cmp.player.tracks.length ? cmp.player.draw(performance.now()) : cmpShowBoards();
    }
    if (!document.getElementById('play').hidden && game.renderer.board) {
      game.renderer.fit(...boardSpace(game.canvas));
      if (game.cur) playScene(performance.now()); else playPreview();
    }
  }, 150);
});

setupVisualize();
setupCompare();
setupPlay();
setupTabs();
