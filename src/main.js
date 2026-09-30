import { Actor, log } from 'apify';
import { extractPdf, hasPdfMagic, normalizeUrl, toDocRow, toPageRows } from './lib.js';

const EVENT = 'pdf';
const UA = 'Mozilla/5.0 (compatible; bulk-pdf-text-extractor/1.0; Apify actor; +https://apify.com/mmaker-bot)';

async function download(url, { timeoutMs, maxBytes }) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetch(url, { redirect: 'follow', signal: ctrl.signal, headers: { 'user-agent': UA, accept: 'application/pdf,*/*;q=0.5' } });
        const out = { status: res.status, finalUrl: res.url || url, bytes: null, error: null };
        if (res.status >= 400) { await res.body?.cancel().catch(() => {}); out.error = `http_${res.status}`; return out; }
        const declared = Number(res.headers.get('content-length'));
        if (declared > maxBytes) { await res.body?.cancel().catch(() => {}); out.error = 'file_too_large'; out.fileSizeBytes = declared; return out; }
        const reader = res.body.getReader();
        const chunks = [];
        let size = 0;
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.length;
            if (size > maxBytes) { reader.cancel().catch(() => {}); out.error = 'file_too_large'; out.fileSizeBytes = size; return out; }
            chunks.push(value);
        }
        out.bytes = Buffer.concat(chunks);
        out.fileSizeBytes = size;
        return out;
    } catch (err) {
        return { status: null, finalUrl: null, bytes: null, error: err.name === 'AbortError' ? 'timeout' : (err.cause?.code || err.message) };
    } finally {
        clearTimeout(timer);
    }
}

async function process(url, opts) {
    const dl = await download(url, opts);
    const base = { url, finalUrl: dl.finalUrl, status: dl.status, error: null, fileSizeBytes: dl.fileSizeBytes ?? null };
    if (dl.error) return { rows: [{ ...base, error: dl.error }], charged: false };
    if (!hasPdfMagic(dl.bytes)) return { rows: [{ ...base, error: 'not_a_pdf' }], charged: false };
    try {
        const result = await extractPdf(dl.bytes, { maxPages: opts.maxPages });
        const rows = opts.outputMode === 'pages' ? toPageRows(base, result) : [toDocRow(base, result)];
        return { rows, charged: true };
    } catch (err) {
        return { rows: [{ ...base, error: err.message }], charged: false };
    }
}

await Actor.init();
const input = (await Actor.getInput()) || {};
const raw = (input.urls || []).map((s) => (typeof s === 'string' ? s : s?.url));
const seen = new Set();
const urls = [];
let invalid = 0;
for (const r of raw) {
    if (!String(r ?? '').trim()) continue;
    const u = normalizeUrl(r);
    if (!u) { invalid++; log.warning(`Skipping invalid URL: ${r}`); continue; }
    if (!seen.has(u)) { seen.add(u); urls.push(u); }
}
if (!urls.length) throw new Error('Give at least one PDF URL in "urls".');
const opts = {
    timeoutMs: Math.min(Math.max(Number(input.timeoutSecs) || 60, 5), 300) * 1000,
    maxBytes: Math.min(Math.max(Number(input.maxFileSizeMb) || 50, 1), 200) * 1024 * 1024,
    maxPages: Math.max(Math.floor(Number(input.maxPages) || 0), 0),
    outputMode: input.outputMode === 'pages' ? 'pages' : 'document',
};
const concurrency = Math.min(Math.max(Number(input.concurrency) || 5, 1), 20);
log.info(`${urls.length} unique URLs (${invalid} invalid skipped), mode ${opts.outputMode}, concurrency ${concurrency}`);

let next = 0;
let done = 0;
let ok = 0;
let failed = 0;
let limitReached = false;
async function worker() {
    while (next < urls.length && !limitReached) {
        const { rows, charged } = await process(urls[next++], opts);
        if (charged) {
            ok++;
            // One `pdf` event per successfully parsed PDF, charged with the first row; extra page rows are free.
            const c = await Actor.pushData(rows[0], EVENT);
            if (c?.eventChargeLimitReached) limitReached = true;
            if (rows.length > 1) await Actor.pushData(rows.slice(1));
        } else {
            failed++;
            await Actor.pushData(rows);
        }
        if (++done % 25 === 0) await Actor.setStatusMessage(`Processed ${done}/${urls.length}`);
    }
}
await Promise.all(Array.from({ length: concurrency }, worker));
await Actor.setValue('SUMMARY', { processed: done, parsed: ok, failed, invalidUrlsSkipped: invalid, stoppedAtChargeLimit: limitReached });
if (limitReached) log.info('Stopped at the maximum charge set for this run.');
await Actor.setStatusMessage(`Finished: ${ok} PDFs parsed, ${failed} failed (not charged)`, { isStatusMessageTerminal: true });
await Actor.exit();
