import assert from 'node:assert/strict'
import test from 'node:test'
import { getPanelState, setResume, clearResume, setSectionOrder, DEFAULT_SECTION_ORDER } from '../panel/src/lib/storage.js'

function storage(initial = {}) {
  const saved = structuredClone(initial)
  globalThis.chrome = { storage: { local: {
    get: async (keys) => Object.fromEntries(keys.filter((key) => Object.hasOwn(saved, key)).map((key) => [key, saved[key]])),
    set: async (values) => Object.assign(saved, values),
    remove: async (key) => { delete saved[key] },
  } } }
  return saved
}

const resume = (name) => ({ fileName: `${name}.pdf`, text: name })

test('existing resume migrates to tab 1 once, without returning after removal', async () => {
  const saved = storage({ resume: resume('legacy') })
  assert.deepEqual((await getPanelState()).resumes, [resume('legacy'), null, null])
  assert.equal(Object.hasOwn(saved, 'resume'), false)
  await clearResume('resume-1')
  assert.deepEqual((await getPanelState()).resumes, [null, null, null])
})

test('migration preserves a newer first-tab resume', async () => {
  storage({ resume: resume('legacy'), 'resume-1': resume('new') })
  assert.deepEqual((await getPanelState()).resumes[0], resume('new'))
})

test('concurrent uploads persist independently and clearing affects only one tab', async () => {
  storage()
  await Promise.all([
    setResume('resume-1', resume('one')),
    setResume('resume-2', resume('two')),
    setResume('resume-3', resume('three')),
  ])
  await clearResume('resume-2')
  assert.deepEqual((await getPanelState()).resumes, [resume('one'), null, resume('three')])
})

test('default layout starts with job details and a custom layout survives reopening', async () => {
  storage()
  assert.deepEqual((await getPanelState()).sectionOrder, DEFAULT_SECTION_ORDER)
  const order = ['keywords', 'job', 'details', 'resume']
  await setSectionOrder(order)
  assert.deepEqual((await getPanelState()).sectionOrder, order)
})

test('invalid saved layouts keep every section once', async () => {
  storage({ sectionOrder: ['resume', 'unknown', 'resume'] })
  assert.deepEqual((await getPanelState()).sectionOrder, ['resume', 'details', 'job', 'keywords'])
  storage({ sectionOrder: 'invalid' })
  assert.deepEqual((await getPanelState()).sectionOrder, DEFAULT_SECTION_ORDER)
})

test('unknown slots cannot overwrite layout or other storage entries', async () => {
  storage()
  await assert.rejects(setResume('sectionOrder', resume('one')), /Unknown resume slot/)
  await assert.rejects(clearResume('sectionOrder'), /Unknown resume slot/)
})

test('storage failures propagate so the UI can keep the previous state', async () => {
  storage()
  chrome.storage.local.set = async () => { throw new Error('Storage unavailable') }
  await assert.rejects(setResume('resume-1', resume('one')), /Storage unavailable/)
  await assert.rejects(setSectionOrder(DEFAULT_SECTION_ORDER), /Storage unavailable/)
})
