# AK Converter — V2.3 + V2.4

Apply **after** the Phase 1/2 patches and rate-limit test fix; from the repository root use `git apply --check` and then `git apply`.

## V2.3
- PDF Compressor: lossless (preserves text) / balanced / strong. Balanced and strong rasterize pages, flattening text and links; limited to 25 pages. All profiles return the original when compression would increase size. Compression is *not* guaranteed for already-optimized PDFs.
- Excel to PDF: A4 or US Letter, automatic/portrait/landscape.
- PDF to JPG: resolution (1×, 1.5×, 2×) and quality (65, 80, 90).

## V2.4
- Search/filter all converter tools on the dashboard.
- Browser-side PDF and image preview for the first selected document (object URL, automatically revoked).
- True upload/download transfer progress when the browser provides byte totals; processing phase is indeterminate, never a fake percent.
- Cancellation of an active request.
- Batch mode for single-file services (up to 5 files), processed sequentially. Each completed file downloads separately; some browsers may prompt to allow multiple downloads. Multi-input tools such as PDF Merge continue as one job.
- Result list with success/errors and output file sizes, including compressor before/after size.

## Test and deployment
```powershell
cd client\pdf
npm test
npm run build
cd ..\..\server
npm test
```
Push the feature branch and merge only after these pass. Both Render frontend and backend must redeploy. No new npm dependencies or environment variables are required.

Conversion limits remain: 50 MB per file, 30 requests/10 minutes by default, 2 concurrent conversions. Multi-file batch mode counts **one HTTP request per file**.

The frontend's in-browser PDF preview relies on the user's browser support and does not submit the preview to the server. There is no editable page-thumbnails PDF preview; the preview is read-only.
