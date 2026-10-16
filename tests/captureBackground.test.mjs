import assert from 'node:assert/strict'
import test from 'node:test'
import { installCaptureBackground, CAPTURE_RETRY_ALARM } from '../captureBackground.js'
import { writeDailyCapture, dailyCaptureName, localCaptureDay } from '../panel/src/lib/dailyCapture.js'
import { parseCaptureCsv } from '../panel/src/lib/captureCsv.js'

function event() {
  const listeners = []
  return {
    addListener: (listener) => listeners.push(listener),
    removeListener: (listener) => { const index = listeners.indexOf(listener); if (index !== -1) listeners.splice(index, 1) },
    emit: (...args) => listeners.forEach((listener) => listener(...args)),
    listeners,
  }
}

const job = (id = '123', descriptionText = 'Python and SQL required.') => ({
  type: 'JOB_DATA', url: `https://www.linkedin.com/jobs/view/${id}/`,
  title: 'Engineer', company: 'Example', location: 'Chicago, IL', descriptionText,
})

function harness(initial = {}, { connected = true, initialCsv = '' } = {}) {
  const saved = structuredClone(initial)
  const writes = [], dailyFiles = new Map(), files = new Map()
  const alarms = new Map(), alarmCreates = []
  let clock = new Date(2026, 9, 16, 12, 0)
  function memoryFile(name) {
    return {
      name, kind: 'file', queryPermission: async () => 'granted',
      getFile: async () => ({ text: async () => dailyFiles.get(name) || '' }),
      createWritable: async () => {
        let pendingText
        return {
          write: async (text) => { pendingText = text },
          close: async () => { dailyFiles.set(name, pendingText) },
          abort: async () => {},
        }
      },
    }
  }
  const file = memoryFile(dailyCaptureName(localCaptureDay(clock)))
  files.set(file.name, file)
  if (initialCsv) dailyFiles.set(file.name, initialCsv)
  const folder = {
    name: 'Selected jobs', kind: 'directory',
    queryPermission: async () => 'granted',
    getFileHandle: async (name, options) => {
      assert.equal(options.create, true)
      if (!files.has(name)) files.set(name, memoryFile(name))
      return files.get(name)
    },
  }
  let selected = connected ? folder : null
  const fileStore = {
    getHandle: async () => selected,
    setHandle: async (handle) => { selected = handle },
    write: async (handle, day, records, options) => {
      writes.push(structuredClone(records))
      await writeDailyCapture(handle, day, records, options)
    },
  }
  let current = job()
  const api = {
    alarms: {
      onAlarm: event(),
      get: async (name) => alarms.get(name),
      create: async (name, options) => { alarms.set(name, { name, ...options }); alarmCreates.push({ name, ...options }) },
      clear: async (name) => alarms.delete(name),
    },
    runtime: { onMessage: event(), getURL: (path) => 'chrome-extension://scanner/' + path },
    storage: {
      local: {
        get: async (keys) => structuredClone(Object.fromEntries(keys.map((key) => [key, saved[key]]))),
        set: async (values) => { Object.assign(saved, structuredClone(values)) },
      },
      onChanged: event(),
    },
    tabs: {
      query: async () => [{ id: 1, url: current.url, active: true }],
      sendMessage: async () => structuredClone(current),
      onActivated: event(),
    },
  }
  installCaptureBackground(api, fileStore, () => new Date(clock))
  function send(message, sender = { url: api.runtime.getURL('panel/dist/index.html') }) {
    return new Promise((resolve) => {
      const handled = api.runtime.onMessage.listeners[0](message, sender, resolve)
      if (!handled) resolve(undefined)
    })
  }
  return {
    api, saved, writes, send, fileStore, file, folder, dailyFiles, alarms, alarmCreates,
    async retry() {
      api.alarms.onAlarm.emit({ name: CAPTURE_RETRY_ALARM })
      await new Promise((resolve) => setImmediate(resolve))
    },
    get fileText() { return dailyFiles.get(dailyCaptureName(localCaptureDay(clock))) || '' },
    setTime(value) { clock = value },
    setCurrent(next) { current = next },
    push(next = current, active = true) { return send(next, { tab: { id: 1, active, url: next.url } }) },
    apply(next = current, active = true) {
      return send({ ...next, type: 'JOB_APPLY_CLICKED' }, { url: next.url, tab: { id: 1, active, url: next.url } })
    },
  }
}

test('enabling capture reconnects a missing first-job reader and saves the posting', async () => {
  const h = harness()
  let ready = false, injections = 0
  h.api.tabs.get = async () => ({ id: 1, active: true, url: job().url })
  h.api.tabs.sendMessage = async () => {
    if (!ready) throw new Error('Receiving end does not exist')
    return job()
  }
  h.api.scripting = { executeScript: async () => { injections++; ready = true } }
  await h.send({ type: 'SET_CAPTURE_SETTINGS', settings: { enabled: true } })
  assert.equal(injections, 1)
  assert.equal(h.saved.capturedJobs.length, 1)
  assert.equal(parseCaptureCsv(h.fileText).slice(1).length, 1)
  assert.equal(h.saved.captureStatus.state, 'complete')
})

test('capture stays off until enabled and enabling saves the already-open posting', async () => {
  const h = harness()
  await h.push()
  assert.equal(h.saved.capturedJobs, undefined)
  await h.send({ type: 'SET_CAPTURE_SETTINGS', settings: { enabled: true } })
  assert.equal(h.saved.capturedJobs.length, 1)
  assert.equal(h.saved.captureFile.name, 'Selected jobs')
  assert.ok(h.fileText.includes('Engineer'))
  assert.equal(h.api.downloads, undefined)
  assert.equal(h.saved.captureStatus.state, 'complete')
})

test('background jobs are ignored and concurrent viewed postings do not lose rows', async () => {
  const h = harness({ captureSettings: { enabled: true } })
  await h.push(job('999'), false)
  assert.equal(h.saved.capturedJobs, undefined)
  await Promise.all([h.push(job('123')), h.push(job('456'))])
  assert.deepEqual(h.saved.capturedJobs.map((row) => row.id), ['123', '456'])
  assert.ok(h.fileText.includes('/jobs/view/123/'))
  assert.ok(h.fileText.includes('/jobs/view/456/'))
  await h.push(job('123'))
  assert.equal(h.writes.length, 2)
  await h.push({ ...job('123'), location: 'Remote' })
  assert.equal(h.saved.capturedJobs.length, 2)
  assert.equal(h.saved.capturedJobs[0].location, 'Remote')
})

test('clearance inclusion settings persist and disabling leaves previous captures intact', async () => {
  const h = harness({ captureSettings: { enabled: true } })
  h.setCurrent(job('123', 'Must hold an active security clearance.'))
  await h.push()
  assert.equal(h.saved.capturedJobs, undefined)
  await h.send({ type: 'SET_CAPTURE_SETTINGS', settings: { enabled: true, includeClearance: true } })
  assert.equal(h.saved.capturedJobs[0].clearance, 'Required')
  await h.send({ type: 'SET_CAPTURE_SETTINGS', settings: { enabled: false, includeClearance: true } })
  await h.push(job('456'))
  assert.equal(h.saved.capturedJobs.length, 1)
  assert.equal(h.saved.captureSettings.enabled, false)
})

test('local records survive file write failures and syncing retries the full archive', async () => {
  const h = harness({ captureSettings: { enabled: true } })
  const write = h.fileStore.write
  h.fileStore.write = async () => { throw new Error('Disk unavailable') }
  await h.push()
  assert.equal(h.saved.capturedJobs.length, 1)
  assert.equal(h.saved.captureStatus.state, 'error')
  h.fileStore.write = write
  await h.send({ type: 'EXPORT_CAPTURE_CSV' })
  assert.equal(h.saved.captureStatus.state, 'complete')
  assert.ok(h.fileText.includes('Engineer'))
})

test('saving another posting waits for the previous file write to finish', async () => {
  const h = harness({ captureSettings: { enabled: true } })
  const write = h.fileStore.write
  const pendingWrites = []
  h.fileStore.write = (...args) => new Promise((resolve, reject) => {
    pendingWrites.push(async () => { try { await write(...args); resolve() } catch (error) { reject(error) } })
  })
  const first = h.push(job('123'))
  const second = h.push(job('456'))
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(pendingWrites.length, 1)
  await pendingWrites[0]()
  await first
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(pendingWrites.length, 2)
  await pendingWrites[1]()
  await second
  assert.equal(h.saved.capturedJobs.length, 2)
  assert.equal(h.saved.captureStatus.state, 'complete')
})

test('clear removes local records and writes a header-only CSV', async () => {
  const h = harness({ captureSettings: { enabled: true } })
  await h.push()
  await h.send({ type: 'CLEAR_CAPTURED_JOBS' })
  assert.deepEqual(h.saved.capturedJobs, [])
  assert.equal(h.saved.captureStatus.state, 'complete')
  assert.ok(!h.fileText.includes('Engineer'))
})

test('capture commands from a content page are ignored', async () => {
  const h = harness()
  const result = await h.send({ type: 'SET_CAPTURE_SETTINGS', settings: { enabled: true } }, { url: job().url })
  assert.equal(result, undefined)
  assert.equal(h.saved.captureSettings, undefined)
})

test('stored settings and rows survive a service-worker restart', async () => {
  const first = harness({ captureSettings: { enabled: true, includeClearance: true } })
  await first.push()
  const restarted = harness(first.saved)
  await restarted.push(job('456', 'Must hold a security clearance.'))
  assert.deepEqual(restarted.saved.capturedJobs.map((row) => row.id), ['123', '456'])
  assert.equal(restarted.saved.capturedJobs[1].clearance, 'Required')
})

test('resume changes update the current captured posting with the new best match', async () => {
  const h = harness({ captureSettings: { enabled: true } })
  await h.push()
  assert.equal(h.saved.capturedJobs[0].bestScore, null)
  h.saved['resume-2'] = { fileName: 'updated.pdf', text: 'Python SQL' }
  h.api.storage.onChanged.emit({ 'resume-2': {} }, 'local')
  // A following archive export is queued after the resume-change capture.
  await h.send({ type: 'EXPORT_CAPTURE_CSV' })
  assert.equal(h.saved.capturedJobs[0].bestScore, 100)
  assert.equal(h.saved.capturedJobs[0].bestResumeFiles, 'updated.pdf')
  assert.equal(h.saved.capturedJobs.length, 1)
})

test('storage failures are reported without replacing the existing archive', async () => {
  const h = harness({ captureSettings: { enabled: true } })
  await h.push()
  const set = h.api.storage.local.set
  h.api.storage.local.set = async (values) => {
    if (values.capturedJobs) throw new Error('Quota exceeded')
    await set(values)
  }
  assert.equal((await h.push(job('456'))).ok, false)
  assert.deepEqual(h.saved.capturedJobs.map((row) => row.id), ['123'])
  assert.equal(h.saved.captureStatus.state, 'error')
})

test('Apply-only mode ignores job views, resume changes and tab activation until Apply is clicked', async () => {
  const h = harness({ captureSettings: { enabled: true, mode: 'apply' } })
  await h.push()
  await h.send({ type: 'SET_CAPTURE_SETTINGS', settings: { enabled: true, mode: 'apply' } })
  h.saved['resume-2'] = { fileName: 'second.pdf', text: 'Python SQL' }
  h.api.storage.onChanged.emit({ 'resume-2': {} }, 'local')
  h.api.tabs.onActivated.emit({ tabId: 1 })
  await h.push()
  assert.equal(h.saved.capturedJobs, undefined)
  await h.apply()
  assert.equal(h.saved.capturedJobs.length, 1)
  assert.equal(h.saved.capturedJobs[0].bestScore, 100)
  assert.ok(h.saved.capturedJobs[0].applyClickedAt)
})

test('Apply-only mode still enforces the match slider using the best of all resumes', async () => {
  const h = harness({
    captureSettings: { enabled: true, mode: 'apply', minMatch: 40 },
    'resume-1': { fileName: 'unrelated.pdf', text: 'unrelated' },
    'resume-2': { fileName: 'python.pdf', text: 'Python' },
  })
  await h.apply()
  assert.equal(h.saved.capturedJobs[0].bestScore, 50)
  await h.send({ type: 'SET_CAPTURE_SETTINGS', settings: { enabled: true, mode: 'apply', minMatch: 60 } })
  const skipped = await h.apply(job('456'))
  assert.equal(skipped.ok, false)
  assert.match(skipped.error, /below 60%/)
  assert.equal(h.saved.capturedJobs.length, 1)
})

test('Apply click remains valid if the company-website link has already activated another tab', async () => {
  const h = harness({ captureSettings: { enabled: true, mode: 'apply' } })
  await h.apply(job(), false)
  assert.equal(h.saved.capturedJobs.length, 1)
  await h.send({ ...job('456'), type: 'JOB_APPLY_CLICKED' }, {
    url: job('456').url, tab: { id: 1, active: false, url: 'https://example.com/careers/' },
  })
  assert.equal(h.saved.capturedJobs.length, 2)
})

test('an Apply event cannot bypass clearance or disabled saving settings', async () => {
  const disabled = harness()
  await disabled.apply()
  assert.equal(disabled.saved.capturedJobs, undefined)
  const h = harness({ captureSettings: { enabled: true, mode: 'apply' } })
  await h.apply(job('123', 'Must hold an active security clearance.'))
  assert.equal(h.saved.capturedJobs, undefined)
})

test('0 percent automatically saves viewed jobs without resumes and higher thresholds wait for a qualifying resume', async () => {
  const h = harness({ captureSettings: { enabled: true, minMatch: 0 } })
  await h.push()
  assert.equal(h.saved.capturedJobs.length, 1)
  assert.equal(h.saved.capturedJobs[0].bestScore, null)
  await h.send({ type: 'SET_CAPTURE_SETTINGS', settings: { enabled: true, minMatch: 40 } })
  await h.push(job('456'))
  assert.equal(h.saved.capturedJobs.length, 1)
  h.setCurrent(job('456'))
  h.saved['resume-3'] = { fileName: 'third.pdf', text: 'Python' }
  h.api.storage.onChanged.emit({ 'resume-3': {} }, 'local')
  await h.push(job('456'))
  assert.equal(h.saved.capturedJobs.length, 2)
  assert.equal(h.saved.capturedJobs[1].bestResumeSlots, 'Resume 3')
})

test('save-once preference preserves the original row on revisits', async () => {
  const h = harness({ captureSettings: { enabled: true, updateExisting: false } })
  await h.push()
  await h.push({ ...job(), location: 'New York, NY' })
  assert.equal(h.saved.capturedJobs[0].location, 'Chicago, IL')
  assert.equal(h.writes.length, 1)
})

test('folder selection flushes queued jobs directly to one dated file without downloads', async () => {
  const h = harness({ captureSettings: { enabled: true } }, { connected: false })
  await h.push()
  await h.push(job('456'))
  assert.equal(h.saved.capturedJobs.length, 2)
  assert.equal(h.saved.captureStatus.state, 'needs-folder')
  assert.equal(h.writes.length, 0)
  assert.equal(h.api.downloads, undefined)
  await h.fileStore.setHandle(h.folder)
  await h.send({ type: 'CONNECT_CAPTURE_FILE' })
  assert.equal(h.saved.captureStatus.state, 'complete')
  assert.equal(h.saved.captureFile.kind, 'directory')
  assert.equal(parseCaptureCsv(h.fileText).length, 3)
  await h.push(job('789'))
  assert.equal(h.dailyFiles.size, 1)
  assert.equal(parseCaptureCsv(h.fileText).length, 4)
})

test('Apply capture creates another file at local midnight, including repeat jobs on another day', async () => {
  const h = harness({ captureSettings: { enabled: true, mode: 'apply', updateExisting: false } })
  h.setTime(new Date(2026, 9, 16, 23, 59))
  await h.push()
  assert.equal(h.writes.length, 0)
  await h.apply(job('123'))
  await h.apply(job('456'))
  await h.apply(job('123'))
  assert.equal(h.writes.length, 2)
  const previous = h.dailyFiles.get('jobs-2026-10-16.csv')
  assert.equal(parseCaptureCsv(previous).length, 3)
  h.setTime(new Date(2026, 9, 17, 0, 1))
  await h.apply(job('123'))
  assert.equal(h.dailyFiles.size, 2)
  assert.equal(h.dailyFiles.get('jobs-2026-10-16.csv'), previous)
  const today = parseCaptureCsv(h.dailyFiles.get('jobs-2026-10-17.csv'))
  assert.equal(today.length, 2)
  assert.ok(today[1].includes(new Date(2026, 9, 17, 0, 1).toISOString()))
})

test('rows survive worker restarts and a completed save is not rewritten on reload', async () => {
  const first = harness({ captureSettings: { enabled: true } })
  await first.push()
  const restarted = harness(first.saved, { initialCsv: first.fileText })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(restarted.writes.length, 0)
  await restarted.push(job('456'))
  assert.equal(parseCaptureCsv(restarted.fileText).length, 3)
})

test('turning saving off prevents captures, explicit sync writes and startup retries', async () => {
  const first = harness({ captureSettings: { enabled: true } })
  await first.push()
  await first.send({ type: 'SET_CAPTURE_SETTINGS', settings: { enabled: false } })
  const writes = first.writes.length
  const contents = first.fileText
  await first.push(job('456'))
  await first.apply(job('789'))
  await first.send({ type: 'CONNECT_CAPTURE_FILE' })
  assert.equal(first.writes.length, writes)
  assert.equal(first.fileText, contents)
  const restarted = harness({ ...first.saved, captureStatus: { state: 'error' } })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(restarted.writes.length, 0)
})

test('clear empties today while preserving earlier files', async () => {
  const h = harness({ captureSettings: { enabled: true } })
  await h.push()
  const previous = h.fileText
  h.setTime(new Date(2026, 9, 17, 12))
  await h.push(job('456'))
  await h.send({ type: 'CLEAR_CAPTURED_JOBS' })
  assert.equal(h.dailyFiles.get('jobs-2026-10-16.csv'), previous)
  assert.equal(parseCaptureCsv(h.fileText).length, 1)
  assert.deepEqual(h.saved.capturedJobDays, {})
  assert.deepEqual(h.saved.capturedJobs, [])
})

test('existing daily files retain old job rows and only the selected 11 columns', async () => {
  const initialCsv = 'Title,Job URL,Notes\r\nEarlier job,https://www.linkedin.com/jobs/view/999/,Follow up tomorrow\r\n'
  const h = harness({ captureSettings: { enabled: true } }, { initialCsv })
  await h.push()
  await h.push(job('456'))
  assert.ok(h.fileText.includes('Earlier job'))
  assert.ok(!h.fileText.includes('Follow up tomorrow'))
  assert.equal(parseCaptureCsv(h.fileText)[0].length, 11)
  assert.equal(parseCaptureCsv(h.fileText).length, 4)
})

test('expired folder permission keeps the handle and queues jobs without a worker prompt', async () => {
  const h = harness({ captureSettings: { enabled: true, mode: 'apply' } })
  h.folder.queryPermission = async () => 'prompt'
  h.folder.requestPermission = async () => { throw new Error('The worker must not prompt') }
  await h.apply()
  assert.equal(h.writes.length, 0)
  assert.equal(h.saved.captureStatus.state, 'needs-permission')
  assert.equal(await h.fileStore.getHandle(), h.folder)
  assert.equal(h.saved.capturedJobs.length, 1)
  h.folder.queryPermission = async () => 'granted'
  await h.send({ type: 'CONNECT_CAPTURE_FILE' })
  assert.equal(h.saved.captureStatus.state, 'complete')
  assert.equal(parseCaptureCsv(h.fileText).length, 2)
})

test('a missing folder requests replacement and keeps captured data', async () => {
  const h = harness({ captureSettings: { enabled: true } })
  h.folder.getFileHandle = async () => { throw Object.assign(new Error('Folder disappeared'), { name: 'NotFoundError' }) }
  await h.push()
  assert.equal(h.saved.captureStatus.state, 'needs-folder')
  assert.equal(h.saved.capturedJobs.length, 1)
  assert.equal(await h.fileStore.getHandle(), null)
  assert.equal(h.api.downloads, undefined)
})

test('a removed daily file is recreated from the local archive on the next save', async () => {
  const h = harness({ captureSettings: { enabled: true } })
  await h.push()
  h.dailyFiles.clear()
  await h.push(job('456'))
  assert.equal(parseCaptureCsv(h.fileText).length, 3)
})

test('an unchanged job retries a failed direct write', async () => {
  const h = harness({ captureSettings: { enabled: true } })
  const write = h.fileStore.write
  h.fileStore.write = async () => { throw new Error('Disk temporarily unavailable') }
  await h.push()
  assert.equal(h.saved.captureStatus.state, 'error')
  h.fileStore.write = write
  await h.push()
  assert.equal(h.saved.captureStatus.state, 'complete')
  assert.equal(parseCaptureCsv(h.fileText).length, 2)
})

test('migration from download saving requests a folder and never starts a download', async () => {
  const h = harness({
    captureSettings: { enabled: true, mode: 'apply' },
    captureStatus: { state: 'error' },
    capturedJobs: [{ ...job(), id: '123', firstSeen: new Date(2026, 9, 16, 11).toISOString(), updatedAt: new Date(2026, 9, 16, 11).toISOString() }],
    capturedJobDays: {},
  }, { connected: false })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(h.saved.captureStatus.state, 'needs-folder')
  assert.equal(h.writes.length, 0)
  await h.fileStore.setHandle(h.folder)
  await h.send({ type: 'CONNECT_CAPTURE_FILE' })
  assert.equal(parseCaptureCsv(h.fileText).length, 2)
})

test('invalid daily CSV contents are reported without overwriting the file', async () => {
  const initialCsv = 'Name,Email\r\nPerson,test@example.com\r\n'
  const h = harness({ captureSettings: { enabled: true } }, { initialCsv })
  await h.push()
  assert.equal(h.saved.captureStatus.state, 'error')
  assert.equal(h.fileText, initialCsv)
  assert.equal(await h.fileStore.getHandle(), h.folder)
})

test('Excel-style file locks queue jobs and an alarm writes them after unlock without another job event', async () => {
  const h = harness({ captureSettings: { enabled: true } })
  await h.push()
  const previous = h.fileText
  const createWritable = h.file.createWritable
  h.file.createWritable = async () => { throw Object.assign(new Error('File is in use'), { name: 'NoModificationAllowedError' }) }
  await h.push(job('456'))
  assert.equal(h.fileText, previous)
  assert.equal(h.saved.captureStatus.state, 'waiting-file')
  assert.equal(h.saved.captureStatus.pending, true)
  assert.equal(h.saved.capturedJobDays['2026-10-16'].length, 2)
  assert.ok(h.saved.capturePendingWrites['2026-10-16'])
  assert.equal(h.alarms.get(CAPTURE_RETRY_ALARM).periodInMinutes, 0.5)
  const created = h.alarmCreates.length
  await h.push(job('789'))
  assert.equal(h.alarmCreates.length, created, 'new captures must not postpone the retry deadline')
  h.file.createWritable = createWritable
  await h.retry()
  assert.equal(parseCaptureCsv(h.fileText).length, 4)
  assert.equal(h.saved.captureStatus.state, 'complete')
  assert.deepEqual(h.saved.capturePendingWrites, {})
  assert.equal(h.alarms.has(CAPTURE_RETRY_ALARM), false)
})

test('a locked previous-day file remains queued when the next day saves successfully', async () => {
  const h = harness({ captureSettings: { enabled: true } })
  await h.push()
  const createWritable = h.file.createWritable
  h.file.createWritable = async () => { throw Object.assign(new Error('Excel lock'), { name: 'NoModificationAllowedError' }) }
  await h.push(job('456'))
  h.setTime(new Date(2026, 9, 17, 12))
  await h.push(job('789'))
  assert.equal(parseCaptureCsv(h.fileText).length, 2)
  assert.equal(h.saved.captureStatus.state, 'waiting-file')
  assert.deepEqual(Object.keys(h.saved.capturePendingWrites), ['2026-10-16'])
  h.file.createWritable = createWritable
  const today = h.fileText
  await h.retry()
  assert.equal(parseCaptureCsv(h.dailyFiles.get('jobs-2026-10-16.csv')).length, 3)
  assert.equal(h.fileText, today)
  assert.equal(h.saved.captureStatus.state, 'complete')
})

test('pending writes survive worker restarts even if the old alarm was lost', async () => {
  const first = harness({ captureSettings: { enabled: true } })
  await first.push()
  const initialCsv = first.fileText
  first.file.createWritable = async () => { throw Object.assign(new Error('Locked'), { name: 'NoModificationAllowedError' }) }
  await first.push(job('456'))
  const restarted = harness(first.saved, { initialCsv })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(parseCaptureCsv(restarted.fileText).length, 3)
  assert.equal(restarted.saved.captureStatus.state, 'complete')
  assert.deepEqual(restarted.saved.capturePendingWrites, {})
  assert.equal(restarted.alarms.has(CAPTURE_RETRY_ALARM), false)
})

test('disabling saving cancels retries and an alarm cannot write queued jobs while disabled', async () => {
  const h = harness({ captureSettings: { enabled: true } })
  const write = h.fileStore.write
  h.fileStore.write = async () => { throw new Error('Locked') }
  await h.push()
  assert.equal(h.alarms.has(CAPTURE_RETRY_ALARM), true)
  await h.send({ type: 'SET_CAPTURE_SETTINGS', settings: { enabled: false } })
  assert.equal(h.alarms.has(CAPTURE_RETRY_ALARM), false)
  h.fileStore.write = write
  await h.retry()
  assert.equal(h.fileText, '')
  assert.ok(h.saved.capturePendingWrites['2026-10-16'])
})

test('a denied file write with valid folder permission is retried rather than requesting access again', async () => {
  const h = harness({ captureSettings: { enabled: true } })
  const createWritable = h.file.createWritable
  h.file.createWritable = async () => { throw Object.assign(new Error('Access denied by sharing lock'), { name: 'NotAllowedError' }) }
  await h.push()
  assert.equal(h.saved.captureStatus.state, 'waiting-file')
  assert.equal(await h.fileStore.getHandle(), h.folder)
  assert.equal(h.alarms.has(CAPTURE_RETRY_ALARM), true)
  h.file.createWritable = createWritable
  await h.retry()
  assert.equal(h.saved.captureStatus.state, 'complete')
})

test('a failed clear retries without restoring deleted rows and preserves jobs captured afterwards', async () => {
  const h = harness({ captureSettings: { enabled: true } })
  await h.push()
  const createWritable = h.file.createWritable
  h.file.createWritable = async () => { throw Object.assign(new Error('Locked'), { name: 'NoModificationAllowedError' }) }
  await h.send({ type: 'CLEAR_CAPTURED_JOBS' })
  assert.deepEqual(h.saved.capturedJobs, [])
  assert.equal(h.saved.capturePendingWrites['2026-10-16'].replace, true)
  await h.push(job('456'))
  h.file.createWritable = createWritable
  await h.retry()
  const rows = parseCaptureCsv(h.fileText)
  assert.equal(rows.length, 2)
  assert.ok(rows[1].includes(job('456').url))
  assert.ok(!h.fileText.includes(job('123').url))
  assert.deepEqual(h.saved.capturePendingWrites, {})
})

test('a pending empty-file clear recovers after restart without captured job rows', async () => {
  const first = harness({ captureSettings: { enabled: true } })
  await first.push()
  const initialCsv = first.fileText
  first.file.createWritable = async () => { throw Object.assign(new Error('Locked'), { name: 'NoModificationAllowedError' }) }
  await first.send({ type: 'CLEAR_CAPTURED_JOBS' })
  const restarted = harness(first.saved, { initialCsv })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(parseCaptureCsv(restarted.fileText).length, 1)
  assert.deepEqual(restarted.saved.capturePendingWrites, {})
})

test('a file locked at commit keeps the pending entry until close succeeds on a retry', async () => {
  const h = harness({ captureSettings: { enabled: true } })
  const createWritable = h.file.createWritable
  h.file.createWritable = async () => {
    const stream = await createWritable()
    stream.close = async () => { throw Object.assign(new Error('Excel prevented replacement'), { name: 'NoModificationAllowedError' }) }
    return stream
  }
  await h.push()
  assert.equal(h.fileText, '')
  assert.equal(h.saved.captureStatus.state, 'waiting-file')
  assert.ok(h.saved.capturePendingWrites['2026-10-16'])
  h.file.createWritable = createWritable
  await h.retry()
  assert.equal(parseCaptureCsv(h.fileText).length, 2)
  assert.deepEqual(h.saved.capturePendingWrites, {})
})
