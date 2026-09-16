> Historical plan: the live-data runtime now reads an approved aggregate endpoint. Routine refreshes update and verify the private Sheet/publication record; they do not regenerate HTML/JSON or publish GitHub changes. Earlier Corrective/cloud-browser instructions below are superseded.

# Daily Maintenance Completion Implementation Plan

**Goal:** Refresh a maintenance completion TV display from verified Fiix data through a private Google Sheet every weekday.

**Architecture:** The authenticated update skill collects Fiix work-order exports, computes agreed monthly counts, writes a private Google Sheet and verifies readback. A deterministic renderer publishes only aggregate totals and static SVG HTML to the existing GitHub Pages repo. A scheduled task runs the same workflow on weekdays.

**Tech Stack:** Fiix cloud browser, Google Drive/Sheets connector, Python standard-library data validation, Node static SVG renderer, ES5 animation.

**Spec:** User-approved six-step plan in this conversation, including no visible clock time and compatibility with 2018–2019 TVs.

## Constraints

- Retain the three-second graph reveal and complete no-JavaScript fallback.
- No external libraries, web fonts, modern browser syntax or CSS Grid in the TV page.
- Show the actual successful source-update date as weekday, month and day.
- Refresh existing results, not just new jobs. Do not modify Fiix work orders.
- Keep detailed work-order data, crew identities and the Google Sheet private. Publish only grouped totals.
- PM: scheduled-maintenance-linked work; 30 calendar days from creation. Corrective: type Corrective; later of creation plus 14 days or recorded due date.
- Exclude rejected and cancelled records; match approved named mechanics; count each WO once per metric and site.
- Reporting window ends after month-end plus 30 days, with extra time for unfinished corrective jobs whose longer deadlines have not passed.

## Tasks

- [x] Collect the complete Fiix export and validate unique IDs against the UI total. Reject incomplete pagination.
- [x] Test calculation boundaries with small synthetic records: completion on deadline, next-month completion, late completion, multi-assignee deduplication, missing and longer due dates, zero populations, future dates and month-end reporting cutoff. Implement the private update skill's deterministic calculator and run those tests.
- [x] Create the Google KPI workbook, verify formulas and display, import through Google Drive and verify native values and privacy.
- [x] Implement `scripts/render-maintenance.cjs` and its tests. Generate All, Grandview and Prosser pages from the same verified sheet data. Test ES5 syntax, date wording, provisional shading and unavailable values.
- [ ] Visually inspect rendered TV pages, preserve unrelated repo files, publish generated pages and aggregate JSON together, then verify the hosted result.
- [x] Install the update skill and configure a weekday morning automation. Keep last good published data on failure and report the specific failure without pretending the date advanced.

## Verification commands

`python3 <installed-skill>/scripts/test_completion.py`

`node --test tests/render-maintenance.test.cjs`

`node scripts/render-maintenance.cjs <verified-sheet-readback.json> maintenance-completion-kpis.html All`

Compare native Sheet counts with Fiix and grouped totals before publishing. Confirm all three generated pages use the same update date and each filtered site's counts differ as expected.

