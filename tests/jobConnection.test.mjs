import assert from 'node:assert/strict'
import test from 'node:test'
import { requestJobData, installJobConnection } from '../panel/src/lib/jobConnection.js'
import { subscribeToActiveJob } from '../panel/src/lib/activeJob.js'

const flush = () => new Promise((resolve) => setImmediate(resolve))
const jobUrl = 'https://www.linkedin.com/jobs/search/?currentJobId=123'
function event() {
  const listeners = new Set()
  return {
    addListener: (next) => listeners.add(next),
    removeListener: (next) => listeners.delete(next),
    emit: (...args) => { for (const next of listeners) next(...args) },
  }
}
function harness() {
  let tab = { id: 1, active: true, url: jobUrl }
  let ready = false
  const injections = [], requests = []
  const api = {
    tabs: {
      query: async () => [tab], get: async () => tab,
      sendMessage: async (id, message) => {
        requests.push({ id, message })
        if (!ready) throw new Error('Receiving end does not exist')
        return { type: 'JOB_DATA', url: tab.url, title: 'First job', descriptionText: 'Python required' }
      },
      reload() { throw new Error('Must not reload the page') },
      onActivated: event(), onUpdated: event(),
    },
    scripting: { executeScript: async (options) => { injections.push(options); ready = true } },
    runtime: { onMessage: event() },
  }
  return { api, injections, requests, get tab() { return tab }, setTab(next) { tab = next }, setReady() { ready = true } }
}

test('opening the panel loads the first job when its content script is missing', async () => {
  const h = harness(), states = []
  const stop = subscribeToActiveJob(h.api, (state) => states.push(state))
  await flush()
  assert.deepEqual(h.injections, [{ target: { tabId: 1 }, files: ['content.js'] }])
  assert.equal(states.at(-1).jobData.title, 'First job')
  stop()
})

test('entering Jobs through LinkedIn SPA navigation attaches the reader', async () => {
  const h = harness()
  installJobConnection(h.api)
  h.setTab({ ...h.tab, url: 'https://www.linkedin.com/feed/' })
  h.api.tabs.onUpdated.emit(1, { status: 'complete' }, h.tab)
  await flush()
  assert.equal(h.injections.length, 0)
  h.setTab({ ...h.tab, url: jobUrl })
  h.api.tabs.onUpdated.emit(1, { url: jobUrl }, h.tab)
  await flush()
  assert.equal(h.injections.length, 1)
  assert.equal(h.requests.length, 2)
})

test('an existing reader is reused without injection', async () => {
  const h = harness()
  h.setReady()
  assert.equal((await requestJobData(h.api, h.tab)).title, 'First job')
  assert.equal(h.injections.length, 0)
})

test('concurrent connection requests share one injection', async () => {
  const h = harness()
  let finish
  h.api.scripting.executeScript = (options) => {
    h.injections.push(options)
    return new Promise((resolve) => { finish = () => { h.setReady(); resolve([]) } })
  }
  const first = requestJobData(h.api, h.tab), second = requestJobData(h.api, h.tab)
  await flush()
  assert.equal(h.injections.length, 1)
  finish()
  assert.equal((await first).title, 'First job')
  assert.equal((await second).title, 'First job')
})

test('a navigation away prevents injection into a non-job page', async () => {
  const h = harness(), previous = h.tab
  h.setTab({ ...h.tab, url: 'https://www.linkedin.com/feed/' })
  assert.equal(await requestJobData(h.api, previous), null)
  assert.equal(h.injections.length, 0)
})

test('closing the panel cancels reconnection after a delayed missing-reader reply', async () => {
  const h = harness()
  let reject
  h.api.tabs.sendMessage = () => new Promise((_resolve, next) => { reject = next })
  const stop = subscribeToActiveJob(h.api, () => {})
  await flush()
  stop()
  reject(new Error('No receiving end'))
  await flush()
  assert.equal(h.injections.length, 0)
})

test('a denied injection can be retried on the next connection', async () => {
  const h = harness(), execute = h.api.scripting.executeScript
  h.api.scripting.executeScript = async () => { throw new Error('Access denied') }
  await assert.rejects(requestJobData(h.api, h.tab), /Access denied/)
  h.api.scripting.executeScript = execute
  assert.equal((await requestJobData(h.api, h.tab)).title, 'First job')
})

test('a job change during injection cannot return data for the previous URL', async () => {
  const h = harness(), previous = h.tab
  h.api.scripting.executeScript = async () => {
    h.setReady()
    h.setTab({ ...h.tab, url: 'https://www.linkedin.com/jobs/view/456/' })
  }
  assert.equal(await requestJobData(h.api, previous), null)
})

test('non-job calls and inactive-tab events do not attach a reader', async () => {
  const h = harness()
  assert.equal(await requestJobData(h.api, { ...h.tab, url: 'https://example.com/' }), null)
  installJobConnection(h.api)
  h.api.tabs.onUpdated.emit(1, { url: jobUrl }, { ...h.tab, active: false })
  await flush()
  assert.equal(h.injections.length, 0)
})
