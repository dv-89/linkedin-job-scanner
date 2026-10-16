import { installCaptureBackground } from './captureBackground.js'
import { installJobConnection } from './panel/src/lib/jobConnection.js'

installCaptureBackground(chrome)
installJobConnection(chrome)

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.error('[JobScanner] setPanelBehavior failed', err))
})
