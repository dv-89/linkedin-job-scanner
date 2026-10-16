# LinkedIn Job Scanner

Chrome extension that compares your resume against the LinkedIn job posting
you're currently viewing. Save up to three resumes; as you browse job postings,
the side panel shows keyword overlap plus a few fields that are usually
buried in free-text descriptions.

## Features

- **Job header** — shows the current posting's title, company, and location.
  Uses the selected LinkedIn job ID to read header metadata even when the
  browser tab title is generic or stale. Header details remain visible while
  the separate description loads. The panel footer shows the installed version
  so updates can be verified after reloading the extension. Entering Jobs from
  LinkedIn's home page attaches the reader automatically. Opening the panel
  reconnects a missing reader, including in tabs left open during an extension
  update, without refreshing the page.
- **Optional folder saving** — enable Save CSV files to a folder in Settings,
  select a folder and grant read/write access, then click Save settings.
  Cancelling the picker leaves saving off. The chosen folder is remembered.
  Qualifying jobs are written directly to jobs-YYYY-MM-DD.csv inside that folder,
  using your computer's local date. The first save on a new day creates a new
  dated file. Existing rows are read and merged before each update, with one row
  per job per day. No downloads or Save As dialogs are used for job saves.
  Turning saving off stops new captures and file writes without deleting data.
  Each CSV has exactly 11 columns in order: Apply clicked (UTC), Title, Company,
  Location, Job URL, Clearance, Sponsorship, Expected experience, Citizenship /
  work eligibility, Best resume match (%), Best resume slot(s). Other columns
  in older files are removed. All tied best resume slots are included. Missing
  scores and unobserved Apply times stay blank. Keyword lists, descriptions,
  source evidence, resume filenames, and resume text are excluded from the CSV.
- **Save rules in a popup** — Settings opens a modal dialog. Choose to save on
  viewing a posting or only after clicking LinkedIn's Apply/Easy Apply control.
  Apply-only mode records the click, not a confirmed submission, and also works
  for company-website Apply links. The match slider uses the highest percentage
  across all three resumes: 0% disables the score filter, while 40% requires at
  least one resume scoring 40% or higher. At a positive threshold, missing or
  unscorable resumes do not qualify. Other selected filters still apply at 0%.
  Additional rules filter sponsorship, job-title text, and location text (comma
  separated alternatives, ignoring case), and choose whether revisits update a
  saved row. All rules combine in either mode. Save settings applies changes
  together; closing the dialog discards unsaved edits. Existing settings migrate
  to automatic saving with a 0% threshold. The CSV includes an Apply-click time
  when observed and preserves it on later updates.
- **Clearance capture filter** — capture is off by default, and required-clearance
  jobs are skipped unless Include jobs requiring clearance is enabled. Optional,
  negative, and unclear mentions remain eligible. The panel shows source evidence.
  This heuristic is not a guarantee; review the evidence. Settings persist across
  tabs/restarts. Changing the filter affects future captures, preserving saved rows.
  Failed writes stay in a persistent queue. A background alarm retries roughly
  every 30 seconds while Chrome is running, as well as on worker startup and
  qualifying job events. Chrome may delay alarms. Closing Excel is enough to
  let a queued write succeed on a later retry; another job click is not needed. If
  Chrome expires folder permission, Allow folder access restores it from a
  user click. A paused-save notice appears in the main panel when folder
  access is needed, so blocked writes are visible without opening Settings.
  Allow folder access on that notice renews permission and flushes pending
  jobs. Locked-file waits and other save errors also appear in the panel.
  The worker does not prompt. A deleted folder requires another
  folder selection; jobs stay in local storage until access returns. Selecting
  a folder flushes queued jobs into the appropriate dated files. Folder handles
  are stored in extension IndexedDB. The Downloads permission is not used.
  Clear saved jobs under Manage saved data clears the local archive and empties
  today's CSV; earlier daily files remain. File locks can prevent writes; close
  the CSV in Excel so an automatic retry can succeed. Reopen the CSV after the
  panel reports it saved. Excel’s Save / Don’t Save prompt concerns Excel’s
  own changes and does not flush the extension’s queued jobs. The local-storage quota
  applies to captured descriptions and saved resumes.
- **Three resume tabs** — each keeps its own PDF locally and shows its match
  percentage for the current job. The highest score is highlighted in green;
  ties highlight every top-scoring resume.
- **Saved section order** — use the up/down buttons to move Resume, Title &
  company, Skills & keywords, and Job details. One layout is shared across all
  tabs and persists when the panel reopens. Job details starts first so clearance
  and sponsorship are easy to check. An existing saved resume migrates to tab 1.
- **Request a feature** — opens an email draft to dvardhan89@gmail.com.
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
