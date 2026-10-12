/** Independent Chromium UI verification.
 * npm install --prefix /tmp/extreme-browser-verification playwright
 * node browser.test.mjs
 * Override PLAYWRIGHT_MODULE or CHROMIUM_PATH for other installations.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const modulePath = process.env.PLAYWRIGHT_MODULE || '/tmp/extreme-browser-verification/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(modulePath).href);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/favicon.ico') { res.writeHead(204).end(); return; }
    const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const baseURL = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const results = [];
const expression = calc => calc.getByRole('textbox', { name: 'Expression', exact: true });
async function run(calc, text) {
  await expression(calc).fill(text);
  await expression(calc).press('Enter');
  return (await calc.locator('#result').textContent()).trim();
}
async function mode(calc, name) { await calc.getByRole('tab', { name, exact: true }).click(); }
// Observe real canvas draw calls without replacing their behavior.
async function recordCanvas(page) {
  await page.addInitScript(() => {
    window.__canvasPaths = [];
    const proto = CanvasRenderingContext2D.prototype;
    for (const method of ['beginPath', 'moveTo', 'lineTo', 'stroke', 'clearRect']) {
      const original = proto[method];
      proto[method] = function (...args) {
        if (window.__canvasPaths.length < 100000) {
          window.__canvasPaths.push({ method, args, color: this.strokeStyle, width: this.canvas.width, height: this.canvas.height });
        }
        return original.apply(this, args);
      };
    }
  });
}
async function check(name, fn) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.setDefaultTimeout(5000);
  try {
    await recordCanvas(page);
    await page.goto(baseURL);
    await page.waitForFunction(() => customElements.get('extreme-calculator'));
    const calc = page.locator('extreme-calculator').first();
    await fn({ page, calc, context });
    assert.deepEqual(errors, [], 'No console or uncaught browser errors');
    results.push({ name, passed: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, passed: false, error: error.stack });
    console.error(`FAIL ${name}\n${error.stack}`);
    if (errors.length) console.error(`Browser errors: ${JSON.stringify(errors)}`);
  } finally { await context.close(); }
}

try {
  // The component must be ready before its UI contracts can be inspected.
  for (const name of ['index.html', 'calculator.js', 'engine.js']) await stat(resolve(root, name));
  await check('custom element mounts its shadow DOM', async ({ calc }) => {
    assert.equal(await calc.evaluate(el => Boolean(el.shadowRoot)), true);
    assert.ok(await calc.locator('button').count() > 0, 'Component has interactive controls');
  });
  await check('every registered function executes through the UI and survives full JSON log audit', async ({ calc, page }) => {
    const { FUNCTIONS } = await import(pathToFileURL(resolve(root, 'engine.js')).href);
    const audit = await calc.evaluate((el, functions) => functions.map(fn => {
      const before = el.history.length;
      const result = el.calculate(fn.example);
      const entry = el.history.at(-1);
      return {
        function: fn.name,
        expression: fn.example,
        returnedValue: result,
        displayedResult: el.shadowRoot.querySelector('#result').textContent,
        displayedError: el.shadowRoot.querySelector('#result').classList.contains('error'),
        loggedExactlyOnce: el.history.length === before + 1,
        entry,
      };
    }), FUNCTIONS);
    assert.ok(FUNCTIONS.length >= 47, 'Expected full function registry');
    for (const row of audit) {
      assert.equal(row.displayedError, false, `${row.function}: ${row.displayedResult}`);
      assert.equal(row.loggedExactlyOnce, true, `${row.function} logs exactly once`);
      assert.equal(row.entry.ok, true, `${row.function} logs success`);
      assert.equal(row.entry.expression, row.expression);
      assert.equal(row.entry.result, row.displayedResult);
      assert.equal(row.entry.kind, 'calculation');
      assert.equal(row.entry.angle, 'deg');
      assert.ok(Number.isFinite(Date.parse(row.entry.timestamp)));
    }
    assert.equal(await calc.locator('.entry').count(), Math.min(50, FUNCTIONS.length));
    const pending = page.waitForEvent('download');
    await calc.getByRole('button', { name: 'Export calculation log' }).click();
    const downloaded = await pending;
    const exported = JSON.parse(await readFile(await downloaded.path(), 'utf8'));
    assert.equal(exported.entries.length, FUNCTIONS.length);
    assert.deepEqual(exported.entries, audit.map(row => row.entry));
    await page.reload();
    assert.equal(await calc.evaluate(el => el.history.length), FUNCTIONS.length);
    assert.deepEqual(await calc.evaluate(el => el.history), exported.entries);
    await mkdir(resolve(root, 'verification'), { recursive: true });
    await writeFile(resolve(root, 'verification/function-audit.json'), JSON.stringify({
      ...exported,
      verification: {
        verifiedAt: new Date().toISOString(),
        browser: await browser.version(),
        functionCount: FUNCTIONS.length,
        successfulRuns: audit.filter(row => row.entry.ok && !row.displayedError && row.loggedExactlyOnce).length,
        exportMatchesComponentLog: true,
        reloadPreservesCompleteLog: true,
        cases: audit.map(({ entry, ...row }) => row),
        scope: 'Every registry example through connected component calculate(); display, one history entry per run, export and reload verified. Independent engine tests assess numerical correctness.',
      },
    }, null, 2) + '\n');
    console.log(`  Audited all ${FUNCTIONS.length} function examples, exported entries and persisted reload`);
  });
  await check('desktop screenshot and local-only document requests', async ({ page }) => {
    const external = [];
    page.on('request', req => { if (!req.url().startsWith(baseURL) && !req.url().startsWith('blob:')) external.push(req.url()); });
    await page.reload();
    await page.locator('extreme-calculator canvas').waitFor();
    if (process.env.CAPTURE_SCREENSHOTS) await page.screenshot({ path: '/tmp/extreme-verification-desktop.png', fullPage: true });
    assert.deepEqual(external, []);
  });
  await check('scientific expressions, errors, angle modes and answer reuse', async ({ calc }) => {
    assert.equal(await run(calc, '(2+3)*4'), '20');
    assert.equal(await run(calc, 'ans/2'), '10');
    assert.equal(await run(calc, 'sin(30)'), '0.5');
    await calc.getByRole('button', { name: 'RAD', exact: true }).click();
    assert.equal(await run(calc, 'sin(pi/2)'), '1');
    await calc.getByRole('button', { name: 'GRAD', exact: true }).click();
    assert.equal(await run(calc, 'cos(200)'), '-1');
    assert.equal(await run(calc, '5! + sqrt(81)'), '129');
    await run(calc, 'sqrt(-1)');
    assert.ok(await calc.locator('#result').evaluate(el => el.classList.contains('error')));
    assert.equal(await run(calc, '6*7'), '42');
  });
  await check('keypad, insertion, backspace, clear, keyboard recall and tab navigation', async ({ calc }) => {
    for (const key of ['2', '+', '3', 'Calculate']) await calc.getByRole('button', { name: key, exact: true }).click();
    assert.equal(await calc.locator('#result').textContent(), '5');
    await calc.getByRole('button', { name: 'Clear expression', exact: true }).click();
    assert.equal(await expression(calc).inputValue(), '');
    await expression(calc).press('ArrowUp');
    assert.equal(await expression(calc).inputValue(), '2+3');
    await calc.getByRole('button', { name: 'Backspace', exact: true }).click();
    assert.equal(await expression(calc).inputValue(), '2+');
    await expression(calc).fill('12');
    await expression(calc).evaluate(el => { el.focus(); el.setSelectionRange(1, 1); });
    await calc.getByRole('button', { name: '3', exact: true }).click();
    assert.equal(await expression(calc).inputValue(), '132');
    const tab = calc.getByRole('tab', { name: 'Calculator', exact: true });
    await tab.focus(); await tab.press('ArrowRight');
    assert.equal(await calc.getByRole('tab', { name: 'Graph', exact: true }).getAttribute('aria-selected'), 'true');
  });
  await check('matrix and binary logic modes and examples', async ({ calc }) => {
    await mode(calc, 'Matrices');
    await calc.getByRole('button', { name: 'Determinant', exact: true }).click();
    await expression(calc).press('Enter');
    assert.equal(await calc.locator('#result').textContent(), '-2');
    assert.match(await run(calc, '[[1,2],[3,4]] * [[2,0],[0,2]]'), /2[\s\S]*4[\s\S]*6[\s\S]*8/);
    await run(calc, 'inverse([[1,2],[2,4]])');
    assert.match(await calc.locator('#result').textContent(), /singular/i);
    await mode(calc, 'Logic');
    await calc.getByRole('button', { name: 'AND', exact: true }).click();
    await expression(calc).press('Enter');
    assert.equal(await calc.locator('#result').textContent(), '8');
    assert.match(await calc.locator('#logic-result').textContent(), /1000/);
    assert.equal(await run(calc, 'shl(1,4)'), '16');
    assert.equal(await run(calc, 'not(0)'), '-1');
  });
  await check('help search, examples, dialog Escape, close icons and focus return', async ({ calc, page }) => {
    const help = calc.getByRole('button', { name: 'Open help', exact: true });
    await help.click();
    assert.equal(await calc.locator('#help').evaluate(el => el.open), true);
    await calc.getByRole('searchbox', { name: 'Search functions' }).fill('atan2');
    assert.match(await calc.locator('#help-list').textContent(), /atan2/);
    await page.keyboard.press('Escape');
    await calc.locator('#help').waitFor({ state: 'hidden' });
    assert.equal(await calc.locator('#help').evaluate(el => el.open), false);
    assert.equal(await help.evaluate(el => el.getRootNode().activeElement === el), true);
    await help.click();
    await calc.getByRole('button', { name: 'Close help' }).click();
    assert.equal(await calc.locator('#help').evaluate(el => el.open), false);
    const settings = calc.getByRole('button', { name: 'Open settings' });
    await settings.click();
    await calc.getByLabel('Display precision', { exact: false }).selectOption('6');
    await calc.getByRole('combobox', { name: 'Angle unit' }).selectOption('rad');
    await page.keyboard.press('Escape');
    await calc.locator('#settings').waitFor({ state: 'hidden' });
    assert.equal(await settings.evaluate(el => el.getRootNode().activeElement === el), true);
    assert.equal(await run(calc, '1/3'), '0.333333');
    assert.equal(await run(calc, 'sin(pi/2)'), '1');
    await settings.click();
    await calc.getByRole('button', { name: 'Close settings' }).click();
    assert.equal(await calc.locator('#settings').evaluate(el => el.open), false);
  });
  await check('injection stays inert, oversized input fails safely, recovery works', async ({ calc, page }) => {
    const payload = '<img src=x onerror="window.__injected=1">';
    await run(calc, payload);
    assert.equal(await page.evaluate(() => window.__injected), undefined);
    assert.equal(await calc.locator('img').count(), 0);
    assert.ok((await calc.locator('#history-list').textContent()).includes(payload));
    await expression(calc).evaluate(el => { el.value = '1+'.repeat(5000) + '1'; });
    await expression(calc).press('Enter');
    assert.ok(await calc.locator('#result').evaluate(el => el.classList.contains('error')));
    assert.equal(await run(calc, '2+2'), '4');
  });
  await check('history logs successes and failures, persists, reuses, exports, and clears', async ({ calc, page }) => {
    await run(calc, '17*19');
    await run(calc, 'sqrt(-1)');
    assert.match(await calc.locator('#history-count').textContent(), /2/);
    await page.reload();
    assert.match(await calc.locator('#history-count').textContent(), /2/);
    await calc.locator('#history-list button').filter({ hasText: '17*19' }).click();
    assert.equal(await expression(calc).inputValue(), '17*19');
    const pending = page.waitForEvent('download');
    await calc.getByRole('button', { name: 'Export calculation log' }).click();
    const download = await pending;
    const data = JSON.parse(await readFile(await download.path(), 'utf8'));
    const entries = Array.isArray(data) ? data : data.history || data.entries || data.runs;
    assert.equal(entries.length, 2);
    assert.ok(entries.some(e => e.expression === '17*19' && e.ok === true));
    assert.ok(entries.some(e => e.expression === 'sqrt(-1)' && e.ok === false));
    assert.ok(entries.every(e => Number.isFinite(Date.parse(e.timestamp))));
    await calc.locator('#clear-history').click();
    assert.match(await calc.locator('#history-count').textContent(), /2/);
    await calc.locator('#clear-history').click();
    assert.match(await calc.locator('#history-count').textContent(), /0/);
    await page.reload();
    assert.match(await calc.locator('#history-count').textContent(), /0/);
  });
  await check('360px responsive layout across modes and dialogs', async ({ calc, page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    if (process.env.CAPTURE_SCREENSHOTS) await page.screenshot({ path: '/tmp/extreme-verification-mobile.png', fullPage: true });
    for (const name of ['Calculator', 'Graph', 'Matrices', 'Logic']) {
      await mode(calc, name);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${name} does not overflow`);
      for (const target of [calc.locator('.shell'), calc.locator('canvas')]) {
        const box = await target.boundingBox();
        assert.ok(box.width > 100 && box.x >= 0 && box.x + box.width <= 360);
      }
    }
    await calc.getByRole('button', { name: 'Open help' }).click();
    const box = await calc.locator('#help').boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 360);
  });
  await check('multiple components retain independent expressions, modes, answers and logs', async ({ page, calc }) => {
    await page.evaluate(() => document.body.append(document.createElement('extreme-calculator')));
    const second = page.locator('extreme-calculator').nth(1);
    assert.equal(await run(calc, '10+5'), '15');
    assert.equal(await run(second, '9*9'), '81');
    await second.getByRole('button', { name: 'RAD', exact: true }).click();
    assert.equal(await calc.getByRole('button', { name: 'DEG', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.equal(await run(calc, 'ans+1'), '16');
    assert.equal(await run(second, 'ans+1'), '82');
    assert.ok(!(await second.locator('#history-list').textContent()).includes('10+5'));
    await mode(second, 'Logic');
    assert.equal(await calc.getByRole('tab', { name: 'Calculator', exact: true }).getAttribute('aria-selected'), 'true');
  });
  await check('graph rendering, bounds errors, plot logging, zoom, pan, reset and trace', async ({ page, calc }) => {
    await mode(calc, 'Graph');
    await calc.getByRole('textbox', { name: 'Curve 1', exact: true }).fill('x^2');
    await calc.getByRole('textbox', { name: 'Curve 2', exact: true }).fill('');
    for (const [name, value] of [['x min', '-5'], ['x max', '5'], ['y min', '-1'], ['y max', '25']]) {
      await calc.getByRole('spinbutton', { name, exact: true }).fill(value);
    }
    await page.evaluate(() => { window.__canvasPaths = []; });
    await calc.getByRole('button', { name: 'Plot curves' }).click();
    await page.waitForFunction(() => window.__canvasPaths.filter(p => p.method === 'lineTo').length > 50);
    assert.match(await calc.locator('#graph-legend').textContent(), /x\^2/);
    assert.ok((await calc.locator('#history-list').textContent()).includes('x^2'));
    const initial = await calc.locator('#graph-range').textContent();
    await calc.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await page.waitForFunction(old => document.querySelector('extreme-calculator').shadowRoot.querySelector('#graph-range').textContent !== old, initial);
    const zoomed = await calc.locator('#graph-range').textContent();
    await calc.locator('canvas').focus(); await calc.locator('canvas').press('ArrowRight');
    await page.waitForFunction(old => document.querySelector('extreme-calculator').shadowRoot.querySelector('#graph-range').textContent !== old, zoomed);
    await calc.getByRole('button', { name: 'Reset graph view', exact: true }).click();
    await calc.locator('canvas').hover({ position: { x: 120, y: 100 } });
    assert.match(await calc.locator('#trace').textContent(), /x/i);
    await calc.getByRole('spinbutton', { name: 'x min', exact: true }).fill('20');
    await calc.getByRole('spinbutton', { name: 'x max', exact: true }).fill('-20');
    await calc.getByRole('button', { name: 'Plot curves' }).click();
    assert.ok((await calc.locator('#graph-error').textContent()).trim().length > 0);
    const stored = await calc.evaluate(el => el.history);
    assert.ok(stored.some(e => e.kind === 'graph' && e.ok));
    assert.ok(stored.some(e => e.kind === 'graph' && !e.ok));
  });
  await check('graph discontinuity does not bridge the reciprocal asymptote', async ({ calc, page }) => {
    await mode(calc, 'Graph');
    await calc.getByRole('textbox', { name: 'Curve 1', exact: true }).fill('1/(x-0.037)');
    await calc.getByRole('textbox', { name: 'Curve 2', exact: true }).fill('');
    for (const [name, value] of [['x min', '-5'], ['x max', '5'], ['y min', '-10'], ['y max', '10']]) {
      await calc.getByRole('spinbutton', { name, exact: true }).fill(value);
    }
    await page.evaluate(() => { window.__canvasPaths = []; });
    await calc.getByRole('button', { name: 'Plot curves' }).click();
    await page.waitForFunction(() => window.__canvasPaths.filter(p => p.method === 'lineTo').length > 50);
    const paths = await page.evaluate(() => window.__canvasPaths);
    let previous;
    const bridges = [];
    for (const p of paths) {
      if (p.method === 'beginPath' || p.method === 'stroke') previous = null;
      if (p.method === 'moveTo') previous = p.args;
      if (p.method === 'lineTo') {
        if (previous && Math.abs(p.args[0] - previous[0]) < 4 && Math.abs(p.args[0] - previous[0]) > 0 && Math.abs(p.args[1] - previous[1]) > p.height * 0.65) bridges.push([previous, p.args]);
        previous = p.args;
      }
    }
    assert.deepEqual(bridges, [], 'No near-vertical segment bridges the asymptote');
  });
  await check('stress: 525 submitted runs survive paging, reload and export without truncation', async ({ calc, page }) => {
    await calc.evaluate(el => {
      const input = el.shadowRoot.querySelector('#expression');
      const form = el.shadowRoot.querySelector('#expression-form');
      for (let i = 0; i < 525; i++) {
        input.value = i === 524 ? '1/0' : `${i}+1`;
        form.requestSubmit();
      }
    });
    assert.match(await calc.locator('#history-count').textContent(), /525/);
    assert.equal(await calc.locator('.entry').count(), 50);
    await calc.getByRole('button', { name: 'Show 50 more runs', exact: true }).click();
    assert.equal(await calc.locator('.entry').count(), 100);
    await page.reload();
    assert.match(await calc.locator('#history-count').textContent(), /525/);
    const pending = page.waitForEvent('download');
    await calc.getByRole('button', { name: 'Export calculation log' }).click();
    const downloaded = await pending;
    const data = JSON.parse(await readFile(await downloaded.path(), 'utf8'));
    assert.equal(data.entries.length, 525);
    assert.equal(data.entries[0].expression, '0+1');
    assert.equal(data.entries.at(-1).ok, false);
  });
  await check('corrupted or hostile local storage remains inert and usable', async ({ page, calc }) => {
    await page.evaluate(() => localStorage.setItem('extreme-demo', '{ broken json'));
    await page.reload();
    assert.match(await calc.locator('#storage-status').textContent(), /could not be loaded/i);
    assert.equal(await run(calc, '3+4'), '7');
    await page.evaluate(() => localStorage.setItem('extreme-demo', JSON.stringify({ history: [{ expression: '<svg onload="window.__injected=2">', result: '<img src=x onerror="window.__injected=3">', timestamp: 'bogus', angle: '<script>', kind: 'calculation', ok: false }] })));
    await page.reload();
    assert.equal(await page.evaluate(() => window.__injected), undefined);
    assert.equal(await calc.locator('#history-list img, #history-list svg').count(), 0);
    assert.match(await calc.locator('#history-list').textContent(), /<svg onload=/);
    assert.equal(await run(calc, '7*6'), '42');
  });
  await check('storage quota failure reports unsaved runs and preserves export', async ({ calc, page }) => {
    await page.evaluate(() => { Storage.prototype.setItem = function () { throw new DOMException('Quota exceeded', 'QuotaExceededError'); }; });
    assert.equal(await run(calc, '8*8'), '64');
    assert.match(await calc.locator('#storage-status').textContent(), /full or unavailable/i);
    const pending = page.waitForEvent('download');
    await calc.getByRole('button', { name: 'Export calculation log' }).click();
    const downloaded = await pending;
    const data = JSON.parse(await readFile(await downloaded.path(), 'utf8'));
    assert.equal(data.entries[0].expression, '8*8');
  });
  await check('dialog traps keyboard focus, help examples run, clipboard copies result', async ({ calc, page, context }) => {
    await calc.getByRole('button', { name: 'Open help', exact: true }).click();
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press('Tab');
      assert.equal(await calc.locator('#help').evaluate(el => el.contains(el.getRootNode().activeElement)), true);
    }
    await calc.getByRole('searchbox', { name: 'Search functions' }).fill('hypot');
    await calc.locator('#help-list button').first().click();
    assert.equal(await calc.locator('#help').evaluate(el => el.open), false);
    assert.match(await expression(calc).inputValue(), /^hypot\(/);
    await expression(calc).press('Enter');
    assert.equal(await calc.locator('#result').evaluate(el => el.classList.contains('error')), false);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await run(calc, '123*2');
    await calc.getByRole('button', { name: 'Copy result', exact: true }).click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), '246');
  });
  await check('all-invalid graphs, third curve, graph reuse and pointer dragging', async ({ calc, page }) => {
    await mode(calc, 'Graph');
    await calc.getByRole('textbox', { name: 'Curve 1', exact: true }).fill('sqrt(-1)');
    await calc.getByRole('textbox', { name: 'Curve 2', exact: true }).fill('');
    await calc.getByRole('button', { name: 'Plot curves' }).click();
    assert.ok((await calc.locator('#graph-error').textContent()).length > 0);
    assert.ok((await calc.evaluate(el => el.history)).some(e => e.kind === 'graph' && !e.ok));
    await calc.getByRole('textbox', { name: 'Curve 1', exact: true }).fill('x');
    await calc.getByRole('textbox', { name: 'Curve 2', exact: true }).fill('2*x');
    await calc.getByRole('textbox', { name: 'Curve 3', exact: true }).fill('3*x');
    await calc.getByRole('button', { name: 'Plot curves' }).click();
    assert.match(await calc.locator('#graph-legend').textContent(), /x.*2\*x.*3\*x/);
    await calc.getByRole('button', { name: 'Reuse 2*x', exact: true }).click();
    assert.equal(await calc.getByRole('textbox', { name: 'Curve 1', exact: true }).inputValue(), '2*x');
    await calc.getByRole('button', { name: 'Plot curves' }).click();
    const before = await calc.evaluate(el => ({ ...el.view }));
    const box = await calc.locator('canvas').boundingBox();
    await page.mouse.move(box.x + 100, box.y + 100); await page.mouse.down();
    await page.mouse.move(box.x + 150, box.y + 120, { steps: 4 }); await page.mouse.up();
    const after = await calc.evaluate(el => ({ ...el.view }));
    assert.notEqual(after.xmin, before.xmin);
    assert.notEqual(after.ymin, before.ymin);
    await calc.getByRole('button', { name: 'Zoom out', exact: true }).click();
    const zoomed = await calc.evaluate(el => ({ ...el.view }));
    assert.ok(zoomed.xmax - zoomed.xmin > after.xmax - after.xmin);
  });
  await check('settings persist, backdrop closes, and detach/reconnect avoids duplicate handlers', async ({ calc, page }) => {
    await calc.getByRole('button', { name: 'Open settings' }).click();
    await calc.getByRole('combobox', { name: 'Display precision' }).selectOption('6');
    await calc.getByRole('combobox', { name: 'Angle unit' }).selectOption('grad');
    await page.mouse.click(5, 5);
    assert.equal(await calc.locator('#settings').evaluate(el => el.open), false);
    await page.reload();
    assert.equal(await calc.getByRole('button', { name: 'GRAD', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.equal(await run(calc, '1/3'), '0.333333');
    await mode(calc, 'Logic');
    await calc.evaluate(el => { const parent = el.parentNode; const next = el.nextSibling; el.remove(); parent.insertBefore(el, next); });
    assert.equal(await expression(calc).inputValue(), '1/3');
    assert.equal(await calc.locator('#result').textContent(), '0.333333');
    assert.equal(await calc.getByRole('tab', { name: 'Logic', exact: true }).getAttribute('aria-selected'), 'true');
    assert.equal(await run(calc, '6*7'), '42');
    assert.match(await calc.locator('#history-count').textContent(), /^2 runs$/);
    await page.evaluate(() => document.body.append(document.createElement('extreme-calculator')));
    const sessionOnly = page.locator('extreme-calculator').nth(1);
    await run(sessionOnly, '21*2');
    await sessionOnly.evaluate(el => { el.remove(); document.body.append(el); });
    assert.equal(await expression(sessionOnly).inputValue(), '21*2');
    assert.equal(await sessionOnly.locator('#result').textContent(), '42');
    assert.equal(await run(sessionOnly, 'ans+1'), '43');
    assert.match(await sessionOnly.locator('#history-count').textContent(), /^2 runs$/);
  });
  await check('expensive three-curve graphs yield promptly and calculator recovers', async ({ calc, page }) => {
    await mode(calc, 'Graph');
    const matrix = Array.from({ length: 14 }, (_, i) => Array.from({ length: 14 }, (_, j) => i === j ? 2 : 1));
    const expensive = `sum(inverse(${JSON.stringify(matrix)}))+x`;
    assert.ok(expensive.length < 512);
    for (let i = 1; i <= 3; i++) await calc.getByRole('textbox', { name: `Curve ${i}`, exact: true }).fill(expensive);
    const elapsed = await calc.locator('#draw').evaluate(button => new Promise(resolve => {
      const started = performance.now();
      setTimeout(() => resolve(performance.now() - started), 0);
      button.click();
    }));
    assert.ok(elapsed < 1500, `Graph task yields within 1.5 seconds; took ${elapsed.toFixed(1)}ms`);
    console.log(`  Graph stress yielded in ${elapsed.toFixed(1)}ms`);
    assert.equal((await calc.evaluate(el => el.history)).filter(e => e.kind === 'graph').length, 3);
    await mode(calc, 'Calculator');
    assert.equal(await run(calc, '40+2'), '42');
    await calc.getByRole('button', { name: 'Open help' }).click();
    await page.keyboard.press('Escape');
    await calc.locator('#help').waitFor({ state: 'hidden' });
  });
  await check('standalone file:// build calculates, graphs, exports and needs no network', async ({ page }) => {
    const standalone = resolve(root, 'dist/extreme-calculator.html');
    await stat(standalone);
    const requests = [];
    page.on('request', req => { if (/^https?:/.test(req.url())) requests.push(req.url()); });
    await page.goto(pathToFileURL(standalone).href);
    await page.waitForFunction(() => customElements.get('extreme-calculator'));
    const calc = page.locator('extreme-calculator').first();
    assert.equal(await run(calc, 'sin(30)+2^3'), '8.5');
    await mode(calc, 'Matrices');
    assert.equal(await run(calc, 'det([[1,2],[3,4]])'), '-2');
    await mode(calc, 'Logic');
    assert.equal(await run(calc, 'and(0b1100,0b1010)'), '8');
    await mode(calc, 'Graph');
    await calc.getByRole('button', { name: 'Plot curves' }).click();
    assert.match(await calc.locator('#history-list').textContent(), /Plotted/);
    await calc.getByRole('button', { name: 'Open help' }).click();
    await calc.getByRole('searchbox', { name: 'Search functions' }).fill('sin');
    await page.keyboard.press('Escape');
    await calc.locator('#help').waitFor({ state: 'hidden' });
    const pending = page.waitForEvent('download');
    await calc.getByRole('button', { name: 'Export calculation log' }).click();
    const downloaded = await pending;
    const data = JSON.parse(await readFile(await downloaded.path(), 'utf8'));
    assert.equal(data.entries.length, 5);
    assert.deepEqual(requests, []);
  });
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
console.log(`\n${results.filter(r => r.passed).length}/${results.length} browser checks passed`);
if (results.some(r => !r.passed)) process.exitCode = 1;
