import { analyzeJobFields } from './jobFields.js'
import { matchKeywords } from './keywordMatch.js'

export const CAPTURE_SETTINGS_KEY = 'captureSettings'
export const CAPTURE_JOBS_KEY = 'capturedJobs'
export const CAPTURE_STATUS_KEY = 'captureStatus'
export const DEFAULT_CAPTURE_SETTINGS = {
  enabled: false, mode: 'automatic', includeClearance: false,
  minMatch: 0, sponsorship: 'any', titleIncludes: '', locationIncludes: '', updateExisting: true,
}
export const CAPTURE_FILE_KEY = 'captureFile'

export function normalizeCaptureSettings(settings) {
  return {
    enabled: settings?.enabled === true,
    includeClearance: settings?.includeClearance === true,
    mode: settings?.mode === 'apply' ? 'apply' : 'automatic',
    minMatch: typeof settings?.minMatch === 'number' && Number.isFinite(settings.minMatch)
      ? Math.min(100, Math.max(0, Math.round(settings.minMatch))) : 0,
    sponsorship: ['available', 'not-denied'].includes(settings?.sponsorship) ? settings.sponsorship : 'any',
    titleIncludes: typeof settings?.titleIncludes === 'string' ? settings.titleIncludes.trim().slice(0, 300) : '',
    locationIncludes: typeof settings?.locationIncludes === 'string' ? settings.locationIncludes.trim().slice(0, 300) : '',
    updateExisting: settings?.updateExisting !== false,
  }
}

export function jobIdentity(job) {
  try {
    const url = new URL(job?.url)
    if (url.origin !== 'https://www.linkedin.com' || !url.pathname.startsWith('/jobs/')) return null
    const urlId = url.pathname.match(/\/jobs\/view\/(\d+)/)?.[1] || url.searchParams.get('currentJobId')
    if (urlId && job.jobId && urlId !== job.jobId) return null
    const id = job.jobId || urlId
    return /^\d+$/.test(id || '') ? id : null
  } catch {
    return null
  }
}

export function getCaptureDecision(job, resumes, rawSettings) {
  const settings = normalizeCaptureSettings(rawSettings)
  const id = jobIdentity(job)
  if (!settings.enabled) return { record: null, reason: 'Job saving is off. Enable it in Settings.' }
  if (!id || !job.title?.trim() || !job.descriptionText?.trim()) {
    return { record: null, reason: 'Open a loaded LinkedIn job posting to save it.' }
  }
  const fields = analyzeJobFields(job.descriptionText)
  const scores = resumes.map((resume, index) => ({
    slot: `Resume ${index + 1}`,
    fileName: resume?.fileName || '',
    score: resume?.text ? matchKeywords(job.descriptionText, resume.text).score : null,
  })).filter((item) => Number.isFinite(item.score))
  const highest = scores.length ? Math.max(...scores.map((item) => item.score)) : null
  const best = scores.filter((item) => item.score === highest)
  const record = {
    id, url: `https://www.linkedin.com/jobs/view/${id}/`,
    title: job.title, company: job.company || '', location: job.location || '',
    clearance: fields.clearance.status, clearanceEvidence: fields.clearance.evidence || '',
    sponsorship: fields.sponsorship.status, sponsorshipEvidence: fields.sponsorship.evidence || '',
    experience: fields.expectedYOE.status, experienceEvidence: fields.expectedYOE.evidence || '',
    preferred: fields.preferred.evidence || '',
    eligibility: fields.preferred.citizenshipNotes.join('\n'),
    bestScore: highest,
    bestResumeSlots: best.map((item) => item.slot).join('; '),
    bestResumeFiles: best.map((item) => item.fileName).join('; '),
    description: job.descriptionText,
    applyClickedAt: job.applyClickedAt || '',
  }
  let reason = ''
  if (!settings.includeClearance && record.clearance === 'Required') reason = 'Skipped: this job requires clearance.'
  else if (settings.minMatch > 0 && (highest === null || highest < settings.minMatch)) {
    reason = highest === null ? 'Skipped: no resume match percentage is available.'
      : `Skipped: best resume match is ${highest}%, below ${settings.minMatch}%.`
  } else if (settings.sponsorship === 'available' && record.sponsorship !== 'Available') {
    reason = 'Skipped: sponsorship is not explicitly available.'
  } else if (settings.sponsorship === 'not-denied' && record.sponsorship === 'Not available') {
    reason = 'Skipped: sponsorship is explicitly unavailable.'
  } else if (!matchesAnyTerm(record.title, settings.titleIncludes)) reason = 'Skipped: job title does not match your filter.'
  else if (!matchesAnyTerm(record.location, settings.locationIncludes)) reason = 'Skipped: location does not match your filter.'
  return { record: reason ? null : record, reason }
}

function matchesAnyTerm(text, filter) {
  const terms = filter.split(',').map((part) => part.trim().toLowerCase()).filter(Boolean)
  return !terms.length || terms.some((term) => text.toLowerCase().includes(term))
}

export function makeCaptureRecord(job, resumes, settings) {
  return getCaptureDecision(job, resumes, settings).record
}

// Keep a posting's original position/date, and avoid a new download for DOM
// mutations that do not change any exported data.
export function upsertCapture(records, record, now = new Date().toISOString()) {
  const index = records.findIndex((item) => item.id === record.id)
  const previous = records[index]
  record = { ...record, applyClickedAt: record.applyClickedAt || previous?.applyClickedAt || '' }
  if (previous) {
    const { firstSeen: _first, updatedAt: _updated, ...data } = previous
    if (JSON.stringify(data) === JSON.stringify(record)) return { records, changed: false }
  }
  const next = { ...record, firstSeen: previous?.firstSeen || now, updatedAt: now }
  const result = [...records]
  if (index === -1) result.push(next)
  else result[index] = next
  return { records: result, changed: true }
}

export const CSV_COLUMNS = [
  ['applyClickedAt', 'Apply clicked (UTC)'],
  ['title', 'Title'], ['company', 'Company'], ['location', 'Location'], ['url', 'Job URL'],
  ['clearance', 'Clearance'], ['sponsorship', 'Sponsorship'],
  ['experience', 'Expected experience'], ['eligibility', 'Citizenship / work eligibility'],
  ['bestScore', 'Best resume match (%)'], ['bestResumeSlots', 'Best resume slot(s)'],
]

function csvCell(value) {
  let text = String(value ?? '')
  // Posting content and filenames are untrusted spreadsheet cells.
  // eslint-disable-next-line no-control-regex -- Include control-prefixed formulas from page content.
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

export function capturesToCsv(records) {
  const rows = [CSV_COLUMNS.map(([, title]) => csvCell(title)).join(',')]
  for (const record of records) rows.push(CSV_COLUMNS.map(([key]) => csvCell(record[key])).join(','))
  // BOM helps Excel recognize Unicode city names, punctuation, and descriptions.
  return '\uFEFF' + rows.join('\r\n') + '\r\n'
}

export function csvRow(values) {
  return values.map(csvCell).join(',')
}
