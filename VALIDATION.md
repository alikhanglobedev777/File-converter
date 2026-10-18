# Conversion validation

The backend suite exercises all nine conversion routes over HTTP using generated
PDFs and spreadsheets. Run `npm.cmd test` in `server`. The current suite contains
24 tests, including the database/startup and binary-format checks.

| Service | Checked |
| --- | --- |
| PDF to Excel | Every page; separate editable columns; numeric zero, comma-separated numbers and percentages; header colors, fonts and borders |
| PDF to Word | Editable tables, values, colors and all PDF pages |
| PDF to JPG | Single-page JPEG; every page of multipage PDFs in a ZIP; image dimensions |
| PDF to PowerPoint | Slide count, page aspect ratio, and exact embedded image comparison for all 12 pages in order |
| Excel to PDF | All worksheets, zero values, displayed percentage formats |
| Excel to Word | All worksheets, zero and false values, displayed percentage formats |
| Excel to PowerPoint | All worksheets and values; all 120 rows of a long table after pagination |
| PDF merge | Combined page count and input order |
| ZIP | Complete archive contents and duplicate-filename handling |

Missing uploads, invalid PDFs/spreadsheets, incorrect file types and insufficient
merge inputs are also checked. The suite verifies that temporary upload/output
files are removed after completed or failed requests.

All 24 backend tests and the frontend production build passed. The user's
nine-page area achievement report was converted separately. The
result has nine worksheets, four editable table columns, styled headers and
totals, and the report's graphics above and below each table. Review
`artifacts/achievement-formatted.xlsx`. Artifacts contain local user data and are
excluded from Git. `server/scripts/review-workbook.ps1` opens the generated file
read-only in installed Excel and exports worksheet previews for visual review.
Excel opened all nine worksheets and printed each onto one page. The first and
last worksheet previews were visually inspected, including table/header alignment.

## Fidelity limits

- Ruled PDF tables are reconstructed from axis-aligned rectangle cells. Complex,
  overlapping layouts, tables drawn as separate lines, and borderless tables use
  simpler text-position extraction. Excel includes an Original image sheet for
  fallback pages so their visual appearance is retained.
- Logos/headings/footers around recognized tables are images; table text remains
  editable. PDF-to-PowerPoint slides are images, not editable text boxes.
- Scanned PDFs do not acquire editable text without OCR. PDF-to-Excel retains an
  original page image and explains this; PDF-to-Word retains the page as an image.
- Excel exports preserve basic cell values and styling, not complete Excel print
  fidelity. Charts, embedded objects/images, complex merged layouts and advanced
  conditional formatting are not reproduced. Formulas use stored results rather
  than recalculation. Legacy XLS formatting is limited by the legacy reader.
- Native Word/PowerPoint visual rendering and Linux hosting have not been tested
  in this Windows environment. PDF/Office packages are parsed in the tests, with
  actual Excel used separately for the report review.

## Before deployment

Use Node 22.13+ and install the dependencies from `server/package-lock.json`.
PDF rendering now uses PDF.js and its native canvas dependency instead of the
Windows/macOS-only Poppler wrapper. Choose hosting that supports native Node
dependencies and a writable temporary filesystem. These checks do not constitute
a production load or security audit. No deployment was performed.
