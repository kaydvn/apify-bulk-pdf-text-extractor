// Builds a minimal valid 2-page PDF with Info metadata, no external files needed.
export function buildFixturePdf({ empty = false } = {}) {
    const stream = (t) => (empty ? '' : `BT /F1 18 Tf 72 720 Td (${t}) Tj ET`);
    const objs = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 5 0 R /Resources << /Font << /F1 7 0 R >> >> >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 6 0 R /Resources << /Font << /F1 7 0 R >> >> >>',
        null,
        null,
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        "<< /Title (Fixture Title) /Author (Test Author) /Subject (Testing) /Keywords (a, b) /Producer (hand) /CreationDate (D:20240131120000Z) >>",
    ];
    const s1 = stream('Hello PDF world. This is the first page.');
    const s2 = stream('Second page text lives here.');
    objs[4] = `<< /Length ${s1.length} >>\nstream\n${s1}\nendstream`;
    objs[5] = `<< /Length ${s2.length} >>\nstream\n${s2}\nendstream`;
    let out = '%PDF-1.4\n';
    const offsets = [];
    objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
    for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`;
    out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info 8 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(out, 'latin1');
}
