import { writeCaptureFile } from './captureFile.js'

export const CAPTURE_DAYS_KEY = 'capturedJobDays'
export const CAPTURE_PENDING_KEY = 'capturePendingWrites'

export function localCaptureDay(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export const dailyCaptureName = (day) => `jobs-${day}.csv`

export function captureDays(savedDays, records, now = new Date()) {
  if (savedDays) return savedDays
  const days = {}
  for (const record of records) {
    const timestamp = new Date(record.applyClickedAt || record.firstSeen || record.updatedAt || now)
    const day = localCaptureDay(Number.isNaN(timestamp.getTime()) ? now : timestamp)
    ;(days[day] ||= []).push(record)
  }
  return days
}

export async function writeDailyCapture(folder, day, records, options = {}) {
  if (!folder || folder.kind !== 'directory') throw new Error('Choose a save folder in Settings first. Jobs are kept locally.')
  if (await folder.queryPermission({ mode: 'readwrite' }) !== 'granted') {
    throw Object.assign(new Error('Allow folder access in Settings to resume saving. Jobs are kept locally.'), { name: 'NotAllowedError' })
  }
  const filename = dailyCaptureName(day)
  const file = await folder.getFileHandle(filename, { create: true })
  await writeCaptureFile(file, records, options)
  return filename
}
