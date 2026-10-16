import assert from 'node:assert/strict'
import test from 'node:test'
import { capturesToCsv } from '../panel/src/lib/jobCapture.js'
import { parseCaptureCsv, mergeCaptureCsv } from '../panel/src/lib/captureCsv.js'
import { writeCaptureFile } from '../panel/src/lib/captureFile.js'

const record = (id = '123', overrides = {}) => ({
  id, title: 'Engineer', company: 'Example', location: 'New York, United States',
  url: `https://www.linkedin.com/jobs/view/${id}/`,
  firstSeen: '2026-10-16T12:00:00Z', updatedAt: '2026-10-16T13:00:00Z',
  description: 'Python, SQL and "Linux".\nSecond line.', bestScore: 40,
  ...overrides,
})

const expectedHeader = [
  'Apply clicked (UTC)', 'Title', 'Company', 'Location', 'Job URL', 'Clearance',
  'Sponsorship', 'Expected experience', 'Citizenship / work eligibility',
  'Best resume match (%)', 'Best resume slot(s)',
]

function memoryFile(initial = '') {
  let contents = initial
  let opens = 0, aborts = 0
  const handle = {
    name: 'jobs.csv', queryPermission: async () => 'granted',
    getFile: async () => ({ text: async () => contents }),
    createWritable: async () => {
      opens++
      let pending
      return {
        write: async (text) => { pending = text },
        close: async () => { contents = pending },
        abort: async () => { aborts++ },
      }
    },
  }
  return { handle, get contents() { return contents }, get opens() { return opens }, get aborts() { return aborts } }
}

test('CSV exports exactly the requested columns and round trips quoted multiline values', () => {
  const eligibility = 'US citizen, or authorized worker.\nAsk about "eligibility" in Montréal.'
  const rows = parseCaptureCsv(capturesToCsv([record('123', { eligibility })]))
  assert.deepEqual(rows[0], expectedHeader)
  assert.equal(rows.length, 2)
  assert.equal(rows[1].length, 11)
  assert.equal(rows[1][rows[0].indexOf('Citizenship / work eligibility')], eligibility)
  assert.equal(rows[1][rows[0].indexOf('Location')], 'New York, United States')
})

test('new jobs are added to the same file, keeping old rows and removing extra columns', async () => {
  const file = memoryFile('Title,Job URL,My notes\r\nOlder job,https://www.linkedin.com/jobs/view/999/,Follow up\r\n')
  await writeCaptureFile(file.handle, [record()])
  await writeCaptureFile(file.handle, [record(), record('456')])
  const rows = parseCaptureCsv(file.contents)
  assert.deepEqual(rows[0], expectedHeader)
  assert.equal(rows.length, 4)
  assert.equal(rows[1][rows[0].indexOf('Title')], 'Older job')
  assert.ok(!file.contents.includes('My notes'))
  assert.ok(!file.contents.includes('Follow up'))
  assert.ok(rows[2].includes(record().url))
  assert.ok(rows[3].includes(record('456').url))
  assert.equal(file.opens, 2)
})

test('revisits update the existing CSV row, preserve Apply time, and do not duplicate headers', () => {
  const initial = capturesToCsv([record('123', { applyClickedAt: '2026-10-16T12:30:00Z' })])
  const next = mergeCaptureCsv(initial, [record('123', { location: 'Chicago, IL', firstSeen: '2026-10-16T13:00:00Z' })])
  const rows = parseCaptureCsv(next)
  assert.equal(rows.length, 2)
  assert.equal(rows[1][rows[0].indexOf('Location')], 'Chicago, IL')
  assert.deepEqual(rows[0], expectedHeader)
  assert.equal(rows[1][rows[0].indexOf('Apply clicked (UTC)')], '2026-10-16T12:30:00Z')
})

test('save-once and newer file records are respected when reconnecting old CSV data', () => {
  const initial = 'Title,Job URL,Last updated (UTC)\r\nPreserved title,https://www.linkedin.com/jobs/view/123/,2026-10-16T15:00:00Z\r\n'
  assert.ok(mergeCaptureCsv(initial, [record()]).includes('Preserved title'))
  assert.ok(mergeCaptureCsv(initial, [record('123', { updatedAt: '2026-10-16T16:00:00Z' })], { updateExisting: false }).includes('Preserved title'))
})

test('sync alone migrates reordered legacy columns without losing retained values or job rows', () => {
  const legacy = 'Job description,Best resume slot(s),Title,Job URL,Location,Apply clicked (UTC),Best resume match (%),Notes\r\nFull description,Resume 2,Earlier job,https://www.linkedin.com/jobs/view/999/,Remote,2026-10-16T12:30:00Z,75,Follow up\r\n'
  const migrated = mergeCaptureCsv(legacy, [], { updateExisting: false })
  const rows = parseCaptureCsv(migrated)
  assert.deepEqual(rows[0], expectedHeader)
  assert.deepEqual(rows[1], [
    '2026-10-16T12:30:00Z', 'Earlier job', '', 'Remote',
    'https://www.linkedin.com/jobs/view/999/', '', '', '', '', '75', 'Resume 2',
  ])
  assert.equal(mergeCaptureCsv(migrated, []), migrated)
  const preserved = parseCaptureCsv(mergeCaptureCsv(legacy, [record('999')], { updateExisting: false }))
  assert.deepEqual(preserved, rows)
})

test('unchanged archives do not reopen the file for writing', async () => {
  const file = memoryFile()
  await writeCaptureFile(file.handle, [record()])
  await writeCaptureFile(file.handle, [record()])
  assert.equal(file.opens, 1)
})

test('malformed or unrelated CSV files are rejected before writing', async () => {
  for (const contents of ['Name,Email\r\nPerson,test@example.com\r\n', 'Title,Job URL\r\n"Unfinished,abc', 'Title,Job URL\r\nOnly one cell\r\n']) {
    const file = memoryFile(contents)
    await assert.rejects(writeCaptureFile(file.handle, [record()]))
    assert.equal(file.contents, contents)
    assert.equal(file.opens, 0)
  }
})

test('permission expiry does not prompt from the background or replace the old file', async () => {
  const file = memoryFile('old contents')
  file.handle.queryPermission = async () => 'prompt'
  await assert.rejects(writeCaptureFile(file.handle, [record()]), { name: 'NotAllowedError' })
  assert.equal(file.contents, 'old contents')
  assert.equal(file.opens, 0)
})

test('failed writes abort the temporary stream and preserve the existing CSV', async () => {
  const initial = capturesToCsv([record('999')])
  const file = memoryFile(initial)
  const create = file.handle.createWritable
  file.handle.createWritable = async () => {
    const stream = await create()
    stream.write = async () => { throw new Error('Disk full') }
    return stream
  }
  await assert.rejects(writeCaptureFile(file.handle, [record()]), /Disk full/)
  assert.equal(file.contents, initial)
  assert.equal(file.aborts, 1)
})

test('a failed close does not mark pending CSV data as committed', async () => {
  const initial = capturesToCsv([record('999')])
  const file = memoryFile(initial)
  const create = file.handle.createWritable
  file.handle.createWritable = async () => {
    const stream = await create()
    stream.close = async () => { throw new Error('File is locked') }
    return stream
  }
  await assert.rejects(writeCaptureFile(file.handle, [record()]), /File is locked/)
  assert.equal(file.contents, initial)
  assert.equal(file.aborts, 1)
})

test('restoring folder access from a user click flushes the queued CSV', async () => {
  const { resumeCaptureFolder } = await import('../panel/src/lib/captureFile.js')
  const calls = []
  const handle = { requestPermission: async (options) => { calls.push(options); return 'granted' } }
  const api = { runtime: { sendMessage: async (message) => { calls.push(message); return { ok: true } } } }
  await resumeCaptureFolder(handle, api)
  assert.deepEqual(calls, [{ mode: 'readwrite' }, { type: 'CONNECT_CAPTURE_FILE' }])
})

test('denying folder renewal does not try writing or discard pending jobs', async () => {
  const { resumeCaptureFolder } = await import('../panel/src/lib/captureFile.js')
  const handle = { requestPermission: async () => 'denied' }
  let messages = 0
  const api = { runtime: { sendMessage: async () => { messages++; return { ok: true } } } }
  await assert.rejects(resumeCaptureFolder(handle, api), /kept locally/)
  assert.equal(messages, 0)
})

test('a failure after folder renewal reports the pending-write reason', async () => {
  const { resumeCaptureFolder } = await import('../panel/src/lib/captureFile.js')
  const handle = { requestPermission: async () => 'granted' }
  const api = { runtime: { sendMessage: async () => ({ ok: false, error: 'CSV update queued; file is locked.' }) } }
  await assert.rejects(resumeCaptureFolder(handle, api), /CSV update queued/)
})
