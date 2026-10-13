# First Chrome Web Store submission

## Prepared files

- Upload ZIP: releases/linkedin-job-scanner-0.1.1.zip (generated; not committed).
- Extension and store icon: icons/icon-128.png.
- Small promotional tile: store/promo-440x280.png.
- Listing copy, purpose, permission explanations, privacy facts, and test instructions: store/LISTING.md.
- Privacy policy page: docs/privacy.html; also included inside the extension.
- Draft store preview: store/preview-1280x800.png, showing the built panel with clearly labeled sample data.

Run `npm run package` to rebuild the ZIP. Only runtime files are copied, with manifest.json at its root. Source, tests, demo data, dependencies, and Git files are excluded. The packaging script requires Windows PowerShell.

The package requires Chrome 140 or later because the bundled modern PDF.js worker uses native typed-array hex/base64 APIs introduced in Chrome 140. It does not load compatibility code remotely.

## Your account

1. Visit https://chrome.google.com/webstore/devconsole and sign in with the Google account you want to own the extension.
2. Complete registration, accept the developer agreement yourself, and pay the one-time fee shown by Google.
3. Complete the account profile and any verification requested by the dashboard, and enable Google account two-step verification if requested.
4. Choose a public publisher name and a monitored support/contact email. A personal name or a small product/studio name is sufficient; you do not need to invent a company.

No store submission has been made. Do not include placeholder publisher or contact details.

## Before submission

Host docs/privacy.html at a public HTTPS URL. One option is GitHub Pages serving /docs from main, if your repository/account supports it. The expected URL with that configuration would be https://dv-89.github.io/linkedin-job-scanner/privacy.html; this URL is not currently verified or enabled by this preparation work. Test your chosen URL without signing in before using it in the listing.

Load the ZIP's contents as an unpacked extension in a clean Chrome profile and perform the reviewer steps in LISTING.md against a real LinkedIn posting. Capture at least one actual extension screenshot at 1280x800 or 640x400. Preview images rendered with sample data are drafts and should be checked against the installed extension before uploading.

## Dashboard submission

1. Add a new item and upload the ZIP.
2. Fill the Store listing fields from LISTING.md, upload the 128x128 icon and 440x280 promotional tile, and add your screenshot(s).
3. Fill Privacy practices: single purpose, permission justifications, no remote code, accurate data-use disclosures, and the working privacy-policy URL.
4. Enter reviewer test instructions. LinkedIn access may require the reviewer to sign in to LinkedIn; no separate extension credentials exist.
5. Select Public visibility, Free pricing, and your distribution regions.
6. Resolve the dashboard's outstanding fields and validation messages, then submit for review. Google reviews the extension before it becomes available. Choose whether to publish automatically after approval or defer publication.

## Updating an existing listing

1. Increment manifest.json's version and keep the root package.json version in sync.
2. Run `npm run package` and test the generated package locally.
3. Open the existing item in the Developer Dashboard, then select Package > Upload New Package and upload the new version's ZIP from releases/.
4. Update listing copy and screenshots as needed, using LISTING.md for the current features and reviewer instructions.
5. Submit for review and choose automatic or deferred publication. If the previous submission is still awaiting review, cancel that review before replacing the package.

The ZIP and built panel are generated locally and excluded from Git. Pushing source to GitHub does not publish the Chrome Web Store update.

## Official references

- https://developer.chrome.com/docs/webstore/register
- https://developer.chrome.com/docs/webstore/prepare
- https://developer.chrome.com/docs/webstore/images
- https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
- https://developer.chrome.com/docs/webstore/publish
