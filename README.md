# LinkedIn Job Scanner

Chrome extension that compares your resume against the LinkedIn job posting
you're currently viewing. Upload a resume once; as you browse job postings,
the side panel shows keyword overlap plus a few fields that are usually
buried in free-text descriptions.

## Features

- **Keyword matching** — highlights which resume keywords appear in the job
  description, and which required skills are missing.
- **Field detection** (regex-based, no AI) for:
  - security clearance requirements
  - visa sponsorship availability
  - expected years of experience
  - preferred/nice-to-have qualifications
- Every detected field links back to the matching sentence in the posting
  and can scroll/highlight it on the page, so you can verify the match
  instead of trusting the label blindly.

## How it works

- `content.js` runs on `linkedin.com/jobs/*` pages, scrapes the currently
  displayed job posting (LinkedIn is a SPA, so it re-extracts via a
  `MutationObserver` whenever the DOM settles instead of relying on
  navigation events), and reports it to the side panel.
- `panel/` is a React + Vite app that renders the side panel: resume upload
  (PDF text extraction via `pdfjs-dist`), keyword matching, and job field
  detection.
- `background.js` just wires the extension icon to open the side panel.

## Development

```bash
npm run build   # builds panel/dist (required before loading the extension)
npm run dev     # runs the panel in a browser tab for UI iteration
npm test        # runs the regression tests (Node.js test runner)
npm run lint    # checks application and test source
npm run package # builds the upload ZIP in releases/ (Windows)
```

## Load the extension locally

1. Build the panel: `npm run build` (produces `panel/dist`, which is not
   committed to the repo).
2. Open `chrome://extensions`, enable **Developer mode**.
3. Click **Load unpacked** and select this directory.
4. Open a job posting on LinkedIn (`linkedin.com/jobs/...`) and open the
   side panel to upload a resume.

## Project structure

```
manifest.json     Chrome extension manifest (MV3)
background.js     Opens the side panel on the extension icon click
content.js        Scrapes job posting data from the LinkedIn page
panel/            React/Vite side panel UI
  src/lib/           keyword matching, PDF text extraction, job field detection
  src/components/    UI components
```
