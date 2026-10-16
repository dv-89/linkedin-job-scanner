// Scrapes the currently-displayed LinkedIn job posting and reports it to
// the side panel. LinkedIn is a SPA (clicking a job in a list swaps content
// without a page reload), so a debounced MutationObserver re-extracts
// whenever the DOM settles rather than relying on navigation events.
//
// LinkedIn's CSS classes are hashed/atomic (e.g. "_50582c0e") and reused
// across completely unrelated elements, so they're useless as selectors.
// Confirmed (from an actual saved job page) stable anchors instead:
//   - description lives in <div id="JobDetails_AboutTheJob_<jobId>">,
//     with the text itself in a nested [data-testid="expandable-text-box"]
//   - there is no <h1> anywhere on the page; document.title follows the
//     reliable "<Job Title> | <Company> | LinkedIn" format instead
// Alternate description containers and heading-text search are fallbacks if
// a different page layout (e.g. logged-out view) doesn't match the above.
;(function () {
  // Reconnection can race with Chrome's static injection. Retire the previous
  // instance so there is only one observer, Apply listener and message handler.
  globalThis.__jobScannerDispose?.()
  const isJobsPage = () => location.href.startsWith('https://www.linkedin.com/jobs/')
  const DESCRIPTION_HEADINGS = [
    'about the job',
    'about this job',
    'about the role',
    'job description',
    'the role',
  ]

  function currentJobId() {
    return location.href.match(/[?&]currentJobId=(\d+)/)?.[1] ||
      location.href.match(/\/jobs\/view\/(\d+)/)?.[1]
  }

  function findModernDescriptionSection() {
    const jobId = currentJobId()
    if (jobId) return document.querySelector(`[id="JobDetails_AboutTheJob_${jobId}"]`)
    return document.querySelector('[id^="JobDetails_AboutTheJob_"]')
  }

  // Verified against a real saved LinkedIn job page (search-results layout).
  function findDescriptionByKnownContainer() {
    const section = findModernDescriptionSection()
    if (section) {
      const textBox = section.querySelector('[data-testid="expandable-text-box"]')
      const el = textBox || section
      if (el.innerText?.trim()) return el
    }
    for (const selector of [
      '[data-sdui-component="com.linkedin.sdui.generated.jobseeker.dsl.impl.aboutTheJob"]',
      '.jobs-description-content__text',
      '.jobs-description__content',
      '.description__text .show-more-less-html__markup',
    ]) {
      const el = document.querySelector(selector)
      if (el?.innerText?.trim()) return el
    }
    return null
  }

  // Text-anchor heuristic: find an element whose own text is exactly a
  // known section heading (e.g. "About the job"), then use its nearest
  // <section>/parent as the description container. Resilient to hashed
  // class names since it keys off rendered text, not CSS.
  function findDescriptionByHeading() {
    const candidates = document.querySelectorAll('h1, h2, h3, h4, span, div, strong, p')
    for (const el of candidates) {
      // textContent (cheap, no layout) first to filter before touching
      // innerText (forces a reflow) on the much smaller candidate set.
      const raw = (el.textContent || '').trim().toLowerCase()
      if (raw.length > 40 || !DESCRIPTION_HEADINGS.includes(raw)) continue
      // Display-contents wrappers often hold only the heading. Walk a few
      // parents to reach its sibling description, stopping before page chrome.
      let container = el.parentElement
      for (let depth = 0; container && depth < 5; depth++, container = container.parentElement) {
        if (/^(MAIN|BODY|HTML|NAV|HEADER|FOOTER)$/.test(container.tagName)) break
        const textBox = container.querySelector('[data-testid="expandable-text-box"]')
        if (textBox?.innerText?.trim()) return textBox
        const text = (container.innerText || '').trim()
        if (text.length > 150) return container
        if (container.tagName === 'SECTION') break
      }
    }
    return null
  }

  // LinkedIn sets document.title to "<Job Title> | <Company> | LinkedIn".
  // Not affected by CSS hashing at all, and there's no <h1> to fall back on.
  function fromDocumentTitle() {
    const parts = (document.title || '')
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean)
    return {
      title: parts[0] || null,
      company: parts.length >= 3 ? parts[1] : null,
    }
  }

  function readLocationParagraph(paragraph) {
    const [place, ...metadata] = (paragraph.innerText || paragraph.textContent || '').split('·')
    if (!metadata.some((part) => /\b(ago|posted|reposted|applicants?|clicked apply)\b/i.test(part))) return null
    return place.replace(/\s+/g, ' ').trim() || null
  }

  function fromJobHeader(fallback) {
    const jobId = currentJobId()
    let partial = null
    for (const link of document.querySelectorAll('a[href*="/jobs/view/"]')) {
      const linkTitle = (link.textContent || '').replace(/\s+/g, ' ').trim()
      if (!linkTitle) continue
      const href = link.getAttribute?.('href') || link.href || ''
      const linkId = href.match(/\/jobs\/view\/(\d+)(?:[/?#]|$)/)?.[1]
      // On search pages document.title can still say "Jobs | LinkedIn" or
      // name the previously selected posting. Use the current job ID first.
      const matchesJob = jobId && linkId ? linkId === jobId : linkTitle === fallback.title
      if (!matchesJob) continue
      let header = link.parentElement
      for (let depth = 0; header && depth < 6; depth++, header = header.parentElement) {
        if (/^(MAIN|BODY|HTML)$/.test(header.tagName)) break
        // Logo-only company anchors can come before the named company link.
        const companyText = Array.from(header.querySelectorAll('a[href*="/company/"]'))
          .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim()).find(Boolean)
        const company = companyText || fallback.company
        if (!partial || companyText) partial = { title: linkTitle, company }
        for (const paragraph of header.querySelectorAll('p')) {
          const place = readLocationParagraph(paragraph)
          if (place) return { title: linkTitle, company, location: place }
        }
      }
    }
    return partial || fallback
  }

  function findLegacyLocation() {
    // Older detail and public-page layouts expose a dedicated location field.
    const locationEl = document.querySelector(
      '.job-details-jobs-unified-top-card__primary-description-container .tvm__text--low-emphasis, ' +
      '.jobs-unified-top-card__bullet, .topcard__flavor--bullet'
    )
    const locationText = locationEl?.innerText?.replace(/\s+/g, ' ').trim()
    return locationText || null
  }

  function getDescriptionContainer() {
    if (!isJobsPage()) return null
    return (
      findDescriptionByKnownContainer() ||
      findDescriptionByHeading()
    )
  }

  function extractJobData() {
    if (!isJobsPage()) return { type: 'JOB_DATA', url: location.href, title: null, company: null,
      location: null, jobId: null, descriptionText: '' }
    const header = fromJobHeader(fromDocumentTitle())

    const descEl = getDescriptionContainer()
    // A missing description is expected during SPA navigation/hydration.
    // Report an empty loading state and let the observer retry when it arrives.

    return {
      type: 'JOB_DATA',
      url: location.href,
      title: header.title,
      company: header.company,
      location: header.location || findLegacyLocation(),
      jobId: findModernDescriptionSection()?.id?.match(/(\d+)$/)?.[1] || currentJobId() || null,
      descriptionText: descEl ? descEl.innerText.trim() : '',
    }
  }

  // Injected once so the CSS Custom Highlight API (if supported) can paint
  // matches without touching the page's own DOM/React tree.
  const HIGHLIGHT_NAME = 'job-scanner-highlight'
  let highlightStyle = null
  if (window.CSS?.highlights) {
    const style = document.createElement('style')
    style.textContent = `::highlight(${HIGHLIGHT_NAME}) { background-color: #fde047; color: #111; }`
    document.head.appendChild(style)
    highlightStyle = style
  }

  // Collapse rendered whitespace while retaining the DOM offsets for each
  // character. Inline tags can split a word; only whitespace, line breaks,
  // and block boundaries should introduce a separator.
  function buildTextIndex(root) {
    const walker = document.createTreeWalker(
      root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT
    )
    const positions = []
    const blockParents = new WeakMap()
    let text = ''
    let previousBlock = null

    function blockParent(node) {
      let parent = node.parentElement
      while (parent && parent !== root) {
        if (!blockParents.has(parent)) {
          const display = window.getComputedStyle(parent).display
          blockParents.set(parent, /^(block|list-item|table|table-row|flex|grid|flow-root)$/.test(display))
        }
        if (blockParents.get(parent)) return parent
        parent = parent.parentElement
      }
      return root
    }

    function append(char, node, offset) {
      const normalized = /\s/.test(char) ? ' ' : char
      if (normalized === ' ' && (!text || text.endsWith(' '))) return
      text += normalized
      positions.push({ node, offset })
    }

    let node
    while ((node = walker.nextNode())) {
      if (node.nodeType !== Node.TEXT_NODE) {
        if (node.tagName === 'BR') append(' ', null, 0)
        continue
      }
      const block = blockParent(node)
      if (previousBlock && previousBlock !== block) append(' ', null, 0)
      previousBlock = block
      for (let i = 0; i < node.textContent.length; i++) {
        append(node.textContent[i], node, i)
      }
    }
    return { text, positions }
  }

  // LinkedIn's collapsed description keeps a layout artifact from the
  // truncated preview until expanded, which makes highlighting inside a
  // still-collapsed box render as overlapping/garbled text. Expanding first
  // avoids that entirely, and matches the "click more, then it scrolls fine"
  // behavior users hit otherwise.
  const EXPAND_TOGGLE_TEXT = /^(\.\.\.|…)?\s*(more|see more)\s*$/i

  function expandDescriptionIfCollapsed(container) {
    const toggle = Array.from(container.querySelectorAll('button, a')).find((el) =>
      EXPAND_TOGGLE_TEXT.test((el.textContent || '').trim())
    )
    if (!toggle) return false
    toggle.click()
    return true
  }

  async function scrollToText(needle) {
    let container = getDescriptionContainer()
    if (!container || !needle) return false

    if (expandDescriptionIfCollapsed(container)) {
      await new Promise((resolve) => setTimeout(resolve, 150))
      container = getDescriptionContainer() || container
    }

    const normalizedNeedle = needle.replace(/\s+/g, ' ').trim()
    if (!normalizedNeedle) return false
    const { text, positions } = buildTextIndex(container)
    const escapedNeedle = normalizedNeedle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const idx = text.search(new RegExp(escapedNeedle, 'i'))
    if (idx === -1) return false

    const start = positions[idx]
    const end = positions[idx + normalizedNeedle.length - 1]
    if (!start || !end) return false

    const range = document.createRange()
    range.setStart(start.node, start.offset)
    range.setEnd(end.node, end.offset + 1)

    if (window.CSS?.highlights && typeof Highlight !== 'undefined') {
      CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(range))
      setTimeout(() => CSS.highlights.delete(HIGHLIGHT_NAME), 2500)
    } else {
      const selection = window.getSelection()
      selection.removeAllRanges()
      selection.addRange(range)
    }

    const anchor =
      start.node.nodeType === Node.TEXT_NODE
        ? start.node.parentElement
        : start.node
    anchor?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    return true
  }

  let lastSentData = null

  function reportJobData(data) {
    try {
      chrome.runtime.sendMessage(data).catch(() => {})
    } catch {
      // Reloading the extension can invalidate an already-open page's runtime.
      // A synchronous send failure must not escape the DOM observer/click event.
    }
  }

  function sendIfChanged() {
    if (!isJobsPage()) { lastSentData = null; return }
    const data = extractJobData()
    const serialized = JSON.stringify(data)
    if (serialized !== lastSentData) {
      lastSentData = serialized
      reportJobData(data)
    }
  }

  let debounceTimer = null
  const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(sendIfChanged, 600)
  })
  observer.observe(document.body, { childList: true, characterData: true, subtree: true })

  sendIfChanged()
  const startupTimers = [setTimeout(sendIfChanged, 1500), setTimeout(sendIfChanged, 3000)]

  // Observe the user's Apply click before LinkedIn opens an external page or
  // Easy Apply dialog. This records intent, not a completed application.
  function handleApplyClick(event) {
    if (!event.isTrusted || !isJobsPage()) return
    const control = event.target?.closest?.('button, a, [role="button"]')
    if (!control) return
    const label = (control.getAttribute('aria-label') || control.textContent || '').replace(/\s+/g, ' ').trim()
    if (!/^(?:easy\s+)?apply(?:\s+(?:now\b|to\b|for\b|on company website\b).*)?$/i.test(label)) return
    const data = extractJobData()
    if (data.descriptionText) {
      reportJobData({ ...data, type: 'JOB_APPLY_CLICKED' })
    }
  }
  document.addEventListener('click', handleApplyClick, true)

  function handleMessage(message, _sender, sendResponse) {
    if (message?.type === 'REQUEST_JOB_DATA') {
      sendResponse(extractJobData())
    } else if (message?.type === 'SCROLL_TO_TEXT') {
      scrollToText(message.text).then((found) => sendResponse({ found }))
      return true // keep the message channel open for the async response
    }
  }
  chrome.runtime.onMessage.addListener(handleMessage)
  globalThis.__jobScannerDispose = () => {
    observer.disconnect()
    clearTimeout(debounceTimer)
    for (const timer of startupTimers) clearTimeout(timer)
    document.removeEventListener('click', handleApplyClick, true)
    try { chrome.runtime.onMessage.removeListener(handleMessage) } catch { /* Old runtime may be invalidated. */ }
    highlightStyle?.remove()
  }
})()
