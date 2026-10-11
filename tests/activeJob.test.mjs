import assert from 'node:assert/strict'
import test from 'node:test'
import { subscribeToActiveJob } from '../panel/src/lib/activeJob.js'

const flush = () => new Promise((resolve) => setImmediate(resolve))
const job = (id, descriptionText = `Job ${id}`) => ({
  type: 'JOB_DATA', url: `https://www.linkedin.com/jobs/view/${id}/`, descriptionText,
})
const tab = (id) => ({ id, url: job(id).url, active: true })

function event() {
  const listeners = new Set()
  return {
    addListener: (listener) => listeners.add(listener),
    removeListener: (listener) => listeners.delete(listener),
    emit: (...args) => { for (const listener of listeners) listener(...args) },
    get size() { return listeners.size },
  }
}

function harness() {
  let active = tab(1)
  const pending = []
  const states = []
  const api = {
    tabs: {
      query: async () => [active],
      sendMessage: (id) => new Promise((resolve, reject) => pending.push({ id, resolve, reject })),
      onActivated: event(), onUpdated: event(),
    },
    runtime: { onMessage: event() },
  }
  const stop = subscribeToActiveJob(api, (state) => states.push(state))
  return { api, pending, states, stop, activate(next) {
    active = next
    api.tabs.onActivated.emit({ tabId: next.id })
  } }
}

test('background-tab messages cannot replace the current job', async () => {
  const h = harness()
  await flush()
  h.pending[0].resolve(job(1))
  await flush()
  h.api.runtime.onMessage.emit(job(2), { tab: tab(2) })
  await flush()
  assert.equal(h.states.at(-1).jobData.url, job(1).url)
  h.stop()
})

test('a slow response from the previous tab is discarded', async () => {
  const h = harness()
  await flush()
  h.activate(tab(2))
  await flush()
  assert.equal(h.states.at(-1).jobData, null)
  h.pending[1].resolve(job(2))
  await flush()
  h.pending[0].resolve(job(1))
  await flush()
  assert.equal(h.states.at(-1).jobData.url, job(2).url)
  h.stop()
})

test('non-job tabs stay empty despite delayed replies and background pushes', async () => {
  const h = harness()
  await flush()
  h.activate({ id: 3, url: 'https://example.com/', active: true })
  await flush()
  h.pending[0].resolve(job(1))
  h.api.runtime.onMessage.emit(job(1), { tab: tab(1) })
  await flush()
  assert.deepEqual(h.states.at(-1), { isLinkedInJobPage: false, jobData: null })
  h.stop()
})

test('the newest pushed update supersedes an in-flight pull and older pushes', async () => {
  const h = harness()
  await flush()
  h.api.runtime.onMessage.emit(job(1, 'older'), { tab: tab(1) })
  h.api.runtime.onMessage.emit(job(1, 'newest'), { tab: tab(1) })
  await flush()
  h.pending[0].resolve(job(1, 'old pull'))
  await flush()
  assert.equal(h.states.at(-1).jobData.descriptionText, 'newest')
  h.stop()
})

test('navigation clears the previous job even if the content script is not ready', async () => {
  const h = harness()
  await flush()
  h.pending[0].resolve(job(1))
  await flush()
  h.activate(tab(2))
  await flush()
  h.pending[1].reject(new Error('No receiving end'))
  await flush()
  assert.deepEqual(h.states.at(-1), { isLinkedInJobPage: true, jobData: null })
  h.api.runtime.onMessage.emit(job(1), { tab: tab(2) })
  await flush()
  assert.equal(h.states.at(-1).jobData, null)
  h.stop()
})

test('cleanup removes listeners and prevents late state updates', async () => {
  const h = harness()
  await flush()
  const count = h.states.length
  h.stop()
  h.pending[0].resolve(job(1))
  await flush()
  assert.equal(h.states.length, count)
  assert.equal(h.api.tabs.onActivated.size, 0)
  assert.equal(h.api.tabs.onUpdated.size, 0)
  assert.equal(h.api.runtime.onMessage.size, 0)
})

test('same-tab navigation invalidates the response for the previous URL', async () => {
  const h = harness()
  await flush()
  const nextTab = { ...tab(1), url: job(2).url }
  h.api.tabs.query = async () => [nextTab]
  h.api.tabs.onUpdated.emit(1, { url: nextTab.url }, nextTab)
  await flush()
  h.pending[1].resolve(job(2))
  await flush()
  h.pending[0].resolve(job(1))
  await flush()
  assert.equal(h.states.at(-1).jobData.url, job(2).url)
  h.stop()
})

test('out-of-order active-tab queries cannot restore the previous selection', async () => {
  const h = harness()
  await flush()
  const queries = []
  h.api.tabs.query = () => new Promise((resolve) => queries.push(resolve))
  h.activate(tab(2))
  h.activate(tab(3))
  queries[1]([tab(3)])
  await flush()
  queries[0]([tab(2)])
  await flush()
  assert.equal(h.pending.length, 2)
  assert.equal(h.pending[1].id, 3)
  h.pending[1].resolve(job(3))
  await flush()
  assert.equal(h.states.at(-1).jobData.url, job(3).url)
  h.stop()
})
