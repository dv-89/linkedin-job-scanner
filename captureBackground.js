import { RESUME_SLOTS } from './panel/src/lib/storage.js'
import {
  CAPTURE_SETTINGS_KEY, CAPTURE_JOBS_KEY, CAPTURE_STATUS_KEY, CAPTURE_FILE_KEY,
  normalizeCaptureSettings, getCaptureDecision, upsertCapture,
} from './panel/src/lib/jobCapture.js'
import { getCaptureFolderHandle, setCaptureFolderHandle } from './panel/src/lib/captureFile.js'
import { requestJobData } from './panel/src/lib/jobConnection.js'
import { CAPTURE_DAYS_KEY, CAPTURE_PENDING_KEY, captureDays, localCaptureDay, dailyCaptureName, writeDailyCapture } from './panel/src/lib/dailyCapture.js'

export const CAPTURE_RETRY_ALARM = 'job-scanner-csv-retry'

export function installCaptureBackground(api, fileStore = { getHandle: getCaptureFolderHandle, setHandle: setCaptureFolderHandle, write: writeDailyCapture }, now = () => new Date()) {
  // Serialize captures and file writes so overlapping events cannot lose rows.
  let pending = Promise.resolve()
  const enqueue = (action) => {
    const task = pending.then(action)
    pending = task.catch(() => {})
    return task
  }
  const saveStatus = (status) => api.storage.local.set({ [CAPTURE_STATUS_KEY]: status })

  async function clearRetryAlarm() {
    await api.alarms?.clear(CAPTURE_RETRY_ALARM)
  }
  async function scheduleRetry() {
    if (!api.alarms) return
    const saved = await api.storage.local.get([CAPTURE_SETTINGS_KEY])
    if (!normalizeCaptureSettings(saved[CAPTURE_SETTINGS_KEY]).enabled) return clearRetryAlarm()
    // Keep the original deadline when more jobs arrive while Excel is open.
    if (!await api.alarms.get(CAPTURE_RETRY_ALARM)) {
      await api.alarms.create(CAPTURE_RETRY_ALARM, { delayInMinutes: 0.5, periodInMinutes: 0.5 })
    }
  }

  async function exportCsv(records, options = {}) {
    let folder
    try {
      const saved = await api.storage.local.get([CAPTURE_SETTINGS_KEY, CAPTURE_DAYS_KEY, CAPTURE_PENDING_KEY])
      const settings = normalizeCaptureSettings(saved[CAPTURE_SETTINGS_KEY])
      if (!settings.enabled && !options.clear) {
        await clearRetryAlarm()
        return true
      }
      const days = { ...captureDays(saved[CAPTURE_DAYS_KEY], records, now()) }
      // Bring pending jobs from earlier versions into the dated archive too.
      for (const record of records) {
        const date = new Date(record.applyClickedAt || record.updatedAt || record.firstSeen || now())
        const day = localCaptureDay(Number.isNaN(date.getTime()) ? now() : date)
        const previous = days[day] || []
        const existing = previous.find((item) => item.id === record.id)
        if (!existing || Date.parse(record.updatedAt) > Date.parse(existing.updatedAt)) {
          days[day] = upsertCapture(previous, record, record.updatedAt).records
        }
      }
      const queued = { ...saved[CAPTURE_PENDING_KEY] }
      const dates = options.pendingOnly ? Object.keys(queued).sort()
        : options.clear || options.day ? [options.day || localCaptureDay(now())]
          : (Object.keys(days).length ? Object.keys(days).sort() : [localCaptureDay(now())])
      for (const day of dates) queued[day] = { ...queued[day], ...(options.clear ? { replace: true } : {}) }
      await api.storage.local.set({ [CAPTURE_DAYS_KEY]: days, [CAPTURE_PENDING_KEY]: queued })
      if (!dates.length) { await clearRetryAlarm(); return true }
      folder = await fileStore.getHandle()
      await api.storage.local.set({ [CAPTURE_FILE_KEY]: folder ? { name: folder.name, kind: 'directory' } : null })
      if (!folder) {
        await clearRetryAlarm()
        await saveStatus({ state: 'needs-folder', error: '', message: 'Choose a save folder once. Your jobs are kept locally until then.' })
        return false
      }
      if (await folder.queryPermission({ mode: 'readwrite' }) !== 'granted') {
        await clearRetryAlarm()
        await saveStatus({ state: 'needs-permission', error: '', message: 'Allow folder access to resume saving. Your jobs are kept locally.' })
        return false
      }
      // A worker restart during a write must leave an alarm to resume the queue.
      await scheduleRetry()
      for (const day of dates) {
        const fileName = dailyCaptureName(day)
        await saveStatus({ state: 'saving', fileName, folderName: folder.name, error: '' })
        try {
          await fileStore.write(folder, day, days[day] || [], { updateExisting: settings.updateExisting, replace: queued[day].replace === true })
          delete queued[day]
        } catch (error) {
          if (error.name === 'NotFoundError' || (error.name === 'NotAllowedError' &&
              await folder.queryPermission({ mode: 'readwrite' }) !== 'granted')) throw error
          queued[day] = { ...queued[day], error: error.message || 'File could not be updated.',
            busy: ['NoModificationAllowedError', 'NotAllowedError', 'InvalidStateError'].includes(error.name) }
        }
        await api.storage.local.set({ [CAPTURE_PENDING_KEY]: { ...queued } })
      }
      const remaining = Object.keys(queued)
      if (remaining.length) {
        await scheduleRetry()
        const item = queued[remaining[0]]
        await saveStatus({ state: item.busy ? 'waiting-file' : 'error', pending: true,
          fileName: dailyCaptureName(remaining[0]), folderName: folder.name,
          message: 'CSV update queued. Close the CSV in Excel if open; saving will retry about every 30 seconds while Chrome is running.',
          error: item.busy ? '' : (item.error || '') })
        return false
      }
      await clearRetryAlarm()
      await saveStatus({ state: 'complete', fileName: dailyCaptureName(dates.at(-1)), folderName: folder.name, error: '' })
      return true
    } catch (error) {
      if (error.name === 'NotAllowedError' && folder && await folder.queryPermission({ mode: 'readwrite' }).catch(() => 'denied') !== 'granted') {
        await clearRetryAlarm()
        await saveStatus({ state: 'needs-permission', error: '', message: 'Allow folder access to resume saving. Your jobs are kept locally.' })
      } else if (error.name === 'NotFoundError') {
        await clearRetryAlarm()
        await fileStore.setHandle(null)
        await api.storage.local.set({ [CAPTURE_FILE_KEY]: null })
        await saveStatus({ state: 'needs-folder', error: '', message: 'The save folder could not be found. Choose a folder to resume. Your jobs are kept locally.' })
      } else {
        await scheduleRetry()
        await saveStatus({ state: 'error', error: error.message || 'CSV could not be updated. Close it in Excel if open. Saving will retry automatically; your jobs are kept locally.' })
      }
      return false
    }
  }

  async function capture(job, trigger = 'view') {
    const saved = await api.storage.local.get([CAPTURE_SETTINGS_KEY, CAPTURE_JOBS_KEY, CAPTURE_DAYS_KEY, CAPTURE_PENDING_KEY, CAPTURE_STATUS_KEY, ...RESUME_SLOTS])
    const settings = normalizeCaptureSettings(saved[CAPTURE_SETTINGS_KEY])
    if (trigger !== 'apply' && settings.mode === 'apply') return
    const { record, reason } = getCaptureDecision(job, RESUME_SLOTS.map((slot) => saved[slot] ?? null), settings)
    if (!record) return { ok: false, error: reason }
    const records = saved[CAPTURE_JOBS_KEY] || []
    const timestamp = now()
    const result = !settings.updateExisting && records.some((item) => item.id === record.id)
      ? { records, changed: false } : upsertCapture(records, record, timestamp.toISOString())
    const day = localCaptureDay(trigger === 'apply' ? new Date(job.applyClickedAt) : timestamp)
    const days = captureDays(saved[CAPTURE_DAYS_KEY], records, timestamp)
    const previous = days[day] || []
    const daily = !settings.updateExisting && previous.some((item) => item.id === record.id)
      ? { records: previous, changed: false } : upsertCapture(previous, record, timestamp.toISOString())
    if (result.changed || daily.changed) {
      await api.storage.local.set({ [CAPTURE_JOBS_KEY]: result.records, [CAPTURE_DAYS_KEY]: { ...days, [day]: daily.records },
        [CAPTURE_PENDING_KEY]: { ...saved[CAPTURE_PENDING_KEY], [day]: { ...saved[CAPTURE_PENDING_KEY]?.[day] } } })
    }
    if (!daily.changed && !saved[CAPTURE_PENDING_KEY]?.[day] && !['error', 'waiting-file', 'saving', 'needs-file', 'needs-folder', 'needs-permission'].includes(saved[CAPTURE_STATUS_KEY]?.state)) {
      return { ok: true, message: 'Already saved. This posting is up to date.' }
    }
    const exported = await exportCsv(result.records, { day })
    return { ok: true, message: exported ? 'Job saved to CSV.' : 'Job saved locally. Check the save folder in Settings.' }
  }

  async function captureActiveJob() {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true })
    if (!tab?.url?.startsWith('https://www.linkedin.com/jobs/')) return { ok: false, error: 'Open a LinkedIn job posting first.' }
    let job
    try { job = await requestJobData(api, tab) } catch {
      return { ok: false, error: 'Could not connect to the posting. Check extension access to LinkedIn and try again.' }
    }
    if (job?.url !== tab.url) return { ok: false, error: 'The posting changed. Wait for the panel to update and try again.' }
    return capture(job)
  }

  async function handle(message) {
    if (message.type === 'SET_CAPTURE_SETTINGS') {
      const settings = normalizeCaptureSettings(message.settings)
      await api.storage.local.set({ [CAPTURE_SETTINGS_KEY]: settings })
      if (settings.enabled) {
        const saved = await api.storage.local.get([CAPTURE_JOBS_KEY, CAPTURE_PENDING_KEY])
        if (saved[CAPTURE_JOBS_KEY]?.length || Object.keys(saved[CAPTURE_PENDING_KEY] || {}).length) await exportCsv(saved[CAPTURE_JOBS_KEY] || [])
        await captureActiveJob()
      } else await clearRetryAlarm()
      return { ok: true }
    }
    if (['EXPORT_CAPTURE_CSV', 'CONNECT_CAPTURE_FILE'].includes(message.type)) {
      const saved = await api.storage.local.get([CAPTURE_JOBS_KEY])
      if (await exportCsv(saved[CAPTURE_JOBS_KEY] || [])) return { ok: true }
      const latest = await api.storage.local.get([CAPTURE_STATUS_KEY])
      const status = latest[CAPTURE_STATUS_KEY]
      return { ok: false, error: status?.error || status?.message || 'Your jobs are kept locally until folder access is available.' }
    }
    if (message.type === 'CLEAR_CAPTURED_JOBS') {
      await api.storage.local.set({ [CAPTURE_JOBS_KEY]: [], [CAPTURE_DAYS_KEY]: {},
        [CAPTURE_PENDING_KEY]: { [localCaptureDay(now())]: { replace: true } } })
      await exportCsv([], { clear: true })
      return { ok: true }
    }
  }

  api.runtime.onMessage.addListener((message, sender, respond) => {
    let action
    if (message?.type === 'JOB_DATA' && sender.tab?.active && message.url === sender.tab.url) {
      action = () => capture(message)
    } else if (message?.type === 'JOB_APPLY_CLICKED' && sender.tab?.id !== undefined &&
        message.url === (sender.url || sender.tab.url) && message.url?.startsWith('https://www.linkedin.com/jobs/')) {
      const clickedJob = { ...message, applyClickedAt: now().toISOString() }
      action = () => capture(clickedJob, 'apply')
    } else if (['SET_CAPTURE_SETTINGS', 'EXPORT_CAPTURE_CSV', 'CONNECT_CAPTURE_FILE', 'CLEAR_CAPTURED_JOBS'].includes(message?.type) &&
        sender.url?.startsWith(api.runtime.getURL('panel/'))) {
      action = () => handle(message)
    }
    if (!action) return
    enqueue(action).then((result) => respond(result || { ok: true })).catch(async () => {
      await saveStatus({ state: 'error', error: 'Job capture could not be saved. Check available extension storage and try again.' }).catch(() => {})
      respond({ ok: false, error: 'Could not save capture data. Try again.' })
    })
    return true
  })
  api.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && RESUME_SLOTS.some((slot) => changes[slot])) void enqueue(captureActiveJob).catch(() => {})
  })
  api.tabs.onActivated.addListener(() => { void enqueue(captureActiveJob).catch(() => {}) })
  api.alarms?.onAlarm.addListener((alarm) => {
    if (alarm.name !== CAPTURE_RETRY_ALARM) return
    void enqueue(async () => {
      const saved = await api.storage.local.get([CAPTURE_JOBS_KEY])
      await exportCsv(saved[CAPTURE_JOBS_KEY] || [], { pendingOnly: true })
    }).catch(() => {})
  })
  void enqueue(async () => {
    const saved = await api.storage.local.get([CAPTURE_SETTINGS_KEY, CAPTURE_JOBS_KEY, CAPTURE_PENDING_KEY, CAPTURE_STATUS_KEY, CAPTURE_FILE_KEY])
    if (!normalizeCaptureSettings(saved[CAPTURE_SETTINGS_KEY]).enabled) { await clearRetryAlarm(); return }
    if (Object.keys(saved[CAPTURE_PENDING_KEY] || {}).length) {
      await exportCsv(saved[CAPTURE_JOBS_KEY] || [], { pendingOnly: true })
      return
    }
    if (!saved[CAPTURE_JOBS_KEY]?.length) return
    if (saved[CAPTURE_FILE_KEY]?.kind !== 'directory' || saved[CAPTURE_STATUS_KEY]?.state !== 'complete') {
      await exportCsv(saved[CAPTURE_JOBS_KEY])
    }
  }).catch(() => {})
}
