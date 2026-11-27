// Locks trade signals. Runs in the GitHub job right after scripts/update.py.
// It loads the SAME research.js and engine.js the web page uses, so signals match what the page shows.
// - Issues a signal when the Balanced label is Accumulate or better and the plan's reward/risk is at least 1.5 : 1.
// - Locks entry, stop and target at that moment. They never move afterwards.
// - Closes a signal as "stopped", "target", "withdrawn" (label fell to Watchlist or lower) or "expired" (after a year).
// - After a stop-out, no new signal for that stock for 10 trading days.
// Usage: node scripts/signals.mjs [--now ISO] [--desk path] [--out path]
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const deskPath = arg('--desk', path.join(ROOT, 'docs/data/desk.json'));
const outPath = arg('--out', path.join(ROOT, 'docs/data/signals.json'));
const now = new Date(arg('--now', new Date().toISOString()));

const ctx = vm.createContext({ console, Date, Math, JSON, Intl, Object, Array, Number, String, isFinite });
for (const f of ['docs/research.js', 'docs/engine.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });

const live = fs.existsSync(deskPath) ? JSON.parse(fs.readFileSync(deskPath, 'utf8')) : null;
const prev = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, 'utf8')) : { v: 1, open: [], closed: [] };
ctx.__args = { live, prev, now };
const next = vm.runInContext('makeEngine({R:DESK_RESEARCH,live:__args.live,signals:__args.prev,now:__args.now}).stepSignals()', ctx);

const before = new Set(prev.open.map(s => s.id));
const after = new Set(next.open.map(s => s.id));
const opened = next.open.filter(s => !before.has(s.id)).map(s => `${s.t} ${s.label} entry ${s.entryLo}-${s.entryHi} stop ${s.stop} target ${s.target}`);
const closed = next.closed.slice(prev.closed.length).map(s => `${s.t} ${s.outcome} at ${s.closePrice}`);
fs.writeFileSync(outPath, JSON.stringify(next, null, 1));
console.log(`Signals: ${next.open.length} open (${opened.length} new), ${closed.length} closed this run.`);
opened.forEach(s => console.log('  NEW   ' + s));
closed.forEach(s => console.log('  CLOSE ' + s));
void after;
