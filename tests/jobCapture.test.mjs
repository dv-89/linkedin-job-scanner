import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_CAPTURE_SETTINGS, jobIdentity, normalizeCaptureSettings, makeCaptureRecord, upsertCapture, capturesToCsv,
} from '../panel/src/lib/jobCapture.js'

const settings = { enabled: true, includeClearance: false }
const job = (overrides = {}) => ({
  url: 'https://www.linkedin.com/jobs/view/123/?trackingId=example',
  title: 'Engineer', company: 'Example', location: 'Chicago, IL',
  descriptionText: 'Python and SQL. Minimum of 5 years of experience. We can sponsor visas.',
  ...overrides,
})
const resumes = [
  { fileName: 'python.pdf', text: 'Python' },
  { fileName: 'python-sql.pdf', text: 'Python SQL' },
  null,
]

test('capture defaults off and only boolean settings are accepted', () => {
  assert.deepEqual(normalizeCaptureSettings(), DEFAULT_CAPTURE_SETTINGS)
  assert.deepEqual(normalizeCaptureSettings({ enabled: 'true', includeClearance: 1 }), DEFAULT_CAPTURE_SETTINGS)
  assert.equal(makeCaptureRecord(job(), resumes, { enabled: false }), null)
})

test('job identity canonicalizes detail and search URLs while rejecting stale or unrelated data', () => {
  assert.equal(jobIdentity(job()), '123')
  assert.equal(jobIdentity(job({ url: 'https://www.linkedin.com/jobs/search/?currentJobId=456' })), '456')
  assert.equal(jobIdentity(job({ url: 'https://www.linkedin.com/jobs/search-results/', jobId: '789' })), '789')
  for (const overrides of [
    { url: 'https://example.com/jobs/view/123/' },
    { url: 'https://www.linkedin.com/feed/' },
    { url: 'invalid' }, { url: 'https://www.linkedin.com/jobs/search/' },
    { jobId: '999' }, { jobId: 'not-an-id' },
  ]) assert.equal(jobIdentity(job(overrides)), null)
})

test('record captures job fields and the highest resume match without keyword lists or resume text', () => {
  const record = makeCaptureRecord(job(), resumes, settings)
  assert.equal(record.url, 'https://www.linkedin.com/jobs/view/123/')
  assert.equal(record.bestScore, 100)
  assert.equal(record.bestResumeSlots, 'Resume 2')
  assert.equal(record.bestResumeFiles, 'python-sql.pdf')
  assert.equal(record.location, 'Chicago, IL')
  assert.equal(record.sponsorship, 'Available')
  assert.equal(record.experience, '5+ years')
  for (const key of ['matched', 'missing', 'otherTerms', 'resumeText']) assert.equal(key in record, false)
})

test('all best-match ties and 0 percent matches are retained; unavailable scores stay blank', () => {
  const tied = makeCaptureRecord(job(), [resumes[1], resumes[1], null], settings)
  assert.equal(tied.bestResumeSlots, 'Resume 1; Resume 2')
  assert.equal(tied.bestResumeFiles, 'python-sql.pdf; python-sql.pdf')
  assert.equal(makeCaptureRecord(job(), [{ fileName: 'other.pdf', text: 'unrelated' }], settings).bestScore, 0)
  for (const record of [
    makeCaptureRecord(job(), [null, null, null], settings),
    makeCaptureRecord(job({ descriptionText: 'Welcome to our team.' }), resumes, settings),
  ]) {
    assert.equal(record.bestScore, null)
    assert.equal(record.bestResumeFiles, '')
  }
})

test('clearance setting skips only detected required clearance and includes it when enabled', () => {
  const required = job({ descriptionText: 'Candidates must have a Secret security clearance. Python.' })
  assert.equal(makeCaptureRecord(required, resumes, settings), null)
  assert.equal(makeCaptureRecord(required, resumes, { ...settings, includeClearance: true }).clearance, 'Required')
  for (const descriptionText of [
    'Security clearance is not required.', 'Security clearance preferred.',
    'Ask the recruiter about security clearance.', 'Python required.',
  ]) assert.ok(makeCaptureRecord(job({ descriptionText }), resumes, settings), descriptionText)
})

test('incomplete jobs are not captured', () => {
  assert.equal(makeCaptureRecord(job({ title: '' }), resumes, settings), null)
  assert.equal(makeCaptureRecord(job({ descriptionText: '  ' }), resumes, settings), null)
})

test('minimum match uses any resume, includes the threshold, and 0 accepts unscored jobs', () => {
  const partial = [null, { fileName: 'partial.pdf', text: 'Python' }, null]
  assert.equal(makeCaptureRecord(job(), partial, { ...settings, minMatch: 40 }).bestScore, 50)
  assert.ok(makeCaptureRecord(job(), partial, { ...settings, minMatch: 50 }))
  assert.equal(makeCaptureRecord(job(), partial, { ...settings, minMatch: 51 }), null)
  assert.equal(makeCaptureRecord(job(), [null, null, null], { ...settings, minMatch: 40 }), null)
  assert.ok(makeCaptureRecord(job(), [null, null, null], { ...settings, minMatch: 0 }))
  assert.ok(makeCaptureRecord(job(), [{ fileName: 'other.pdf', text: 'unrelated' }], { ...settings, minMatch: 0 }))
})

test('sponsorship, title, location and match filters combine without interpreting unknown sponsorship as available', () => {
  const filtered = { ...settings, sponsorship: 'available', titleIncludes: 'developer, ENGINEER', locationIncludes: 'Chicago, Austin', minMatch: 80 }
  assert.ok(makeCaptureRecord(job(), resumes, filtered))
  assert.equal(makeCaptureRecord(job({ location: 'New York, NY' }), resumes, filtered), null)
  assert.equal(makeCaptureRecord(job({ title: 'Product Manager' }), resumes, filtered), null)
  assert.equal(makeCaptureRecord(job({ descriptionText: 'Python and SQL. Ask about sponsorship.' }), resumes, filtered), null)
  assert.equal(makeCaptureRecord(job({ descriptionText: 'Python and SQL. We cannot sponsor visas.' }), resumes, { ...settings, sponsorship: 'not-denied' }), null)
  assert.ok(makeCaptureRecord(job({ descriptionText: 'Python and SQL.' }), resumes, { ...settings, sponsorship: 'not-denied' }))
})

test('settings migration keeps prior behavior and validates new save rules', () => {
  const migrated = normalizeCaptureSettings({ enabled: true, includeClearance: true })
  assert.equal(migrated.mode, 'automatic')
  assert.equal(migrated.minMatch, 0)
  assert.equal(migrated.updateExisting, true)
  assert.equal(normalizeCaptureSettings({ mode: 'apply' }).mode, 'apply')
  assert.equal(normalizeCaptureSettings({ minMatch: 105 }).minMatch, 100)
  assert.equal(normalizeCaptureSettings({ minMatch: -5 }).minMatch, 0)
  assert.equal(normalizeCaptureSettings({ minMatch: '40' }).minMatch, 0)
  assert.equal(normalizeCaptureSettings({ sponsorship: 'invalid' }).sponsorship, 'any')
})

test('Apply timestamps survive a later ordinary revisit', () => {
  const record = makeCaptureRecord(job({ applyClickedAt: '2026-10-16T14:00:00Z' }), resumes, settings)
  const first = upsertCapture([], record).records
  const updated = upsertCapture(first, makeCaptureRecord(job({ location: 'Remote' }), resumes, settings)).records
  assert.equal(updated[0].applyClickedAt, '2026-10-16T14:00:00Z')
  assert.ok(capturesToCsv(updated).includes('"Apply clicked (UTC)"'))
})

test('revisiting a posting updates one row and preserves its first capture date', () => {
  const record = makeCaptureRecord(job(), resumes, settings)
  const initial = upsertCapture([], record, '2026-10-16T12:00:00Z')
  const repeated = upsertCapture(initial.records, record, '2026-10-16T13:00:00Z')
  assert.equal(repeated.changed, false)
  const updated = upsertCapture(initial.records, { ...record, location: 'Austin, TX' }, '2026-10-16T14:00:00Z')
  assert.equal(updated.records.length, 1)
  assert.equal(updated.records[0].firstSeen, '2026-10-16T12:00:00Z')
  assert.equal(updated.records[0].updatedAt, '2026-10-16T14:00:00Z')
})

test('CSV preserves commas, quotes, newlines, Unicode and guards spreadsheet formulas', () => {
  const csv = capturesToCsv([{
    title: '=HYPERLINK("bad")', company: 'Acme, Inc.', location: 'Montréal',
    eligibility: 'Line one\n"Line two"', bestScore: 0, bestResumeSlots: '\t+formula',
  }])
  assert.ok(csv.startsWith('\uFEFF'))
  assert.ok(csv.includes('"\'=HYPERLINK(""bad"")"'))
  assert.ok(csv.includes('"Acme, Inc."'))
  assert.ok(csv.includes('"Montréal"'))
  assert.ok(csv.includes('"Line one\n""Line two"""'))
  assert.ok(csv.includes('"\'\t+formula"'))
  assert.ok(csv.includes('"0"'))
  assert.equal(capturesToCsv([]).split('\r\n').length, 2)
})
