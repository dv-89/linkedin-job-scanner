import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'

const source = fs.readFileSync(new URL('../content.js', import.meta.url), 'utf8')

function element(tagName, parentElement = null, display = 'inline') {
  return { nodeType: 1, tagName, parentElement, display }
}

function text(textContent, parentElement) {
  return { nodeType: 3, textContent, parentElement }
}

// Exercise the content script's real message listener and DOM Range creation.
function contentHarness(makeNodes, {
  locationEl = null, titleLinks = [], descriptionPresent = true, selectors = {}, headings = [],
  pageTitle = 'Engineer | Company | LinkedIn', url = 'https://www.linkedin.com/jobs/view/1/', runtimeSend = null,
} = {}) {
  let listener
  let range
  let onMutation
  const clickListeners = new Set()
  const messageListeners = new Set()
  const observers = new Set()
  const timers = []
  const messages = []
  const warnings = []
  let observedOptions
  const container = element('DIV', null, 'block')
  container.innerText = 'A job description'
  container.querySelectorAll = () => []
  const section = { id: 'JobDetails_AboutTheJob_1', querySelector: () => container }
  const nodes = makeNodes(container)
  for (const node of nodes) {
    if (node.parentElement) node.parentElement.scrollIntoView = () => {}
  }
  const document = {
    title: pageTitle, body: {},
    querySelector: (selector) => {
      if (selector === '[id="JobDetails_AboutTheJob_1"]' || selector === '[id^="JobDetails_AboutTheJob_"]') {
        return descriptionPresent ? section : null
      }
      if (selector.includes('topcard__flavor--bullet')) return locationEl
      return selectors[selector] || null
    },
    querySelectorAll: (selector) => selector.startsWith('h1,') ? headings : titleLinks,
    addEventListener(type, callback) { if (type === 'click') clickListeners.add(callback) },
    removeEventListener(type, callback) { if (type === 'click') clickListeners.delete(callback) },
    createTreeWalker: () => {
      let i = 0
      return { nextNode: () => nodes[i++] ?? null }
    },
    createRange: () => ({
      setStart(node, offset) { this.start = { node, offset } },
      setEnd(node, offset) { this.end = { node, offset } },
    }),
  }
  const context = vm.createContext({
    document,
    location: { href: url },
    window: {
      getComputedStyle: (node) => ({ display: node.display }),
      getSelection: () => ({ removeAllRanges() {}, addRange(next) { range = next } }),
    },
    Node: { TEXT_NODE: 3 }, NodeFilter: { SHOW_TEXT: 4, SHOW_ELEMENT: 1 },
    MutationObserver: class {
      constructor(callback) { onMutation = callback }
      observe(_root, options) { observedOptions = options; observers.add(this) }
      disconnect() { observers.delete(this) }
    },
    setTimeout(callback) { timers.push(callback) }, clearTimeout() {},
    console: { ...console, warn: (...args) => warnings.push(args) },
    chrome: { runtime: {
      sendMessage: runtimeSend || (async (data) => { messages.push(data) }),
      onMessage: {
        addListener(next) { listener = next; messageListeners.add(next) },
        removeListener(next) { messageListeners.delete(next) },
      },
    } },
  })
  vm.runInContext(source, context)
  return {
    nodes,
    messages,
    warnings,
    reinject() { vm.runInContext(source, context) },
    setUrl(value) { context.location.href = value },
    get instanceCounts() { return { clicks: clickListeners.size, messages: messageListeners.size, observers: observers.size } },
    get observedOptions() { return observedOptions },
    setDescriptionPresent(value) { descriptionPresent = value },
    setDescriptionText(value) { container.innerText = value },
    clickApply(label, { trusted = true, ariaLabel = null } = {}) {
      for (const onClick of clickListeners) onClick({ isTrusted: trusted, target: { closest: () => ({
        textContent: label, getAttribute: () => ariaLabel,
      }) } })
    },
    getJobData() {
      let data
      listener({ type: 'REQUEST_JOB_DATA' }, {}, (response) => { data = response })
      return data
    },
    refresh() {
      onMutation()
      timers.at(-1)()
    },
    async locate(needle) {
      const response = await new Promise((resolve) => listener({ type: 'SCROLL_TO_TEXT', text: needle }, {}, resolve))
      return { ...response, range }
    },
  }
}

test('SPA navigation into Jobs reports the first posting and stops reading after leaving Jobs', () => {
  const h = contentHarness(() => [], { url: 'https://www.linkedin.com/feed/' })
  assert.equal(h.messages.length, 0)
  assert.equal(h.getJobData().descriptionText, '')
  h.setUrl('https://www.linkedin.com/jobs/view/1/')
  h.refresh()
  assert.equal(h.messages.at(-1).descriptionText, 'A job description')
  const count = h.messages.length
  h.setUrl('https://www.linkedin.com/feed/')
  h.refresh()
  h.clickApply('Apply')
  assert.equal(h.messages.length, count)
  h.setUrl('https://www.linkedin.com/jobs/view/1/')
  h.refresh()
  assert.equal(h.messages.length, count + 1)
})

test('reconnecting replaces the reader without duplicate observers or Apply events', () => {
  const h = contentHarness(() => [])
  h.reinject()
  h.reinject()
  assert.deepEqual(h.instanceCounts, { clicks: 1, messages: 1, observers: 1 })
  const count = h.messages.length
  h.clickApply('Apply')
  assert.equal(h.messages.length, count + 1)
  assert.equal(h.messages.at(-1).type, 'JOB_APPLY_CLICKED')
  assert.equal(h.getJobData().descriptionText, 'A job description')
})

test('highlighting spans inline tags without introducing extra whitespace', async () => {
  const h = contentHarness((root) => [
    text('5+ ', root), text('years', element('STRONG', root)), text(' of experience', root),
  ])
  const { found, range } = await h.locate('5+ years')
  assert.equal(found, true)
  assert.equal(range.start.node, h.nodes[0])
  assert.equal(range.start.offset, 0)
  assert.equal(range.end.node, h.nodes[1])
  assert.equal(range.end.offset, 5)
})

test('job data includes the dedicated location field with normalized whitespace', () => {
  const h = contentHarness(() => [], { locationEl: { innerText: '  Austin,\n TX (Hybrid)  ' } })
  assert.equal(h.getJobData().location, 'Austin, TX (Hybrid)')
  assert.equal(h.messages[0].location, 'Austin, TX (Hybrid)')
})

test('a missing description during startup is a quiet loading state that recovers when it appears', () => {
  const h = contentHarness(() => [], { descriptionPresent: false })
  assert.equal(h.messages[0].descriptionText, '')
  assert.equal(h.warnings.length, 0)
  // Hydration can happen after the initial delayed reads have already run.
  h.setDescriptionPresent(true)
  h.refresh()
  assert.equal(h.messages.at(-1).descriptionText, 'A job description')
  assert.equal(h.messages.at(-1).jobId, '1')
})

test('text-node hydration is observed and a temporarily removed description clears stale analysis', () => {
  const h = contentHarness(() => [])
  assert.equal(h.observedOptions.characterData, true)
  h.setDescriptionText('')
  h.refresh()
  assert.equal(h.messages.at(-1).descriptionText, '')
  h.setDescriptionText('The next posting has loaded.')
  h.refresh()
  assert.equal(h.messages.at(-1).descriptionText, 'The next posting has loaded.')
  assert.equal(h.warnings.length, 0)
})

test('alternate LinkedIn description containers are read without a modern section ID', () => {
  for (const selector of [
    '[data-sdui-component="com.linkedin.sdui.generated.jobseeker.dsl.impl.aboutTheJob"]',
    '.jobs-description-content__text', '.jobs-description__content',
    '.description__text .show-more-less-html__markup',
  ]) {
    const h = contentHarness(() => [], { descriptionPresent: false, selectors: {
      [selector]: { innerText: 'Alternate layout job description' },
    } })
    assert.equal(h.getJobData().descriptionText, 'Alternate layout job description', selector)
  }
})

test('heading fallback climbs display wrappers to find the sibling description', () => {
  const section = { tagName: 'SECTION', innerText: 'About the job\n' + 'Actual job description. '.repeat(12), querySelector: () => null }
  const wrapper = { tagName: 'DIV', parentElement: section, innerText: 'About the job', querySelector: () => null }
  const h = contentHarness(() => [], { descriptionPresent: false, headings: [
    { textContent: 'About the job', parentElement: wrapper },
  ] })
  assert.equal(h.getJobData().descriptionText, section.innerText.trim())
})

test('heading fallback does not mistake a large main page block for a job description', () => {
  const main = { tagName: 'MAIN', innerText: 'Unrelated job cards and page content. '.repeat(30) }
  const wrapper = { tagName: 'DIV', parentElement: main, innerText: 'About the job', querySelector: () => null }
  const h = contentHarness(() => [], { descriptionPresent: false, headings: [
    { textContent: 'About the job', parentElement: wrapper },
  ] })
  assert.equal(h.getJobData().descriptionText, '')
})

test('trusted Apply and Easy Apply clicks capture the current posting before navigation', () => {
  for (const label of ['Apply', 'Easy Apply', 'Apply on company website', 'Easy Apply to Engineer at Company']) {
    const h = contentHarness(() => [])
    h.clickApply(label)
    assert.equal(h.messages.at(-1).type, 'JOB_APPLY_CLICKED', label)
    assert.equal(h.messages.at(-1).title, 'Engineer')
    assert.equal(h.messages.at(-1).url, 'https://www.linkedin.com/jobs/view/1/')
  }
})

test('filter buttons, submit actions and scripted clicks do not trigger Apply capture', () => {
  const h = contentHarness(() => [])
  for (const label of ['Apply filters', 'Apply changes', 'Submit application', 'Show jobs', 'Save']) h.clickApply(label)
  h.clickApply('Apply', { trusted: false })
  h.clickApply('Apply', { ariaLabel: 'Apply filters' })
  assert.equal(h.messages.length, 1)
})

test('hashed-class layout reads location beside the job title, excluding posting statistics', () => {
  const header = {
    querySelectorAll: () => [{ innerText: 'Illinois, United States · Reposted 3 days ago · 71 people clicked apply' }],
  }
  const titleRow = { parentElement: header, querySelectorAll: () => [] }
  const h = contentHarness(() => [], { titleLinks: [
    { textContent: 'A different job', parentElement: { querySelectorAll: () => [{ innerText: 'Wrong city · 2 days ago' }] } },
    { textContent: 'Engineer', parentElement: titleRow },
  ] })
  assert.equal(h.getJobData().location, 'Illinois, United States')
})

test('current job ID finds the supplied New York header despite a generic or stale browser title', () => {
  const company = { textContent: 'ElevenLabs' }
  const header = {
    tagName: 'DIV',
    querySelectorAll: (selector) => selector === 'p'
      ? [{ innerText: 'New York, United States · 3 days ago · Over 100 people clicked apply' }]
      : [{ textContent: '' }, company],
  }
  const row = { tagName: 'DIV', parentElement: header, querySelectorAll: () => [] }
  const link = {
    textContent: 'Site Reliability Engineer', parentElement: row,
    getAttribute: () => 'https://www.linkedin.com/jobs/view/4479003176/?trackingId=test',
  }
  for (const pageTitle of ['Jobs | LinkedIn', 'Previous Job | Previous Company | LinkedIn']) {
    const h = contentHarness(() => [], {
      descriptionPresent: false, pageTitle,
      url: 'https://www.linkedin.com/jobs/search-results/?currentJobId=4479003176',
      locationEl: { innerText: 'Incorrect legacy location' },
      titleLinks: [
        { textContent: 'Site Reliability Engineer', getAttribute: () => '/jobs/view/999999/', parentElement: header },
        link,
      ],
    })
    const data = h.getJobData()
    assert.equal(data.title, 'Site Reliability Engineer')
    assert.equal(data.company, 'ElevenLabs')
    assert.equal(data.location, 'New York, United States')
    assert.equal(data.jobId, '4479003176')
    assert.equal(data.descriptionText, '')
  }
})

test('extension reload messaging failures do not escape startup, mutations or Apply clicks', () => {
  let h
  assert.doesNotThrow(() => { h = contentHarness(() => [], { runtimeSend: () => { throw new Error('Extension context invalidated.') } }) })
  h.setDescriptionText('Updated job description')
  assert.doesNotThrow(() => h.refresh())
  assert.doesNotThrow(() => h.clickApply('Apply'))
  assert.equal(h.getJobData().descriptionText, 'Updated job description')
})

test('missing location remains empty', () => {
  const h = contentHarness(() => [])
  assert.equal(h.getJobData().location, null)
})

test('location-only changes are pushed and repeated data is not sent again', () => {
  const locationEl = { innerText: 'Chicago, IL' }
  const h = contentHarness(() => [], { locationEl })
  h.refresh()
  assert.equal(h.messages.length, 1)
  locationEl.innerText = 'New York, NY'
  h.refresh()
  assert.equal(h.messages.length, 2)
  assert.equal(h.messages.at(-1).location, 'New York, NY')
  locationEl.innerText = ''
  h.refresh()
  assert.equal(h.messages.at(-1).location, null)
})

test('normalizing whitespace preserves the original range offsets', async () => {
  const h = contentHarness((root) => [text('Minimum\n\t of\u00a0  5 years', root)])
  const { found, range } = await h.locate('minimum of 5 years')
  assert.equal(found, true)
  assert.equal(range.start.offset, 0)
  assert.equal(range.end.offset, h.nodes[0].textContent.length)
})

test('inline tags can split words without changing the match', async () => {
  const h = contentHarness((root) => [text('Kuber', root), text('netes', element('STRONG', root))])
  assert.equal((await h.locate('Kubernetes')).found, true)
})

test('line breaks and block boundaries separate words', async () => {
  for (const makeNodes of [
    (root) => [text('5+', root), element('BR', root), text('years', root)],
    (root) => [text('5+', element('P', root, 'block')), text('years', element('P', root, 'block'))],
  ]) {
    const h = contentHarness(makeNodes)
    assert.equal((await h.locate('5+ years')).found, true)
    assert.equal((await h.locate('5+years')).found, false)
  }
})

test('punctuation is literal and absent or blank phrases do not create ranges', async () => {
  const h = contentHarness((root) => [text('C++ and .NET experience', root)])
  assert.equal((await h.locate('C++')).found, true)
  assert.equal((await h.locate('.NET')).found, true)
  assert.equal((await h.locate('Python')).found, false)
  assert.equal((await h.locate('   ')).found, false)
})
