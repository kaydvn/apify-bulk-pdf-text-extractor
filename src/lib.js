import { domainToASCII } from 'node:url';
import { extractText, getDocumentProxy, getMeta } from 'unpdf';

export function normalizeUrl(raw) {
    let s = String(raw ?? '').trim();
    if (!s) return null;
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `https://${s}`;
    try {
        const u = new URL(s);
        if (!/^https?:$/.test(u.protocol) || !domainToASCII(u.hostname)) return null;
        u.hash = '';
        return u.href;
    } catch {
        return null;
    }
}

/** True when the bytes start with %PDF (allowing a little leading junk, as most readers do). */
export function hasPdfMagic(buf) {
    if (!buf || buf.length < 5) return false;
    const head = Buffer.from(buf.subarray(0, 1024)).toString('latin1');
    return head.includes('%PDF-');
}

/** Parse a PDF date string like D:20240131120000+01'00' into ISO 8601, or null. */
export function parsePdfDate(s) {
    if (typeof s !== 'string') return null;
    const m = s.trim().match(/^D?:?(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(Z|[+-]\d{2}'?(?:\d{2}'?)?)?/);
    if (!m) return null;
    const [, y, mo = '01', d = '01', h = '00', mi = '00', se = '00', tz = 'Z'] = m;
    let zone = 'Z';
    if (tz !== 'Z') {
        const t = tz.replace(/'/g, '');
        zone = `${t.slice(0, 3)}:${t.slice(3, 5) || '00'}`;
    }
    const iso = `${y}-${mo}-${d}T${h}:${mi}:${se}${zone}`;
    const t = Date.parse(iso);
    return Number.isNaN(t) ? null : new Date(t).toISOString();
}

export function countWords(text) {
    const m = String(text ?? '').match(/\S+/g);
    return m ? m.length : 0;
}

/** Tidy extracted text: normalize line breaks, drop trailing spaces, collapse 3+ blank lines. */
export function cleanText(text) {
    return String(text ?? '')
        .replace(/\r\n?/g, '\n')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/** Little or no text per page suggests an image-only (scanned) PDF. OCR is not included. */
export function isLikelyScanned(pageCount, text) {
    if (!pageCount) return false;
    const chars = String(text ?? '').replace(/\s+/g, '').length;
    return chars / pageCount < 25;
}

const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

export function buildMeta(info = {}, custom = {}) {
    return {
        title: str(info.Title),
        author: str(info.Author),
        subject: str(info.Subject),
        keywords: str(info.Keywords),
        creator: str(info.Creator),
        producer: str(info.Producer),
        creationDate: parsePdfDate(info.CreationDate),
        modDate: parsePdfDate(info.ModDate),
        language: str(info.Language) || str(custom?.Language) || null,
    };
}

/**
 * Extract text and metadata from PDF bytes.
 * Returns the row fields (without url/status). Throws with a readable message on failure.
 */
export async function extractPdf(bytes, { maxPages = 0 } = {}) {
    if (!hasPdfMagic(bytes)) throw new Error('not_a_pdf');
    let pdf;
    try {
        pdf = await getDocumentProxy(new Uint8Array(bytes));
    } catch (e) {
        if (e?.name === 'PasswordException') throw new Error('password_protected');
        throw new Error(`unreadable_pdf: ${e?.message || e}`);
    }
    try {
        const pageCount = pdf.numPages;
        const { text: pageTexts } = await extractText(pdf, { mergePages: false });
        let meta = {};
        try {
            const m = await getMeta(pdf);
            meta = buildMeta(m.info, m.metadata?.getRaw?.() ? { Language: m.metadata.get('dc:language') } : {});
        } catch {
            meta = buildMeta();
        }
        const limit = maxPages > 0 ? Math.min(maxPages, pageCount) : pageCount;
        const pages = pageTexts.slice(0, limit).map((t, i) => ({ pageNumber: i + 1, text: cleanText(t) }));
        const text = pages.map((p) => p.text).join('\n\n').trim();
        return {
            pageCount,
            pagesExtracted: pages.length,
            ...meta,
            text,
            textLength: text.length,
            wordCount: countWords(text),
            isLikelyScanned: isLikelyScanned(pages.length, text),
            pages,
        };
    } finally {
        await pdf.destroy?.().catch?.(() => {});
    }
}

/** Row for document mode: the result without the per-page array. */
export function toDocRow(base, result) {
    const { pages, ...doc } = result;
    return { ...base, ...doc };
}

/** Expand a pages-mode result into one row per page (each carries the document fields). */
export function toPageRows(base, result) {
    const { pages, text, textLength, wordCount, ...doc } = result;
    return pages.map((p) => ({
        ...base,
        ...doc,
        pageNumber: p.pageNumber,
        text: p.text,
        textLength: p.text.length,
        wordCount: countWords(p.text),
    }));
}
