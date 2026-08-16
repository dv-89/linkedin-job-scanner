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
// Heading-text search and "biggest text block" remain as fallbacks in case
// a different page layout (e.g. logged-out view) doesn't match the above.
;(function () {
  const DESCRIPTION_HEADINGS = [
    'about the job',
    'about this job',
    'about the role',
    'job description',
    'the role',
  ]

  // Verified against a real saved LinkedIn job page (search-results layout).
  function findDescriptionByKnownContainer() {
    const section = document.querySelector('[id^="JobDetails_AboutTheJob_"]')
    if (!section) return null
    const textBox = section.querySelector('[data-testid="expandable-text-box"]')
    const el = textBox || section
    return el.innerText && el.innerText.trim().length > 0 ? el : null
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
      const container = el.closest('section') || el.parentElement
      if (!container) continue
      const text = (container.innerText || '').trim()
      if (text.length > 150) return container
    }
    return null
  }

  // Last-resort fallback: the leaf-ish element (no nested div/section/
  // article) with the most text inside <main>. Job descriptions tend to be
  // long, relatively flat text blocks, unlike nav/list chrome around them.
  function findLargestTextBlock() {
    const root = document.querySelector('main') || document.body
    let best = null
    let bestLength = 0
    for (const el of root.querySelectorAll('div, section, article')) {
      if (el.querySelector('div, section, article')) continue
      const len = (el.innerText || '').trim().length
      if (len > bestLength) {
        bestLength = len
        best = el
      }
    }
    return bestLength > 200 ? best : null
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

  function getDescriptionContainer() {
    return (
      findDescriptionByKnownContainer() ||
      findDescriptionByHeading() ||
      findLargestTextBlock()
    )
  }

  function extractJobData() {
    const { title, company } = fromDocumentTitle()

    const descEl = getDescriptionContainer()
    if (!descEl) {
      console.warn('[JobScanner] could not find job description container')
    }

    return {
      type: 'JOB_DATA',
      url: location.href,
      title,
      company,
      descriptionText: descEl ? descEl.innerText.trim() : '',
    }
  }

  // Injected once so the CSS Custom Highlight API (if supported) can paint
  // matches without touching the page's own DOM/React tree.
  const HIGHLIGHT_NAME = 'job-scanner-highlight'
  if (window.CSS?.highlights) {
    const style = document.createElement('style')
    style.textContent = `::highlight(${HIGHLIGHT_NAME}) { background-color: #fde047; color: #111; }`
    document.head.appendChild(style)
  }

  // Concatenates all text nodes under `root` into one string (joined with a
  // single space at each node boundary so words never accidentally fuse),
  // tracking each node's start offset - lets us search across nodes split
  // by inline tags (<strong>, <br>, <li>, ...) and map a match back to a
  // real DOM Range for highlighting/scrolling.
  function buildTextIndex(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    const nodes = []
    let text = ''
    let node
    while ((node = walker.nextNode())) {
      nodes.push({ node, start: text.length })
      text += node.textContent + ' '
    }
    return { text, nodes }
  }

  function locateOffset(nodes, offset) {
    for (let i = nodes.length - 1; i >= 0; i--) {
      if (offset >= nodes[i].start) {
        const within = offset - nodes[i].start
        const clamped = Math.min(within, nodes[i].node.textContent.length)
        return { node: nodes[i].node, offset: clamped }
      }
    }
    return null
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

    const { text, nodes } = buildTextIndex(container)
    const idx = text.toLowerCase().indexOf(needle.trim().toLowerCase())
    if (idx === -1) return false

    const start = locateOffset(nodes, idx)
    const end = locateOffset(nodes, idx + needle.trim().length)
    if (!start || !end) return false

    const range = document.createRange()
    range.setStart(start.node, start.offset)
    range.setEnd(end.node, end.offset)

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

  let lastSentDescription = null

  function sendIfChanged() {
    const data = extractJobData()
    if (data.descriptionText && data.descriptionText !== lastSentDescription) {
      lastSentDescription = data.descriptionText
      chrome.runtime.sendMessage(data).catch(() => {
        // No listener yet (side panel not open) - fine, it will pull via
        // REQUEST_JOB_DATA when it opens.
      })
    }
  }

  let debounceTimer = null
  const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(sendIfChanged, 600)
  })
  observer.observe(document.body, { childList: true, subtree: true })

  sendIfChanged()
  setTimeout(sendIfChanged, 1500)
  setTimeout(sendIfChanged, 3000)

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'REQUEST_JOB_DATA') {
      sendResponse(extractJobData())
    } else if (message?.type === 'SCROLL_TO_TEXT') {
      scrollToText(message.text).then((found) => sendResponse({ found }))
      return true // keep the message channel open for the async response
    }
  })
})()
