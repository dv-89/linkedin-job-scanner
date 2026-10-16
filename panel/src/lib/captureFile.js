import { capturesToCsv } from './jobCapture.js'
import { mergeCaptureCsv } from './captureCsv.js'

// File handles are structured-cloneable in IndexedDB, not Chrome's JSON store.
function fileHandleTransaction(mode, handle) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('job-scanner-files', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('handles')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      const transaction = db.transaction('handles', mode)
      const store = transaction.objectStore('handles')
      const operation = mode === 'readonly' ? store.get('captureFolder') : store.put(handle, 'captureFolder')
      let result
      operation.onsuccess = () => { result = operation.result }
      transaction.oncomplete = () => { db.close(); resolve(result || null) }
      transaction.onabort = transaction.onerror = () => { db.close(); reject(transaction.error || operation.error) }
    }
  })
}

export const getCaptureFolderHandle = () => fileHandleTransaction('readonly')
export const setCaptureFolderHandle = (handle) => fileHandleTransaction('readwrite', handle)

// Call only from a user click so Chrome can show its folder-access prompt.
export async function resumeCaptureFolder(handle, api) {
  if (!handle) throw new Error('Choose a save folder in Settings to resume. Your jobs are kept locally.')
  if (await handle.requestPermission({ mode: 'readwrite' }) !== 'granted') {
    throw new Error('Folder access was not granted. Your jobs are kept locally.')
  }
  const result = await api.runtime.sendMessage({ type: 'CONNECT_CAPTURE_FILE' })
  if (!result?.ok) throw new Error(result?.error || 'Folder access restored, but the queued CSV could not be updated yet.')
}

export async function writeCaptureFile(handle, records, options = {}) {
  if (!handle) throw new Error('Choose a CSV file in Settings. Jobs are kept locally until a file is connected.')
  if (await handle.queryPermission({ mode: 'readwrite' }) !== 'granted') {
    throw Object.assign(new Error('CSV access expired. Jobs are kept locally.'), { name: 'NotAllowedError' })
  }
  const previous = await (await handle.getFile()).text()
  const text = options.clear ? capturesToCsv([]) : options.replace ? capturesToCsv(records) : mergeCaptureCsv(previous, records, options)
  if (text === previous) return
  const writable = await handle.createWritable()
  try {
    await writable.write(text)
    await writable.close()
  } catch (error) {
    await writable.abort().catch(() => {})
    throw error
  }
}
