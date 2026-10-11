
// Throwaway visual + behavioural check for the settings cog (not part of the gate).
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';

const PORT = 4174;
const APP = `http://127.0.0.1:${PORT}/`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--host', '127.0.0.1', '--strictPort'], { stdio: 'ignore', detached: true });
const up = await (async () => { for (let i = 0; i < 60; i += 1) { try { if ((await fetch(APP)).ok) return true; } catch {} await sleep(500); } return false; })();
if (!up) { console.log('FAIL preview never answered'); process.exit(1); }

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = []; const requests = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('request', (r) => requests.push(r.url()));

const results = [];
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`); };

await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__kg && window.__kg.sigma.getGraph().order > 0, null, { timeout: 60000 });
check('audit not fetched on a plain page view', !requests.some((u) => u.includes('audit.json')));
check('graph file still fetched exactly once', requests.filter((u) => u.includes('data/graph.json')).length === 1);

const cog = page.locator('button[aria-label="Settings"]');
check('cog visible top right', await cog.isVisible());
const box = await cog.boundingBox();
check('cog sits in the top-right corner', box.x > 1200 && box.y < 40, JSON.stringify(box));
const overlap = await page.evaluate(() => {
  const c = document.querySelector('button[aria-label="Settings"]').getBoundingClientRect();
  return [...document.querySelectorAll('button, input')].filter((el) => !el.getAttribute('aria-label')?.includes('Settings'))
    .some((el) => { const r = el.getBoundingClientRect(); return r.left < c.right && r.right > c.left && r.top < c.bottom && r.bottom > c.top; });
});
check('nothing under the cog', !overlap);

await cog.click();
await page.waitForSelector('div[role="dialog"]', { timeout: 5000 });
check('dialog opened', await page.isVisible('div[role="dialog"][aria-label="Settings"]'));
await page.waitForFunction(() => /Floors/i.test(document.querySelector('div[role="dialog"]')?.innerText || ''), null, { timeout: 10000 });
const t = await page.locator('div[role="dialog"]').innerText();
check('nav lists Graph audit', /Graph audit/.test(t));
check('only one settings section for now', (t.match(/Graph audit/g) || []).length === 1, t.slice(0, 60));
check('floors rendered', /all floors hold|warning/i.test(t));
check('subject time bars rendered', /subject time/i.test(t) && /\/164/.test(t));
check('phi<->tech card present', /philosophy/i.test(t) && /technology/i.test(t));
check('references card present', /source pointers/i.test(t));
check('identity examples present', /merleau|aider|anthropic/i.test(t));
check('warn badge shown', await page.locator('div[role="dialog"] >> text=/^warn$/').count() > 0);
check('audit fetched after opening', requests.filter((u) => u.includes('audit.json')).length === 1);


await page.keyboard.press('Escape');
await sleep(250);
check('escape closes the dialog', (await page.locator('div[role="dialog"]').count()) === 0);
await cog.click();
await page.waitForSelector('div[role="dialog"]', { timeout: 5000 });
check('cog reopens it', await page.isVisible('div[role="dialog"]'));
const closeBtn = page.locator('div[role="dialog"] button[title="Close"]');
await closeBtn.click();
await sleep(200);
check('close button closes it', (await page.locator('div[role="dialog"]').count()) === 0);
await cog.click();
await page.waitForSelector('div[role="dialog"]', { timeout: 5000 });
await page.mouse.click(40, 450); // backdrop, away from the panel
await sleep(250);
check('backdrop click closes it', (await page.locator('div[role="dialog"]').count()) === 0);
check('audit still fetched only once while reopening', requests.filter((u) => u.includes('audit.json')).length === 1);
await cog.click();
await page.waitForSelector('div[role="dialog"]', { timeout: 5000 });
await sleep(300);
await page.screenshot({ path: '/tmp/kg_settings.png' });
const scroller = page.locator('div[role="dialog"] div[style*="overflow-y"]');
await scroller.evaluate((el) => { el.scrollTop = el.scrollHeight; });
await sleep(250);
await page.screenshot({ path: '/tmp/kg_settings_bottom.png' });

// graph still interactive with the dialog closed
await page.mouse.move(700, 400); await sleep(200);
check('graph untouched by the settings round trip', await page.evaluate(() => window.__kg.sigma.getGraph().order) > 0);
check('zero console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(results.join('\n'));
await browser.close();
try { process.kill(-server.pid); } catch {}
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
