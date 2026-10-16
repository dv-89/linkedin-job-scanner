import { useEffect, useRef, useState } from 'react'
import { getCaptureFolderHandle, resumeCaptureFolder } from '../lib/captureFile'

export default function CaptureSaveNotice({ captureState, onOpenSettings }) {
  const { ready, settings, status, count } = captureState
  const folder = useRef(null)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const needsPermission = status?.state === 'needs-permission'

  useEffect(() => {
    setError('')
    if (!needsPermission) return
    let cancelled = false
    setLoaded(false)
    getCaptureFolderHandle().then((handle) => {
      if (!cancelled) folder.current = handle
    }).catch(() => { if (!cancelled) folder.current = null }).finally(() => {
      if (!cancelled) setLoaded(true)
    })
    return () => { cancelled = true }
  }, [needsPermission, captureState.file?.name])

  if (!ready || !settings.enabled || !['needs-permission', 'needs-folder', 'waiting-file', 'error'].includes(status?.state)) return null

  async function resume() {
    if (!needsPermission || !folder.current) { onOpenSettings(); return }
    setBusy(true)
    setError('')
    try { await resumeCaptureFolder(folder.current, chrome) }
    catch (err) { setError(err.message || 'Could not restore folder access. Your jobs are kept locally.') }
    finally { setBusy(false) }
  }

  const waiting = status.state === 'waiting-file'
  const message = needsPermission ? 'Chrome needs folder access before it can update your CSV.'
    : status.state === 'needs-folder' ? 'Choose a save folder to write your jobs to CSV.'
      : waiting ? 'Close the CSV in Excel if open. Queued jobs will save automatically when it is writable.'
        : (status.error || 'The CSV could not be updated. Your jobs are kept locally for retry.')
  return (
    <div className="capture-save-notice" role={waiting ? 'status' : 'alert'}>
      <strong>{waiting ? 'CSV update queued' : 'CSV saving paused'}</strong>
      <p>{message}</p>
      <p>{count} {count === 1 ? 'job is' : 'jobs are'} stored in this browser.</p>
      {!waiting && <button type="button" disabled={busy || (needsPermission && !loaded)} onClick={resume}>
        {busy ? 'Resuming…' : needsPermission && folder.current ? 'Allow folder access' : 'Open settings'}
      </button>}
      {error && <p className="error">{error}</p>}
    </div>
  )
}
