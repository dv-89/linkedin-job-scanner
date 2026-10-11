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
function contentHarness(makeNodes) {
  let listener
  let range
  const container = element('DIV', null, 'block')
  container.innerText = 'A job description'
  container.querySelectorAll = () => []
  const nodes = makeNodes(container)
  for (const node of nodes) {
    if (node.parentElement) node.parentElement.scrollIntoView = () => {}
  }
  const document = {
    title: 'Engineer | Company | LinkedIn', body: {},
    querySelector: () => ({ querySelector: () => container }),
    createTreeWalker: () => {
      let i = 0
      return { nextNode: () => nodes[i++] ?? null }
    },
    createRange: () => ({
      setStart(node, offset) { this.start = { node, offset } },
      setEnd(node, offset) { this.end = { node, offset } },
    }),
  }
  vm.runInNewContext(source, {
    document,
    location: { href: 'https://www.linkedin.com/jobs/view/1/' },
    window: {
      getComputedStyle: (node) => ({ display: node.display }),
      getSelection: () => ({ removeAllRanges() {}, addRange(next) { range = next } }),
    },
    Node: { TEXT_NODE: 3 }, NodeFilter: { SHOW_TEXT: 4, SHOW_ELEMENT: 1 },
    MutationObserver: class { observe() {} },
    setTimeout() {}, clearTimeout() {}, console,
    chrome: { runtime: {
      sendMessage: async () => {}, onMessage: { addListener(next) { listener = next } },
    } },
  })
  return {
    nodes,
    async locate(needle) {
      const response = await new Promise((resolve) => listener({ type: 'SCROLL_TO_TEXT', text: needle }, {}, resolve))
      return { ...response, range }
    },
  }
}

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
