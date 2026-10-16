import { useEffect, useRef, useState } from 'react'
import { DEFAULT_CAPTURE_SETTINGS, normalizeCaptureSettings } from '../lib/jobCapture'
import { getCaptureFolderHandle, setCaptureFolderHandle, resumeCaptureFolder } from '../lib/captureFile'
import { dailyCaptureName, localCaptureDay } from '../lib/dailyCapture'

export default function CaptureSettings({ open, onClose, captureState }) {
  const { settings, count, status, file, ready, error: loadError } = captureState
  const dialog = useRef(null)
  const folderHandle = useRef(null)
  const [chosenFolder, setChosenFolder] = useState('')
  const [draft, setDraft] = useState(DEFAULT_CAPTURE_SETTINGS)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const initialized = useRef(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    getCaptureFolderHandle().then((handle) => {
      if (!cancelled) { folderHandle.current = handle; setChosenFolder(handle?.name || '') }
    }).catch(() => {})
    return () => { cancelled = true }
  }, [open, file?.name])

  useEffect(() => {
    if (open) {
      if (!dialog.current.open) dialog.current.showModal()
    } else {
      dialog.current.close()
      initialized.current = false
    }
  }, [open])

  useEffect(() => {
    if (open && ready && !initialized.current) {
      initialized.current = true
      setDraft(settings)
      setConfirmClear(false)
      setMessage('')
      setError('')
    }
  }, [open, ready, settings])

  function change(key, value) {
    setDraft((current) => ({ ...current, [key]: value }))
    setMessage('')
  }

  async function request(message) {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const result = await chrome.runtime.sendMessage(message)
      if (!result?.ok) throw new Error(result?.error || 'Could not save. Try again.')
      setConfirmClear(false)
      if (message.type === 'SET_CAPTURE_SETTINGS') setMessage('Settings saved.')
    } catch (err) {
      setError(err.message || 'Could not save. Try again.')
    } finally { setBusy(false) }
  }

  async function chooseFolder(enable = false) {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      // Folder access must be granted from the user's click, never the worker.
      const handle = await window.showDirectoryPicker({ mode: 'readwrite', id: 'job-scanner-folder', startIn: 'documents' })
      if (await handle.queryPermission({ mode: 'readwrite' }) !== 'granted' &&
          await handle.requestPermission({ mode: 'readwrite' }) !== 'granted') {
        throw new Error('Allow read/write access to save daily CSV files in this folder.')
      }
      await setCaptureFolderHandle(handle)
      folderHandle.current = handle
      setChosenFolder(handle.name)
      if (enable) change('enabled', true)
      await request({ type: 'CONNECT_CAPTURE_FILE' })
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message || 'Could not connect the folder. Use a current desktop Chrome browser.')
    } finally { setBusy(false) }
  }

  async function restoreFolderAccess() {
    setBusy(true)
    setError('')
    try {
      await resumeCaptureFolder(folderHandle.current, chrome)
    } catch (err) {
      setError(err.message || 'Could not restore folder access.')
    } finally { setBusy(false) }
  }

  const dirty = JSON.stringify(normalizeCaptureSettings(draft)) !== JSON.stringify(settings)
  const folderName = chosenFolder || (file?.kind === 'directory' ? file.name : '')
  return (
    <dialog ref={dialog} className="settings-dialog" id="capture-settings" aria-labelledby="capture-settings-title"
      onCancel={(event) => { event.preventDefault(); onClose() }}
      onClick={(event) => { if (event.target === dialog.current) onClose() }}>
      <div className="capture-settings">
        <div className="settings-heading">
          <div><h2 id="capture-settings-title">Settings</h2><p className="hint">Choose when jobs are saved</p></div>
          <button type="button" className="settings-close" aria-label="Close settings" onClick={onClose}>×</button>
        </div>
        <form onSubmit={(event) => { event.preventDefault(); void request({ type: 'SET_CAPTURE_SETTINGS', settings: normalizeCaptureSettings(draft) }) }}>
          <fieldset disabled={!ready || busy}>
            <label className="setting-toggle">
              <input type="checkbox" checked={draft.enabled} onChange={(event) => {
                if (event.target.checked && !folderHandle.current) void chooseFolder(true)
                else change('enabled', event.target.checked)
              }} />
              <span>Save CSV files to a folder</span>
            </label>
            <p className="hint">Choose a folder when enabling. Jobs are written directly to its dated CSV files.</p>
            {draft.enabled && <div className="settings-actions">
              <button type="button" onClick={() => {
                if (status?.state === 'needs-permission' && folderHandle.current) void restoreFolderAccess()
                else void chooseFolder()
              }}>{status?.state === 'needs-permission' ? 'Allow folder access' : (folderName ? 'Change folder' : 'Choose folder')}</button>
              {folderName && <span className="hint">{folderName}/{dailyCaptureName(localCaptureDay())}</span>}
            </div>}
            <label className="setting-field">
              <span>When to save</span>
              <select value={draft.mode} onChange={(event) => change('mode', event.target.value)}>
                <option value="automatic">Automatically when I view a job</option>
                <option value="apply">Only when I click Apply or Easy Apply</option>
              </select>
            </label>
            <p className="hint">Works with the panel closed. Apply-only saving records your click on LinkedIn, including links to a company website; it does not confirm a submitted application.</p>
            <div className="settings-divider" />
            <h3>Save only jobs that match</h3>
            <p className="hint">Every condition below must pass, in either mode. Changes apply to future saves.</p>
            <label className="setting-field">
              <span className="match-slider-label">Minimum resume match <strong>{draft.minMatch}%</strong></span>
              <input type="range" min="0" max="100" step="1" value={draft.minMatch} aria-label="Minimum resume match"
                aria-valuetext={`${draft.minMatch}%`} onChange={(event) => change('minMatch', Number(event.target.value))} />
            </label>
            <p className="hint">0% saves every opened job that passes your other rules, even without a resume. At 40%, any one of your resumes must match at least 40%. In Apply-only mode, the same threshold applies after you click Apply.</p>
            <details className="additional-save-rules">
              <summary>Clearance, sponsorship &amp; other filters</summary>
            <label className="setting-field">
              <span>Sponsorship</span>
              <select value={draft.sponsorship} onChange={(event) => change('sponsorship', event.target.value)}>
                <option value="any">Any sponsorship status</option>
                <option value="not-denied">Skip jobs explicitly refusing sponsorship</option>
                <option value="available">Only jobs offering sponsorship</option>
              </select>
            </label>
            <label className="setting-toggle settings-spaced">
              <input type="checkbox" checked={draft.includeClearance} onChange={(event) => change('includeClearance', event.target.checked)} />
              <span>Include jobs requiring clearance</span>
            </label>
            <p className="hint">When off, skips detected clearance requirements. Optional or unclear mentions remain eligible.</p>
            <label className="setting-field">
              <span>Job title contains</span>
              <input type="text" maxLength="300" placeholder="e.g. engineer, developer" value={draft.titleIncludes}
                onChange={(event) => change('titleIncludes', event.target.value)} />
            </label>
            <label className="setting-field">
              <span>Location contains</span>
              <input type="text" maxLength="300" placeholder="e.g. Chicago, United States" value={draft.locationIncludes}
                onChange={(event) => change('locationIncludes', event.target.value)} />
            </label>
            <p className="hint">Leave blank for any. Commas separate alternatives; matching ignores case.</p>
            <label className="setting-toggle settings-spaced">
              <input type="checkbox" checked={draft.updateExisting} onChange={(event) => change('updateExisting', event.target.checked)} />
              <span>Update saved jobs when I revisit them</span>
            </label>
            <p className="hint">When off, keeps the first saved version. Saved rows remain when you change filters or turn saving off.</p>
            </details>
          </fieldset>
          <div className="settings-save-row">
            <span className="hint" role="status">{message || (dirty ? 'Unsaved changes' : 'Settings up to date')}</span>
            <button type="submit" className="settings-primary" disabled={!ready || busy || !dirty || (draft.enabled && !folderName)}>Save settings</button>
          </div>
        </form>
        <div className="settings-divider" />
        <p className="capture-summary" role="status">{count} {count === 1 ? 'job' : 'jobs'} saved locally · {settings.enabled ? (settings.mode === 'apply' ? 'Apply-only saving' : 'Automatic saving') : 'Saving off'}</p>
        <p className="hint">{folderName ? `Folder: ${folderName}. A new CSV starts each day, using your local date.` : 'Choose a folder to write saved jobs to disk.'}</p>
        {status?.state === 'saving' && <p className="hint" role="status">Saving CSV…</p>}
        {status?.state === 'complete' && <p className="hint" role="status">Saved to {status.folderName}/{status.fileName}.</p>}
        {status?.pending && settings.enabled && <p className="hint" role="status">{status.message}</p>}
        {['needs-folder', 'needs-permission'].includes(status?.state) && settings.enabled && <p className="error" role="alert">{status.message}</p>}
        <details className="capture-file-details"><summary>Manage saved data</summary>
        <div className="settings-actions">
          <button type="button" disabled={!ready || busy || !count} onClick={() => {
            if (confirmClear) void request({ type: 'CLEAR_CAPTURED_JOBS' })
            else setConfirmClear(true)
          }}>{confirmClear ? 'Confirm clear' : 'Clear saved jobs'}</button>
          {confirmClear && <button type="button" onClick={() => setConfirmClear(false)}>Cancel</button>}
        </div>
        {confirmClear && <p className="hint">Removes captured jobs from this browser and empties today’s CSV in the selected folder. Earlier daily files and other copies remain.</p>}
        </details>
        {(error || loadError || status?.error) && <p className="error" role="alert">{error || loadError || status.error}</p>}
        <details className="capture-file-details"><summary>What goes into the file?</summary>
          <p className="hint">Apply clicked (UTC), Title, Company, Location, Job URL, Clearance, Sponsorship, Expected experience, Citizenship / work eligibility, Best resume match (%), and Best resume slot(s). All tied best resume slots are included. Apply time is blank until a click is observed.</p>
        </details>
      </div>
    </dialog>
  )
}
