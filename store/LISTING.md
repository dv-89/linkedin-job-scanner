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
- Request a feature by opening an email draft to dvardhan89@gmail.com.

Your resume text stays in local browser storage. Job analysis runs on your device. No account with this extension, AI service, subscription, or API key is required. Click Change to remove the saved resume text.

Matching and field detection use dictionary and text heuristics. The score measures keyword overlap, not your likelihood of being hired. Review the evidence in the posting to confirm any detected requirement. Image-only scanned resumes are not supported without a text layer. LinkedIn layout changes may affect extraction.

Independent tool; not affiliated with, endorsed by, or sponsored by LinkedIn.

## Single purpose

Compare a user-selected PDF resume with the LinkedIn job posting being viewed, showing keyword overlap and locating evidence for detected job requirements.

## Permission justifications

storage: Saves up to three user-selected resumes' filenames and extracted text locally so they can be reused across job postings, plus the shared section order. Change deletes the selected tab's resume data. No Chrome Sync storage is used.

sidePanel: Displays the resume upload, keyword analysis, and job-requirement evidence beside the LinkedIn posting.

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
2. Open a LinkedIn jobs posting with a description and click the extension icon to open the side panel.
3. Upload a text-based PDF containing skills such as Python, Linux, and SQL. Use a synthetic resume; personal data is not needed.
4. Confirm the panel shows keyword matches and missing terms from the posting. Click a keyword to locate it in the description.
5. Review detected job fields and click Show evidence or the field's status to locate the supporting phrase when present.
6. Switch to a different job tab; confirm the panel follows that tab. Switch to a non-LinkedIn tab; confirm the prompt to open a job posting appears.
7. Click Change; confirm the resume is removed and the upload control returns. Reopen the panel to confirm the deleted resume is not restored.
8. Upload different synthetic resumes in all three tabs. Confirm each tab keeps its own resume and score, with the highest score highlighted (including ties). Changing one resume leaves the other two intact.
9. Move a section with the up/down controls, switch resume tabs, and reopen the panel. Confirm the section order is shared across tabs and preserved.
10. Confirm Request a feature links to an email draft addressed to dvardhan89@gmail.com; no test email needs to be sent.
