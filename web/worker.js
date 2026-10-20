// Runs Pyodide off the main thread so a long search never freezes the page.
// The page can terminate this worker to stop a search that runs too long.
importScripts('https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js');

const PROJECT_FILES = [
  'util.py', 'game.py', 'layout.py', 'pacman.py', 'search.py',
  'searchAgents.py', 'ghostAgents.py',
];

let pyodide = null;
const loadedLayouts = new Set();

async function fetchText(url) {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Could not load ${url} (${response.status})`);
  return response.text();
}

// Loading stages, so the page can show a real progress bar.
const progress = (stage, done = 0, total = 0) => self.postMessage({ id: 'progress', stage, done, total });

async function boot() {
  progress('runtime');
  pyodide = await loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/' });
  pyodide.FS.mkdirTree('/project/layouts');
  const root = new URL('../', self.location.href);
  const files = [...PROJECT_FILES.map((f) => [f, new URL(f, root)]),
    ['bridge.py', new URL('bridge.py', self.location.href)]];
  let loaded = 0;
  progress('files', 0, files.length);
  await Promise.all(files.map(async ([name, url]) => {
    pyodide.FS.writeFile(`/project/${name}`, await fetchText(url));
    loaded += 1;
    progress('files', loaded, files.length);
  }));
  progress('import');
  pyodide.runPython(`
import os, sys
os.chdir('/project')
sys.path.insert(0, '/project')
import bridge
`);
}

// Layout names are plain words like "mediumMaze"; refuse anything else before
// it reaches a URL or a file path.
const LAYOUT_NAME = /^[A-Za-z0-9]+$/;

async function ensureLayout(name) {
  if (!LAYOUT_NAME.test(String(name))) throw new Error(`Unknown maze: ${name}`);
  if (loadedLayouts.has(name)) return;
  const url = new URL(`../layouts/${name}.lay`, self.location.href);
  pyodide.FS.writeFile(`/project/layouts/${name}.lay`, await fetchText(url));
  loadedLayouts.add(name);
}

const bridge = (fn, ...args) => JSON.parse(pyodide.globals.get('bridge')[fn](...args));

const handlers = {
  async board({ layout }) {
    await ensureLayout(layout);
    return bridge('board', layout);
  },
  async search({ config }) {
    await ensureLayout(config.layout);
    return bridge('run_search', JSON.stringify(config));
  },
  async source({ key }) {
    return pyodide.globals.get('bridge').source(key);
  },
  async gameNew({ layout, ghosts, count }) {
    await ensureLayout(layout);
    return bridge('game_new', layout, ghosts, count);
  },
  async gameStep({ wanted, current }) {
    return bridge('game_step', wanted, current);
  },
};

const ready = boot();

self.onmessage = async ({ data }) => {
  const { id, type, payload } = data;
  try {
    await ready;
    const result = await handlers[type](payload || {});
    self.postMessage({ id, ok: true, result });
  } catch (error) {
    self.postMessage({ id, ok: false, error: String(error && error.message ? error.message : error) });
  }
};

ready.then(
  () => self.postMessage({ id: 'ready', ok: true }),
  (error) => self.postMessage({ id: 'ready', ok: false, error: String(error) }),
);
