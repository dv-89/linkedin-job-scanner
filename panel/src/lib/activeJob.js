const LINKEDIN_JOB_URL = /^https:\/\/www\.linkedin\.com\/jobs\//

// Own the tab listeners together so pending requests can be invalidated on
// navigation, tab switches, incoming updates, and panel cleanup.
export function subscribeToActiveJob(chromeApi, onChange) {
  let disposed = false
  let revision = 0
  let activeTabId = null
  let activeUrl = null
  const messageSequences = new Map()

  const queryActiveTab = async () => {
    const [tab] = await chromeApi.tabs.query({ active: true, currentWindow: true })
    return tab
  }

  async function syncActiveTab() {
    const requestRevision = ++revision
    const tab = await queryActiveTab()
    if (disposed || requestRevision !== revision) return

    if (!tab?.url || !LINKEDIN_JOB_URL.test(tab.url)) {
      activeTabId = null
      activeUrl = null
      onChange({ isLinkedInJobPage: false, jobData: null })
      return
    }

    if (tab.id !== activeTabId || tab.url !== activeUrl) {
      onChange({ isLinkedInJobPage: true, jobData: null })
    }
    activeTabId = tab.id
    activeUrl = tab.url

    try {
      const response = await chromeApi.tabs.sendMessage(tab.id, {
        type: 'REQUEST_JOB_DATA',
      })
      if (!disposed && requestRevision === revision && response?.url === tab.url) {
        onChange({ isLinkedInJobPage: true, jobData: response })
      }
    } catch {
      // A newly loaded tab may not have its content script yet.
    }
  }

  async function acceptMessage(message, sender) {
    const messageRevision = revision
    const tabId = sender.tab.id
    const sequence = (messageSequences.get(tabId) || 0) + 1
    messageSequences.set(tabId, sequence)
    const tab = await queryActiveTab()
    if (disposed || messageRevision !== revision || sequence !== messageSequences.get(tabId) ||
        tab?.id !== tabId ||
        !LINKEDIN_JOB_URL.test(tab?.url || '') || message.url !== tab.url) return

    // A pushed update supersedes an older pull that may still be in flight.
    revision++
    activeTabId = tab.id
    activeUrl = tab.url
    onChange({ isLinkedInJobPage: true, jobData: message })
  }

  function handleMessage(message, sender) {
    if (message?.type === 'JOB_DATA' && sender?.tab?.id !== undefined) {
      void acceptMessage(message, sender)
    }
  }

  function handleUpdated(tabId, changeInfo, tab) {
    if ((tabId === activeTabId || tab?.active) &&
        (changeInfo.url || changeInfo.status === 'complete')) {
      void syncActiveTab()
    }
  }

  chromeApi.tabs.onActivated.addListener(syncActiveTab)
  chromeApi.tabs.onUpdated.addListener(handleUpdated)
  chromeApi.runtime.onMessage.addListener(handleMessage)
  void syncActiveTab()

  return () => {
    disposed = true
    revision++
    chromeApi.tabs.onActivated.removeListener(syncActiveTab)
    chromeApi.tabs.onUpdated.removeListener(handleUpdated)
    chromeApi.runtime.onMessage.removeListener(handleMessage)
  }
}
