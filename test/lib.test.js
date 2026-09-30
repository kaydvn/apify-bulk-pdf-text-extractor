import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFixturePdf } from './fixture.js';
import { countWords, extractPdf, hasPdfMagic, isLikelyScanned, normalizeUrl, parsePdfDate, toDocRow, toPageRows } from '../src/lib.js';

test('normalizeUrl', () => {
    assert.equal(normalizeUrl('example.com/a.pdf#x'), 'https://example.com/a.pdf');
    assert.equal(normalizeUrl('ftp://x.com'), null);
    assert.equal(normalizeUrl(''), null);
});

test('hasPdfMagic', () => {
    assert.equal(hasPdfMagic(Buffer.from('%PDF-1.4\n')), true);
    assert.equal(hasPdfMagic(Buffer.from('<html>nope</html>')), false);
    assert.equal(hasPdfMagic(Buffer.alloc(0)), false);
});

test('parsePdfDate', () => {
    assert.equal(parsePdfDate("D:20240131120000+01'00'"), '2024-01-31T11:00:00.000Z');
    assert.equal(parsePdfDate('D:20240131120000Z'), '2024-01-31T12:00:00.000Z');
    assert.equal(parsePdfDate('D:2024'), '2024-01-01T00:00:00.000Z');
    assert.equal(parsePdfDate('garbage'), null);
    assert.equal(parsePdfDate(undefined), null);
});

test('countWords and scanned heuristic', () => {
    assert.equal(countWords('  a b\nc  '), 3);
    assert.equal(countWords(''), 0);
    assert.equal(isLikelyScanned(10, '   '), true);
    assert.equal(isLikelyScanned(1, 'x'.repeat(200)), false);
    assert.equal(isLikelyScanned(0, ''), false);
});

test('extractPdf reads text, pages and metadata', async () => {
    const r = await extractPdf(buildFixturePdf());
    assert.equal(r.pageCount, 2);
    assert.equal(r.title, 'Fixture Title');
    assert.equal(r.author, 'Test Author');
    assert.equal(r.creationDate, '2024-01-31T12:00:00.000Z');
    assert.match(r.text, /Hello PDF world/);
    assert.match(r.pages[1].text, /Second page text/);
    assert.equal(r.pages[1].pageNumber, 2);
    assert.ok(r.wordCount >= 6);
    assert.equal(r.isLikelyScanned, false);
});

test('maxPages limits extraction', async () => {
    const r = await extractPdf(buildFixturePdf(), { maxPages: 1 });
    assert.equal(r.pageCount, 2);
    assert.equal(r.pages.length, 1);
    assert.doesNotMatch(r.text, /Second page/);
});

test('empty-text PDF is flagged as likely scanned', async () => {
    const r = await extractPdf(buildFixturePdf({ empty: true }));
    assert.equal(r.isLikelyScanned, true);
    assert.equal(r.wordCount, 0);
});

test('non-PDF and corrupt input give clear errors', async () => {
    await assert.rejects(() => extractPdf(Buffer.from('<html></html>')), /not_a_pdf/);
    await assert.rejects(() => extractPdf(Buffer.from('%PDF-1.4 garbage garbage')), /unreadable_pdf|password/);
});

test('row builders', async () => {
    const r = await extractPdf(buildFixturePdf());
    const base = { url: 'u', finalUrl: 'u', status: 200, error: null, fileSizeBytes: 1 };
    const doc = toDocRow(base, r);
    assert.equal(doc.pages, undefined);
    assert.equal(doc.pageCount, 2);
    const rows = toPageRows(base, r);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].pageNumber, 1);
    assert.equal(rows[1].title, 'Fixture Title');
    assert.match(rows[1].text, /Second/);
});
