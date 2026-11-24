// Records the demo walkthrough video (public/landing/fidelia-demo.mp4) from the demo church.
// 1. npm run build && npx vite preview --port 4173
// 2. PY=<python with pypdfium2> node scripts/record-demo.mjs <outDir> http://localhost:4173   (add --check for step screenshots only)
// 3. ffmpeg -f concat -safe 0 -i <outDir>/frames.txt -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x100f2a,fps=30,format=yuv420p" -c:v libx264 -preset slow -crf 23 -movflags +faststart public/landing/fidelia-demo.mp4
// Needs Google Chrome (macOS path below) and ffmpeg. Uses only made-up demo data.
import { spawn, execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readdirSync, rmSync, existsSync, readFileSync } from 'node:fs';

const OUT = process.argv[2];
const SITE = process.argv[3];
const CHECK = process.argv.includes('--check');
const W = 1280, H = 720, DSF = 1.5;
rmSync(OUT + '/frames', { recursive: true, force: true }); mkdirSync(OUT + '/frames', { recursive: true });
rmSync(OUT + '/dl', { recursive: true, force: true }); mkdirSync(OUT + '/dl', { recursive: true });

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--remote-debugging-port=9335', '--user-data-dir=' + OUT + '/prof', '--hide-scrollbars', `--window-size=${W},${H}`, 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 40; i++) { await sleep(500); try { targets = await (await fetch('http://127.0.0.1:9335/json')).json(); break; } catch {} }
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map(); const frames = [];
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Page.screencastFrame') {
    const n = frames.length;
    writeFileSync(`${OUT}/frames/f${String(n).padStart(5, '0')}.jpg`, Buffer.from(m.params.data, 'base64'));
    frames.push(m.params.metadata.timestamp);
    send('Page.screencastFrameAck', { sessionId: m.params.sessionId });
  }
});
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(expr.slice(0, 120) + ' → ' + JSON.stringify(r.result.exceptionDetails).slice(0, 400));
  return r.result?.result?.value;
};
let step = 0;
const check = async (name) => {
  if (!CHECK) return;
  const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 70 });
  writeFileSync(`${OUT}/check-${String(++step).padStart(2, '0')}-${name}.jpg`, Buffer.from(r.result.data, 'base64'));
};

// ── In-page helpers (overlay cursor, captions, cards, element lookup, React-friendly typing) ──
const HELPERS = `(() => {
  if (window.__v) return;
  const z = 2147483647;
  const cur = document.createElement('div');
  cur.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2l15 10-7 1.5L9 21z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  Object.assign(cur.style, { position: 'fixed', left: '0', top: '0', zIndex: z, pointerEvents: 'none', transform: 'translate(640px, 420px)', transition: 'transform 750ms cubic-bezier(.4,0,.2,1)', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.35))' });
  const cap = document.createElement('div');
  Object.assign(cap.style, { position: 'fixed', left: '50%', bottom: '26px', transform: 'translateX(-50%)', zIndex: z - 1, pointerEvents: 'none', maxWidth: '980px', padding: '12px 22px', borderRadius: '14px', background: 'rgba(16,15,42,.92)', color: '#fff', font: '500 23px/1.35 system-ui, -apple-system, sans-serif', textAlign: 'center', opacity: '0', transition: 'opacity 350ms', boxShadow: '0 8px 30px rgba(0,0,0,.3)' });
  const card = document.createElement('div');
  Object.assign(card.style, { position: 'fixed', inset: '0', zIndex: z - 2, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '14px', background: '#100f2a', color: '#fff', opacity: '0', pointerEvents: 'none', transition: 'opacity 500ms', textAlign: 'center', fontFamily: 'system-ui, sans-serif' });
  const shade = document.createElement('div');
  Object.assign(shade.style, { position: 'fixed', inset: '0', zIndex: z - 3, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(16,15,42,.75)', opacity: '0', pointerEvents: 'none', transition: 'opacity 400ms' });
  const ring = document.createElement('div');
  Object.assign(ring.style, { position: 'fixed', zIndex: z - 1, pointerEvents: 'none', width: '34px', height: '34px', marginLeft: '-17px', marginTop: '-17px', borderRadius: '50%', border: '3px solid #D4A839', opacity: '0' });
  document.body.append(card, shade, ring, cap, cur);
  let cx = 640, cy = 420;
  const visible = (e) => e && e.getClientRects().length > 0;
  window.__v = {
    find(sel, text, nth = 0) {
      const all = [...document.querySelectorAll(sel)].filter(visible);
      const hits = text == null ? all : all.filter((e) => e.textContent.replace(/\\s+/g, ' ').trim().includes(text));
      return hits[nth] || null;
    },
    async move(e) {
      e.scrollIntoView({ block: 'center', behavior: 'instant' });
      await new Promise((r) => setTimeout(r, 120));
      const b = e.getBoundingClientRect();
      cx = b.left + Math.min(b.width / 2, 60); cy = b.top + b.height / 2;
      cur.style.transform = 'translate(' + (cx - 4) + 'px,' + (cy - 3) + 'px)';
      await new Promise((r) => setTimeout(r, 850));
    },
    async pulse() {
      ring.animate([{ left: cx + 'px', top: cy + 'px', opacity: 1, transform: 'scale(.5)' }, { left: cx + 'px', top: cy + 'px', opacity: 0, transform: 'scale(1.6)' }], { duration: 450 });
      await new Promise((r) => setTimeout(r, 200));
    },
    setValue(e, v) {
      const proto = e instanceof HTMLSelectElement ? HTMLSelectElement.prototype : e instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(e, v);
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    },
    async type(e, text) {
      e.focus();
      for (let i = 1; i <= text.length; i++) { this.setValue(e, text.slice(0, i)); await new Promise((r) => setTimeout(r, 85)); }
    },
    caption(t, top) { if (!t) { cap.style.opacity = '0'; return; } cap.textContent = t; cap.style.top = top ? '18px' : 'auto'; cap.style.bottom = top ? 'auto' : '26px'; cap.style.opacity = '1'; },
    card(html) { if (!html) { card.style.opacity = '0'; return; } card.innerHTML = html; card.style.opacity = '1'; },
    shade(html) { if (!html) { shade.style.opacity = '0'; return; } shade.innerHTML = html; shade.style.opacity = '1'; },
    cursor(show) { cur.style.opacity = show ? '1' : '0'; },
  };
})()`;
const inject = () => ev(HELPERS);
// Element handle by selector + text, kept on window so later calls can use it.
const pick = async (sel, text = null, nth = 0) => {
  for (let i = 0; i < 40; i++) {
    const ok = await ev(`(() => { const e = __v.find(${JSON.stringify(sel)}, ${JSON.stringify(text)}, ${nth}); window.__t = e; return !!e; })()`);
    if (ok) return;
    await sleep(250);
  }
  throw new Error(`not found: ${sel} ${text ?? ''}`);
};
const click = async (sel, text = null, nth = 0) => { await pick(sel, text, nth); await ev('__v.move(__t)'); await ev('__v.pulse()'); await ev('__t.click()'); };
const typeIn = async (sel, text, value, nth = 0) => { await pick(sel, text, nth); await ev('__v.move(__t)'); await ev('__v.pulse()'); await ev(`__v.type(__t, ${JSON.stringify(value)})`); };
const choose = async (sel, labelText, optionText) => {
  // select whose preceding label matches
  await ev(`(() => { const l = __v.find('label', ${JSON.stringify(labelText)}); const s = l.parentElement.querySelector(${JSON.stringify(sel)}); window.__t = s; })()`);
  await ev('__v.move(__t)'); await ev('__v.pulse()');
  await ev(`(() => { const o = [...__t.options].find((o) => o.text.trim() === ${JSON.stringify(optionText)}); __v.setValue(__t, o.value); })()`);
};
const field = async (labelText, sel) => {
  await ev(`(() => { const l = [...document.querySelectorAll('label, span')].filter((e) => e.getClientRects().length && e.childElementCount === 0 && e.textContent.trim().replace(/ \\*$/, '') === ${JSON.stringify(labelText)})[0]; window.__t = l.closest('label')?.querySelector(${JSON.stringify(sel)}) || l.parentElement.querySelector(${JSON.stringify(sel)}); })()`);
  await ev('__v.move(__t)'); await ev('__v.pulse()');
};
const caption = async (t, hold = 0, top = false) => { await ev(`__v.caption(${JSON.stringify(t)}, ${top})`); if (hold) await sleep(hold); };

// ── Start ──
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DSF, mobile: false });
await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: OUT + '/dl' });
await send('Page.navigate', { url: SITE + '/' });
await sleep(3500);
await inject();
await ev(`__v.card('<img src="/favicon.svg" style="width:84px;height:84px;border-radius:18px"><div style="font:700 54px Georgia,serif">Fidelia Ledger</div><div style="font:400 26px system-ui;color:#c0c8fe">Counting a Sunday offering, start to finish</div>')`);
if (!CHECK) await send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: W * DSF, maxHeight: H * DSF, everyNthFrame: 1 });
await sleep(3500);
await check('title');
await ev(`__v.card('')`);
await sleep(700);

await caption('Open fidelialedger.org in any web browser. Nothing to install.', 2600);
await caption('To look around first, try the demo church. It uses made-up names.');
await sleep(800);
await check('signin');
await click('button', 'Try the demo');
await sleep(3500);
await inject();
await caption('The dashboard shows this month’s and this year’s giving at a glance.', 3200);
await check('dashboard');

await caption('Each Sunday’s offering is a batch. Open this week’s batch.');
await click('nav a', 'Batches');
await sleep(1500);
await click('a', 'Nov 7, 2026');
await sleep(2000);
await check('batch');

await caption('Add each gift: the donor, the amount, the fund and how it was given.', 0, true);
await click('button', 'Add Offering');
await sleep(600);
await click('button', 'Select donor...');
await typeIn('input[placeholder^="Type name"]', null, 'Chen');
await sleep(500);
await click('button', 'Chen, Grace');
await sleep(500);
await typeIn('input[placeholder="0.00"]', null, '150');
await choose('select', 'Category', 'Building');
await sleep(300);
await choose('select', 'Method', 'Check');
await sleep(300);
await field('Check #', 'input'); await ev(`__v.type(__t, '1042')`);
await sleep(400);
await check('form-filled');
await click('button[type=submit]', 'Add Offering');
await sleep(1500);
await caption('A gift for a missionary or project? Add a designation.', 0, true);
if (!(await ev(`!!__v.find('input[placeholder^="Type name"]')`))) { await field('Donor', 'button'); await ev('__t.click()'); await sleep(300); }
await typeIn('input[placeholder^="Type name"]', null, 'Garcia');
await sleep(500);
await click('button', 'Garcia, Maria');
await sleep(400);
await typeIn('input[placeholder="0.00"]', null, '60');
await choose('select', 'Category', 'Mission');
await typeIn('input[placeholder="Optional"][list]', null, 'Smith family (Kenya)');
await sleep(400);
await click('button[type=submit]', 'Add Offering');
await sleep(800);
await ev(`(() => { const i = __v.find('input[placeholder^="Type name"]'); if (i) i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); })()`);
await sleep(700);
await check('added');

await caption('Totals by fund, and by cash, check and Zelle, update as you go.');
await pick('*', 'By Fund and Method');
await ev(`(() => { const t = [...document.querySelectorAll('p,h3,h2,div')].filter((e) => e.childElementCount === 0 && /By Fund and Method/i.test(e.textContent))[0]; t.scrollIntoView({ block: 'start', behavior: 'smooth' }); })()`);
await sleep(4200);
await check('table');

await caption('Record attendance for the service.');
await field('Adults', 'input'); await ev(`__v.type(__t, '68')`);
await ev('__t.blur()');
await sleep(300);
await field('Children', 'input'); await ev(`__v.type(__t, '19')`); await ev('__t.blur()');
await sleep(1500);
await check('attendance');

await caption('Print a one-page summary sheet for the counters to sign.');
await click('button', 'Summary Sheet');
let pdf;
for (let i = 0; i < 60 && !pdf; i++) { await sleep(250); pdf = readdirSync(OUT + '/dl').find((f) => f.endsWith('.pdf')); }
if (!pdf) throw new Error('summary sheet PDF did not download');
await sleep(500);
execFileSync(process.env.PY, ['-I', '-c', `import pypdfium2 as p,sys; d=p.PdfDocument(sys.argv[1]); d[0].render(scale=1.6).to_pil().convert('RGB').save(sys.argv[2], quality=88)`, `${OUT}/dl/${pdf}`, `${OUT}/sheet.jpg`]);
const sheet = 'data:image/jpeg;base64,' + readFileSync(`${OUT}/sheet.jpg`).toString('base64');
await ev(`__v.cursor(false)`);
await ev(`__v.shade('<img src="${sheet}" style="height:86vh;border-radius:6px;box-shadow:0 20px 60px rgba(0,0,0,.5)">')`);
await sleep(4800);
await check('sheet');
await ev(`__v.shade('')`);
await ev(`__v.cursor(true)`);
await sleep(600);

await caption('At year end, make giving statements for your donors.');
await click('nav a', 'Reports');
await sleep(1500);
await choose('select', 'Report Type', 'Donor Statement');
await sleep(600);
await check('reports');
await field('Donor', 'button'); await ev('__t.click()'); await sleep(300);
await typeIn('input[placeholder^="Type name"]', null, 'Chen');
await sleep(400);
await click('button', 'Chen, Grace');
await sleep(500);
await click('button[type=submit]', 'Generate Report');
await sleep(2500);
await ev(`(() => { const r = document.querySelector('#report-content'); if (r) r.scrollIntoView({ block: 'start', behavior: 'smooth' }); })()`);
await caption('Print them, or save them as PDFs to send.', 4500);
await check('statement');

await caption('');
await ev(`__v.cursor(false)`);
await ev(`__v.card('<div style="font:700 46px Georgia,serif">Free for small churches</div><div style="font:400 24px system-ui;color:#c0c8fe;max-width:820px;line-height:1.45">Your records stay in your church’s own Dropbox, encrypted.<br>Only your church can read them.</div><div style="margin-top:18px;font:700 34px system-ui;color:#EBC76A">fidelialedger.org</div>')`);
await sleep(5000);
await check('end');

if (!CHECK) {
  await send('Page.stopScreencast');
  await sleep(300);
  const end = Math.max(Date.now() / 1000, frames[frames.length - 1] + 0.1);
  const lines = [];
  for (let i = 0; i < frames.length; i++) {
    lines.push(`file 'frames/f${String(i).padStart(5, '0')}.jpg'`);
    lines.push(`duration ${((frames[i + 1] ?? end) - frames[i]).toFixed(4)}`);
  }
  lines.push(`file 'frames/f${String(frames.length - 1).padStart(5, '0')}.jpg'`);
  writeFileSync(OUT + '/frames.txt', lines.join('\n') + '\n');
  console.log('frames', frames.length, 'seconds', (end - frames[0]).toFixed(1));
}
ws.close(); chrome.kill(); process.exit(0);
