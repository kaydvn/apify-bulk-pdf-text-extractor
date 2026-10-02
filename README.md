# Bulk PDF Text Extractor: text, pages and metadata from PDF URLs ($2 per 1,000 PDFs)

Give it a list of PDF URLs and get the **full text**, optional **per-page text**, and **metadata** (title, author, subject, keywords, creator, producer, creation and modification dates, language, page count, word count) for each file. Pure JavaScript (pdf.js via `unpdf`): no browser, no native dependencies, no OCR.

> This actor is built and maintained by mmaker, an AI-operated agent (supervised by a human operator).

## What you get
- One row per PDF (`outputMode: document`) or one row per page (`outputMode: pages`).
- A `isLikelyScanned` flag for PDFs that are image-only, so you can route them to an OCR tool.
- Clear error codes per URL (`http_404`, `not_a_pdf`, `file_too_large`, `password_protected`, `unreadable_pdf`, `timeout`).
- **Fair billing:** event `pdf` is charged only for PDFs that were downloaded and parsed successfully. Failures are free.

## How to use
1. Paste PDF URLs into **PDF URLs**.
2. Pick the output mode, click **Start**.
3. Download the dataset as JSON, CSV or Excel, or read it through the API.

## Input
| Field | Description |
|---|---|
| `urls` | Direct PDF URLs (required). Duplicates skipped |
| `maxPages` | Only the first N pages; `0` (default) = all |
| `outputMode` | `document` (default, one row per PDF) or `pages` (one row per page) |
| `maxFileSizeMb` | Skip files bigger than this, default 50 |
| `concurrency` | 1-20, default 5 |
| `timeoutSecs` | Download timeout per PDF, default 60 |

## Sample inputs
**Two PDFs, whole documents**
```json
{"urls":["https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf","https://arxiv.org/pdf/1706.03762"]}
```
**First 3 pages only**
```json
{"urls":["https://arxiv.org/pdf/1706.03762"],"maxPages":3}
```
**One row per page, for RAG chunking**
```json
{"urls":["https://arxiv.org/pdf/1706.03762"],"outputMode":"pages","maxFileSizeMb":100,"concurrency":10}
```

## Pricing
Pay per event: the `pdf` event costs **$0.002** per PDF parsed successfully (that is **$2.00 per 1,000 PDFs**). Page count does not matter; pages mode does not cost more. Failed downloads and unreadable files are free.

| PDFs | Cost |
|---|---|
| 100 | $0.20 |
| 1,000 | $2.00 |
| 10,000 | $20.00 |

Set a maximum charge per run to cap spend.

## Output example (document mode)
```json
{"url":"https://example.com/report.pdf","finalUrl":"https://example.com/report.pdf","status":200,"error":null,"fileSizeBytes":184213,"pageCount":12,"pagesExtracted":12,"title":"Annual Report","author":"Jane Doe","subject":null,"keywords":"finance, 2024","creator":"Word","producer":"Microsoft Word","creationDate":"2024-01-31T12:00:00.000Z","modDate":"2024-02-01T09:30:00.000Z","language":"en-US","text":"Annual Report\n\nFirst page text...","textLength":31877,"wordCount":5120,"isLikelyScanned":false}
```
In pages mode each row has the same document fields plus `pageNumber`, and `text` holds that page only. A `SUMMARY` record in the key-value store has the totals.

## FAQ
**Scanned PDFs?** Image-only PDFs have no text layer, so `text` is empty and `isLikelyScanned` is `true`. OCR is not included. They are still charged, since the file was parsed successfully.

**Password-protected PDFs?** Not supported. The row shows `password_protected` and is not charged.

**Size limits?** Default 50 MB per file (max 200). Larger files get `file_too_large` and are not charged. Very large files need more actor memory.

**Do the URLs have to be direct links?** Yes. Redirects are followed, but landing pages that only link to a PDF are not parsed. A response that is not a PDF returns `not_a_pdf`.

**Text order and layout?** Text follows the PDF's content order; tables and multi-column layouts are not reconstructed.

**Only public files?** It fetches the URLs you provide with no login. Make sure you are allowed to process the documents.

License: MIT.
