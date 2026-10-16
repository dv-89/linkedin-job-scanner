import { useEffect, useState } from 'react'
import {
  CAPTURE_SETTINGS_KEY, CAPTURE_JOBS_KEY, CAPTURE_STATUS_KEY, CAPTURE_FILE_KEY,
  DEFAULT_CAPTURE_SETTINGS, normalizeCaptureSettings,
} from './jobCapture'

export function useCaptureState() {
  const [state, setState] = useState({
    settings: DEFAULT_CAPTURE_SETTINGS, count: 0, status: null, file: null, ready: false, error: '',
  })
  useEffect(() => {
    let disposed = false
    let revision = 0
    async function refresh() {
      const request = ++revision
      try {
        const saved = await chrome.storage.local.get([CAPTURE_SETTINGS_KEY, CAPTURE_JOBS_KEY, CAPTURE_STATUS_KEY, CAPTURE_FILE_KEY])
        if (disposed || request !== revision) return
        setState({
          settings: normalizeCaptureSettings(saved[CAPTURE_SETTINGS_KEY]),
          count: saved[CAPTURE_JOBS_KEY]?.length || 0,
          status: saved[CAPTURE_STATUS_KEY] || null, file: saved[CAPTURE_FILE_KEY] || null, ready: true, error: '',
        })
      } catch {
        if (!disposed && request === revision) {
          setState((current) => ({ ...current, error: 'Could not load job-saving settings. Reopen the panel to retry.' }))
        }
      }
    }
    const changed = (changes, area) => {
      if (area === 'local' && [CAPTURE_SETTINGS_KEY, CAPTURE_JOBS_KEY, CAPTURE_STATUS_KEY, CAPTURE_FILE_KEY].some((key) => changes[key])) {
        void refresh()
      }
    }
    chrome.storage.onChanged.addListener(changed)
    void refresh()
    return () => { disposed = true; chrome.storage.onChanged.removeListener(changed) }
  }, [])
  return state
}
