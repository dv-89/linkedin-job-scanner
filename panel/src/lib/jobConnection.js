const JOB_URL = /^https:\/\/www\.linkedin\.com\/jobs\//
const injections = new WeakMap()

// LinkedIn can enter Jobs through a same-document navigation. Attach the reader
// when no receiving script exists, including tabs open before an extension update.
export async function requestJobData(api, tab, isCurrent = () => true) {
  if (tab?.id === undefined || !JOB_URL.test(tab.url || '') || !isCurrent()) return null
  try {
    const response = await api.tabs.sendMessage(tab.id, { type: 'REQUEST_JOB_DATA' })
    if (response?.url === tab.url) return isCurrent() ? response : null
  } catch {
    // A missing or invalidated content script is repaired below.
  }
  if (!isCurrent() || !api.scripting?.executeScript) return null
  const current = await api.tabs.get(tab.id)
  if (!isCurrent() || current.url !== tab.url || !JOB_URL.test(current.url || '')) return null
  let pending = injections.get(api)
  if (!pending) { pending = new Map(); injections.set(api, pending) }
  let attempt = pending.get(tab.id)
  if (!attempt || attempt.url !== tab.url) {
    attempt = { url: tab.url, task: api.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] }) }
    pending.set(tab.id, attempt)
    // Remove only this attempt; a navigation may already have started another.
    const currentAttempt = attempt
    void attempt.task.finally(() => { if (pending.get(tab.id) === currentAttempt) pending.delete(tab.id) }).catch(() => {})
  }
  await attempt.task
  if (!isCurrent()) return null
  const response = await api.tabs.sendMessage(tab.id, { type: 'REQUEST_JOB_DATA' })
  return isCurrent() && response?.url === tab.url ? response : null
}

export function installJobConnection(api) {
  api.tabs.onUpdated.addListener((_tabId, change, tab) => {
    if (!tab?.active || (!change.url && change.status !== 'complete') || !JOB_URL.test(tab.url || '')) return
    void requestJobData(api, tab).catch(() => {})
  })
}
