/**
 * PAR-78 acceptance gate for the rebuilt explorer.
 *
 *   npm run gate          # builds nothing; expects `npm run build` + this script's own preview
 *
 * It starts `vite preview` on its own, loads the app in Chromium, and asserts the contract that
 * Phase 0 is responsible for: the graph in the browser is the graph the v2 API described, in the
 * layout the server computed, with camera focus that actually lands on the node and no render
 * storm. Expected values are derived from the API response rather than hardcoded, so the gate
 * stays meaningful as the vault grows; the current prod baseline (1185 nodes / 1592 edges from
 * 2019 relations) is printed for the record.
 *
 * Overrides: KG_URL (default http://127.0.0.1:4173/), KG_API (default the prod v2 service).
 */
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';

const API = process.env.KG_API || 'https://research-2-dqvr2eoj2a-uc.a.run.app';
const PORT = 4173;
const APP = process.env.KG_URL || `http://127.0.0.1:${PORT}/`;

const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
  if (!ok) failures.push(name);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForUrl(url, tries = 60) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await sleep(500);
  }
  return false;
}

// --- what the API says the map should be ------------------------------------
// Cloud Run scales to zero, so the very first request of a run can fail. Retry the baseline,
// but fail loudly with the status/body: a TypeError here once read like a broken graph.
async function fetchBaseline(tries = 8) {
  let last = 'no attempt';
  for (let i = 0; i < tries; i += 1) {
    try {
      const res = await fetch(`${API}/v2/graph?limit=20000`);
      if (!res.ok) {
        last = `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`;
      } else {
        const ref = await res.json();
        if (!Array.isArray(ref.nodes) || !Array.isArray(ref.edges)) {
          throw new Error(`unexpected /v2/graph shape: ${JSON.stringify(ref).slice(0, 200)}`);
        }
        return ref;
      }
    } catch (err) {
      last = String(err).slice(0, 200);
    }
    await sleep(1500);
  }
  throw new Error(`cannot read the API baseline from ${API}: ${last}`);
}
const ref = await fetchBaseline();
const positioned = ref.nodes.filter((n) => Number.isFinite(n.x) && Number.isFinite(n.y));
const ids = new Set(positioned.map((n) => n.id));
const pairs = new Set(
  ref.edges.filter((e) => ids.has(e.source) && ids.has(e.target)).map((e) => `${e.source}>${e.target}`),
);
const expect = { nodes: positioned.length, edges: pairs.size, relations: ref.edges.length };
console.log(`API baseline: ${expect.nodes} nodes, ${expect.edges} edges from ${expect.relations} relations\n`);

const alreadyUp = await (await fetch(APP).then((r) => r.ok).catch(() => false));
const server = alreadyUp
  ? null
  : spawn('npx', ['vite', 'preview', '--port', String(PORT), '--host', '127.0.0.1', '--strictPort'], {
      stdio: 'ignore',
      detached: true,
    });
const up = await waitForUrl(APP);
if (up) console.log(`app under test: ${APP}${alreadyUp ? ' (reusing running preview)' : ''}`);
if (!up) {
  console.log('FAIL  preview server never answered');
  failures.push('preview server');
}

const browser = await chromium.launch();
const page = up ? await browser.newPage({ viewport: { width: 1440, height: 900 } }) : null;

const errors = [];
const apiCalls = [];
if (page) {
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('request', (r) => {
    if (r.url().startsWith(API)) apiCalls.push(r.url().replace(API, ''));
  });
}

try {
  if (!page) throw new Error('no page');
  await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 });
  // The renderer must mount before the data arrives (eager mount); the graph fills in after.
  await page.waitForFunction(() => window.__kg && window.__kg.sigma.getGraph().order > 0, null, { timeout: 60000 });

  const live = await page.evaluate(() => {
    const g = window.__kg.sigma.getGraph();
    let finite = 0;
    let withDisplay = 0;
    g.forEachNode((n, a) => {
      if (Number.isFinite(a.x) && Number.isFinite(a.y)) finite += 1;
      const d = window.__kg.sigma.getNodeDisplayData(n);
      if (d && Number.isFinite(d.x) && Number.isFinite(d.y)) withDisplay += 1;
    });
    return {
      order: g.order,
      size: g.size,
      finite,
      withDisplay,
      widestMerge: g.reduceEdges((best, _a, rel) => ((rel.relations || []).length > (best || []).length ? rel.relations : best), null),
      sample: g.mapNodes((n, a) => ({ n, x: a.x, y: a.y })).slice(0, 3),
      api: window.__kg.api,
    };
  });

  check('node count matches the API', live.order === expect.nodes, `${live.order} of ${expect.nodes}`);
  check('edge count is one per node pair', live.size === expect.edges, `${live.size} of ${expect.edges} (API sent ${expect.relations} relations)`);
  check('merged edge keeps every relation', (live.widestMerge || []).length > 1, JSON.stringify(live.widestMerge));
  check('every node has finite x/y', live.finite === live.order, `${live.finite}/${live.order}`);
  check('every node has finite display data', live.withDisplay === live.order, `${live.withDisplay}/${live.order}`);

  const byId = Object.fromEntries(ref.nodes.map((n) => [n.id, n]));
  check(
    'positions are the server layout, not recomputed',
    live.sample.every((s) => byId[s.n] && Math.abs(byId[s.n].x - s.x) < 1e-6 && Math.abs(byId[s.n].y - s.y) < 1e-6),
    JSON.stringify(live.sample[0]),
  );
  check('app targets the v2 service', live.api === API, live.api);

  const legacy = apiCalls.filter((u) => !/^\/(v2\/|health)/.test(u));
  check('no legacy endpoint calls', legacy.length === 0, legacy.slice(0, 2).join(' '));
  console.log(`      endpoints used: ${[...new Set(apiCalls.map((u) => u.split('?')[0]))].join(', ')}`);

  const statsText = await page.evaluate(() => document.body.innerText.replace(/\n/g, '|'));
  check('stats bar reports the live map', new RegExp(`Nodes: ${expect.nodes}`).test(statsText) && new RegExp(`Edges: ${expect.edges}`).test(statsText), statsText.slice(0, 90));

  // --- selection: a real click must focus the camera on the node -------------
  const target = [...ids].sort((a, b) => byId[b].degree - byId[a].degree)[0];
  const before = await page.evaluate((uid) => {
    const s = window.__kg.sigma;
    const c = s.getContainer();
    const r = c.getBoundingClientRect();
    const p = s.graphToViewport({ x: s.getGraph().getNodeAttribute(uid, 'x'), y: s.getGraph().getNodeAttribute(uid, 'y') });
    return { ratio: s.getCamera().getState().ratio, x: r.left + p.x, y: r.top + p.y, disp: s.getNodeDisplayData(uid) };
  }, target);
  check('nodes live in graph space, so the camera must convert', Math.abs(before.disp.x - byId[target].x) > 1, `display ${before.disp.x.toFixed(3)} vs graph ${byId[target].x.toFixed(1)}`);

  if (!Number.isFinite(before.x) || !Number.isFinite(before.y)) {
    throw new Error(`node ${target} is not clickable on the stage: ${JSON.stringify(before)}`);
  }
  await page.mouse.move(before.x, before.y);
  await sleep(250);
  await page.mouse.click(before.x, before.y);
  await page.waitForFunction((was) => Math.abs(window.__kg.sigma.getCamera().getState().ratio - was) > 0.05, before.ratio, { timeout: 8000 }).catch(() => {});
  await sleep(500);

  const refDetail = await (await fetch(`${API}/v2/node/${encodeURIComponent(target)}`)).json();
  const after = await page.evaluate((uid) => {
    const s = window.__kg.sigma;
    const c = s.getContainer();
    const p = s.graphToViewport({ x: s.getGraph().getNodeAttribute(uid, 'x'), y: s.getGraph().getNodeAttribute(uid, 'y') });
    return {
      ratio: s.getCamera().getState().ratio,
      offCentre: Math.hypot(p.x - c.clientWidth / 2, p.y - c.clientHeight / 2),
      panelText: (document.querySelector('div[style*="border-left"]') || { innerText: '' }).innerText,
    };
  }, target);

  check('camera zoomed in on click', after.ratio < before.ratio * 0.9, `${before.ratio.toFixed(3)} -> ${after.ratio.toFixed(3)} (clicked ${before.x.toFixed(0)},${before.y.toFixed(0)})`);
  // PAR-21 / PAR-58: writing graph coordinates into the camera parks it off-stage and the
  // canvas renders black. A node at the exact centre cannot be off-stage.
  check('focused node lands on the stage centre', after.offCentre < 60, `${after.offCentre.toFixed(0)}px off centre`);
  check('detail panel lists every neighbour', (after.panelText.match(/relationships \((\d+)\)/i) || [])[1] === String(refDetail.neighbours.length), `panel ${after.panelText.match(/relationships \((\d+)\)/i)?.[1]} vs API ${refDetail.neighbours.length}`);
  check('detail panel names the selected node', after.panelText.includes(byId[target].name), target);

  await page.keyboard.press('Escape');
  await sleep(300);
  check('escape clears the selection', await page.evaluate(() => !/relationships \(/i.test(document.body.innerText)));

  // --- hover must repaint through reducers, never by mutating the graph ------
  const orderBefore = live.order;
  await page.mouse.move(before.x, before.y);
  await sleep(400);
  await page.mouse.move(before.x + 220, before.y + 160);
  await sleep(400);
  check('hover leaves the graph untouched', (await page.evaluate(() => window.__kg.sigma.getGraph().order)) === orderBefore);

  // --- filtering is an API param -------------------------------------------
  const groups = await page.evaluate(() => {
    const set = new Set();
    window.__kg.sigma.getGraph().forEachNode((_, a) => set.add(a.nodeType));
    return [...set];
  });
  const hidden = groups[0];
  const callsBefore = apiCalls.length;
  await page.click(`button[title^="Toggle ${hidden}"]`);
  await sleep(6000);
  const filterCalls = apiCalls.slice(callsBefore).filter((u) => u.startsWith('/v2/graph'));
  check('hiding a group fires exactly one filtered request', filterCalls.length === 1 && filterCalls[0].includes('groups='), `${filterCalls.length}: ${(filterCalls[0] || 'none').slice(0, 80)}`);
  const filtered = await page.evaluate((h) => {
    const g = new Set();
    let bad = 0;
    window.__kg.sigma.getGraph().forEachNode((_, a) => {
      g.add(a.nodeType);
      if (!Number.isFinite(a.x) || !Number.isFinite(a.y)) bad += 1;
    });
    return { order: window.__kg.sigma.getGraph().order, groups: g.size, gone: !g.has(h), bad };
  }, hidden);
  check('filtered map drops that group and stays positioned', filtered.gone && filtered.order < expect.nodes && filtered.bad === 0, `${hidden} off -> ${filtered.order} nodes, ${filtered.groups} groups`);

  await page.click(`button[title^="Toggle ${hidden}"]`);
  await sleep(6000);
  const restored = await page.evaluate(() => ({ order: window.__kg.sigma.getGraph().order, size: window.__kg.sigma.getGraph().size }));
  check('restoring the group returns the full map', restored.order === expect.nodes && restored.size === expect.edges, `${restored.order}/${restored.size}`);

  check('no React update-depth error', !errors.some((e) => /Maximum update depth/i.test(e)));
  check('zero console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.screenshot({ path: '/tmp/kg_gate.png' });
} catch (err) {
  check('gate ran to completion', false, String(err && err.message ? err.message : err));
} finally {
  await browser.close();
  try {
    if (server) process.kill(-server.pid);
  } catch {
    /* already gone */
  }
  console.log(failures.length ? `\nGATE FAILED: ${failures.join('; ')}` : '\nGATE PASSED');
  process.exit(failures.length ? 1 : 0);
}
