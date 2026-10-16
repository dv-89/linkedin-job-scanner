# Chrome Web Store listing draft

## Name

LinkedIn Job Scanner

## Short description

Compare your PDF resume with LinkedIn job postings. See keyword overlap and locate clearance, sponsorship, and experience mentions.

## Detailed description

Compare your resume with the LinkedIn job posting you are viewing, without sending your resume to a server.

Upload a text-based PDF resume, open a LinkedIn job posting, and click the extension icon to open Job Scanner in Chrome's side panel.

Features:
- Save up to three PDF resumes in separate tabs, compare their match percentages, and see the highest match highlighted in green.
- Move Resume, Title & company, Skills & keywords, and Job details with up/down buttons. The layout is shared across tabs and saved locally; Job details starts at the top.
- See which keywords from a curated skills dictionary appear in both your resume and the posting.
- Review missing keywords and copy the list.
- Detect mentions of security clearance, visa sponsorship, expected years of experience, and preferred qualifications.
- View the source evidence and click a detected field or keyword to scroll to it in the posting.
- Follow the active job tab as you browse postings.
- Enable Save CSV files to a folder in Settings, select a folder once, and save settings. Jobs are written directly to jobs-YYYY-MM-DD.csv inside that folder, using your local date. Each day uses one file. The folder is remembered; no Downloads API or recurring Save As dialog is used. Toggle off to stop captures and writes while preserving saved data. CSV columns: Apply clicked (UTC), Title, Company, Location, Job URL, Clearance, Sponsorship, Expected experience, Citizenship / work eligibility, Best resume match (%), Best resume slot(s). Existing job rows are preserved, and other columns are removed.
- Choose whether capture includes jobs requiring clearance (excluded by default). Change the destination folder or clear saved jobs in Settings. Full resume paths are unavailable to browser uploads.
- Open Settings as a popup and choose saving on viewing a job or only after clicking Apply/Easy Apply. Set a minimum resume-match slider: 0% accepts any match, and 40% requires at least one saved resume matching 40% or more. Additional sponsorship, title, and location filters combine with the score rule. Choose whether to update saved jobs on revisits; Save settings applies the rules together. Apply-click recording is not confirmation of a submitted application.
- Request a feature by opening an email draft to dvardhan89@gmail.com.

Your resume text stays in local browser storage. Job analysis runs on your device. No account with this extension, AI service, subscription, or API key is required. Click Change to remove the saved resume text.

Matching and field detection use dictionary and text heuristics. The score measures keyword overlap, not your likelihood of being hired. Review the evidence in the posting to confirm any detected requirement. Image-only scanned resumes are not supported without a text layer. LinkedIn layout changes may affect extraction.

Independent tool; not affiliated with, endorsed by, or sponsored by LinkedIn.

## Single purpose

Compare a user-selected PDF resume with the LinkedIn job posting being viewed, showing keyword overlap and locating evidence for detected job requirements.

## Permission justifications

storage: Saves up to three user-selected resumes' filenames and extracted text locally so they can be reused across job postings, plus the shared section order, capture settings, and optionally captured postings. Change deletes the selected tab's resume data; Clear saved jobs removes the captured archive. No Chrome Sync storage is used.

Folder access: No Downloads permission is used. Chrome’s folder picker grants read/write access to one folder selected by the user. Its handle is kept in extension IndexedDB. Only dated Job Scanner CSVs in that folder are read and updated. If access expires, a visible notice in the main panel provides Allow folder access to renew it from the user’s click and flush pending jobs. The notice distinguishes paused folder access from a queued file-lock retry; pending jobs stay locally until access returns. A deleted folder must be replaced by selecting another folder. Saving is off by default.

alarms: Retries locally queued CSV writes roughly every 30 seconds while Chrome is running, including when Excel temporarily locks a file. Failed writes are persisted by date, restored after worker restarts, and removed only after the write closes successfully. The alarm is cleared when the queue empties, saving is disabled, or folder access must be restored. No new settings or network access are used.

sidePanel: Displays the resume upload, keyword analysis, and job-requirement evidence beside the LinkedIn posting.

scripting: Attaches the bundled content.js reader to an existing LinkedIn jobs tab when it is missing, including navigation from LinkedIn's home page without a full page load and tabs open during an extension update. Injection is limited to https://www.linkedin.com/jobs/* using existing LinkedIn host access. No remote code is injected.

https://www.linkedin.com/*: Allows the extension to identify the active LinkedIn tab. The content script is restricted to https://www.linkedin.com/jobs/* and reads job titles, company names, descriptions, and URLs for analysis; it scrolls/highlights evidence when requested. No access to all websites is requested.

## Remote code

No. JavaScript, React, the PDF parser, and the PDF worker are bundled in the ZIP. No remote scripts or AI endpoints are used.

## Privacy practices facts

- Handles the filename and extracted text of a user-selected resume, potentially including personally identifiable information.
- Reads job-posting website content and the URLs of LinkedIn job pages.
- Processes this information locally; no data is transmitted off the device by the extension.
- Does not access authentication information, private communications, payment details, or browser history databases as features.
- No analytics, advertising, data sales, AI training, credit decisions, or unrelated data use.
- Use these facts to complete the dashboard's current data-usage questions accurately; local processing does not remove the need for a privacy policy.

## Suggested listing settings

Language: English. Category: Productivity (select the closest current dashboard category). Price: Free. Visibility: Public. Distribution regions: choose your intended markets in the dashboard.

Publisher name and support email: not chosen yet; set these in your developer account before submitting. Privacy policy URL: host docs/privacy.html at a public HTTPS URL and verify it works without signing in.

## Reviewer test instructions

1. Use a current desktop Chrome version (140 or later) and sign in to LinkedIn with your own test account if LinkedIn requires it. The extension has no separate login.
2. Start on LinkedIn's home page, search for jobs, select the first posting, and click the extension icon to open the side panel. Confirm the posting loads without refreshing. Reload the extension while the job tab stays open, reopen the panel, and confirm it reconnects without refreshing the page. Reconnection must not duplicate Apply-click events or captured rows.
3. Upload a text-based PDF containing skills such as Python, Linux, and SQL. Use a synthetic resume; personal data is not needed.
4. Confirm the panel shows keyword matches and missing terms from the posting. Click a keyword to locate it in the description.
5. Review detected job fields and click Show evidence or the field's status to locate the supporting phrase when present.
6. Switch to a different job tab; confirm the panel follows that tab. Switch to a non-LinkedIn tab; confirm the prompt to open a job posting appears.
7. Click Change; confirm the resume is removed and the upload control returns. Reopen the panel to confirm the deleted resume is not restored.
8. Upload different synthetic resumes in all three tabs. Confirm each tab keeps its own resume and score, with the highest score highlighted (including ties). Changing one resume leaves the other two intact.
9. Move a section with the up/down controls, switch resume tabs, and reopen the panel. Confirm the section order is shared across tabs and preserved.
10. Confirm Request a feature links to an email draft addressed to dvardhan89@gmail.com; no test email needs to be sent.
11. Open Settings. Confirm Save CSV files to a folder defaults off. Toggle it on: a folder picker must appear. Cancel and confirm saving stays off. Enable again, select a test folder, then Save settings. View two qualifying jobs and verify jobs-YYYY-MM-DD.csv inside that folder contains both rows and exactly the 11 listed columns. No download or Save As dialog should appear. Revisit a job and confirm no duplicate row. After local midnight, the first save creates a new dated file while yesterday’s file stays unchanged. Existing job rows in a daily CSV must be preserved, including rows missing from local storage.
12. View a posting explicitly requiring clearance; confirm it is skipped with clearance inclusion off. Open Clearance, sponsorship & other filters, enable Include jobs requiring clearance, click Save settings, then view that posting again; confirm it is captured. Optional clearance mentions remain eligible. Review the source evidence since detection is heuristic.
13. Close the panel, view another job, and verify the daily CSV gained a row. Toggle saving off and Save settings: new views, Apply clicks, and restarts must not write files. Under Manage saved data, Clear saved jobs (then Confirm clear) clears the local archive and today’s CSV; earlier files remain. Expire folder permission and confirm jobs queue locally with an Allow folder access button. Restore access and confirm queued jobs flush. Delete the selected folder and confirm another folder is required without falling back to downloads. Restart after a failed save and verify pending data retries while saving is enabled. Open today’s CSV in Excel, view another qualifying job, and check the waiting status. Close Excel without needing to open another job; the next scheduled retry should write queued rows. Reopen the CSV after the saved status appears. Keep yesterday’s CSV locked while today’s file saves and confirm yesterday’s queued rows still retry. Disable saving while a retry is queued and verify the alarm cannot write until saving is re-enabled.
14. Confirm Settings opens a modal popup without shifting the main panel. Change a rule without saving and close/reopen; the saved value should return. Set Apply-only mode and save settings; merely viewing a new job must not save it. Clicking its Apply/Easy Apply control should save it if the filters pass, recording an Apply-click time rather than claiming application completion.
15. Set the match slider to 40%. Confirm a posting qualifies when any one of the three resumes scores at least 40%, even if another resume tab is selected. Set a threshold higher than every resume's score and confirm it is skipped. At 0%, jobs with no score can be captured if the other rules pass. Apply-only mode must still enforce the threshold.
