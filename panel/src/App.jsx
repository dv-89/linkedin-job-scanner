import { useEffect, useMemo, useState } from 'react'
import ResumeStatus from './components/ResumeStatus'
import JobHeader from './components/JobHeader'
import MatchResults from './components/MatchResults'
import JobFields from './components/JobFields'
import ResumeTabs from './components/ResumeTabs'
import ReorderableSection from './components/ReorderableSection'
import CaptureSettings from './components/CaptureSettings'
import CaptureSaveNotice from './components/CaptureSaveNotice'
import { extractTextFromPdf } from './lib/extractText'
import { matchKeywords } from './lib/keywordMatch'
import { analyzeJobFields } from './lib/jobFields'
import { subscribeToActiveJob } from './lib/activeJob'
import { useCaptureState } from './lib/useCaptureState'
import { RESUME_SLOTS, DEFAULT_SECTION_ORDER, getPanelState, setResume as saveResume, clearResume, setSectionOrder as saveSectionOrder } from './lib/storage'
import './App.css'

const SECTION_TITLES = {
  details: 'Job details', resume: 'Resume', job: 'Title & company', keywords: 'Skills & keywords',
}
const FEATURE_REQUEST_URL = `mailto:dvardhan89@gmail.com?subject=${encodeURIComponent('Job Scanner feature request')}&body=${encodeURIComponent('Feature I would like:\n\nHow it would help:\n\n')}`

function App() {
  const [resumes, setResumes] = useState([null, null, null])
  const [activeIndex, setActiveIndex] = useState(0)
  const [busySlots, setBusySlots] = useState({})
  const [resumeErrors, setResumeErrors] = useState({})
  const [sectionOrder, setSectionOrder] = useState(DEFAULT_SECTION_ORDER)
  const [isSavingOrder, setIsSavingOrder] = useState(false)
  const [layoutMessage, setLayoutMessage] = useState('')
  const [loadStatus, setLoadStatus] = useState('loading')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const resume = resumes[activeIndex]
  const activeSlot = RESUME_SLOTS[activeIndex]

  const [isLinkedInJobPage, setIsLinkedInJobPage] = useState(false)
  const [jobData, setJobData] = useState(null)
  const [toast, setToast] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const captureState = useCaptureState()

  useEffect(() => {
    let cancelled = false
    getPanelState().then((saved) => {
      if (cancelled) return
      setResumes(saved.resumes)
      setSectionOrder(saved.sectionOrder)
      setLoadStatus('ready')
    }).catch(() => {
      if (!cancelled) setLoadStatus('error')
    })
    return () => { cancelled = true }
  }, [loadAttempt])

  useEffect(() => {
    return subscribeToActiveJob(chrome, ({ isLinkedInJobPage, jobData }) => {
      setIsLinkedInJobPage(isLinkedInJobPage)
      setJobData(jobData)
    })
  }, [])

  async function handleFileSelected(file) {
    if (!file || loadStatus !== 'ready' || busySlots[activeSlot]) return
    const slot = activeSlot
    const index = activeIndex
    setResumeErrors((errors) => ({ ...errors, [slot]: null }))
    setBusySlots((busy) => ({ ...busy, [slot]: true }))
    try {
      const text = await extractTextFromPdf(file)
      const next = { fileName: file.name, text }
      await saveResume(slot, next)
      setResumes((current) => current.map((item, i) => i === index ? next : item))
    } catch {
      setResumeErrors((errors) => ({ ...errors, [slot]: 'Could not read or save that PDF. Try again or choose a different file.' }))
    } finally {
      setBusySlots((busy) => ({ ...busy, [slot]: false }))
    }
  }

  async function handleClearResume() {
    if (loadStatus !== 'ready' || busySlots[activeSlot]) return
    const slot = activeSlot
    const index = activeIndex
    setResumeErrors((errors) => ({ ...errors, [slot]: null }))
    setBusySlots((busy) => ({ ...busy, [slot]: true }))
    try {
      await clearResume(slot)
      setResumes((current) => current.map((item, i) => i === index ? null : item))
    } catch {
      setResumeErrors((errors) => ({ ...errors, [slot]: 'Could not remove the saved resume. Try again.' }))
    } finally {
      setBusySlots((busy) => ({ ...busy, [slot]: false }))
    }
  }

  async function handleMoveSection(id, direction) {
    if (loadStatus !== 'ready' || isSavingOrder) return
    const index = sectionOrder.indexOf(id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= sectionOrder.length) return
    const next = [...sectionOrder]
    ;[next[index], next[target]] = [next[target], next[index]]
    setIsSavingOrder(true)
    try {
      await saveSectionOrder(next)
      setSectionOrder(next)
      setLayoutMessage(`${SECTION_TITLES[id]} moved ${direction < 0 ? 'up' : 'down'}. Layout saved for all tabs.`)
    } catch {
      setLayoutMessage('Could not save the layout. Try again.')
    } finally {
      setIsSavingOrder(false)
    }
  }

  async function handleLocate(searchTerm) {
    if (!searchTerm) return
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) return
    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'SCROLL_TO_TEXT',
        text: searchTerm,
      })
      if (!response?.found) {
        setToast("Couldn't find that on the page")
        setTimeout(() => setToast(null), 2000)
      }
    } catch {
      setToast('Open the job posting tab first')
      setTimeout(() => setToast(null), 2000)
    }
  }

  const allResults = useMemo(() => resumes.map((item) => {
    if (!item?.text || !jobData?.descriptionText) return null
    return matchKeywords(jobData.descriptionText, item.text)
  }), [resumes, jobData])
  const results = allResults[activeIndex]

  const fields = useMemo(() => {
    if (!jobData?.descriptionText) return null
    return analyzeJobFields(jobData.descriptionText)
  }, [jobData])

  const sections = {
    resume: <ResumeStatus
      key={activeSlot}
      resume={resume}
      isExtracting={Boolean(busySlots[activeSlot])}
      error={resumeErrors[activeSlot]}
      disabled={loadStatus !== 'ready'}
      onFileSelected={handleFileSelected}
      onClear={handleClearResume}
    />,
    job: <JobHeader isLinkedInJobPage={isLinkedInJobPage} jobData={jobData} />,
    keywords: results ? <MatchResults key={activeSlot} results={results} onKeywordClick={handleLocate} /> : (
      <div className="panel-section placeholder">
        <p>{!resume ? 'Upload a PDF in this tab’s Resume section to see keyword matches.' : 'Open a LinkedIn job posting to see keyword matches.'}</p>
      </div>
    ),
    details: fields ? <JobFields fields={fields} onLocate={handleLocate} /> : (
      <div className="panel-section placeholder"><p>Clearance, sponsorship, experience and preferred qualifications appear here when a job is loaded.</p></div>
    ),
  }

  return (
    <div className="app">
      <header>
        <h1>Job Scanner</h1>
        <button type="button" className="settings-button" aria-label="Job Scanner settings"
          aria-haspopup="dialog" aria-expanded={settingsOpen} aria-controls="capture-settings"
          onClick={() => setSettingsOpen((open) => !open)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="m9 3-.6 2.5-2.2 1.3L3.7 6 2 9l1.9 1.7v2.6L2 15l1.7 3 2.5-.8 2.2 1.3L9 21h6l.6-2.5 2.2-1.3 2.5.8 1.7-3-1.9-1.7v-2.6L22 9l-1.7-3-2.5.8-2.2-1.3L15 3Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          Settings
        </button>
      </header>

      <CaptureSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} captureState={captureState} />

      <CaptureSaveNotice captureState={captureState} onOpenSettings={() => setSettingsOpen(true)} />

      <ResumeTabs
        resumes={resumes}
        results={allResults}
        activeIndex={activeIndex}
        onSelect={setActiveIndex}
      />

      {loadStatus === 'loading' && <p className="hint" role="status">Loading saved resumes and layout…</p>}
      {loadStatus === 'error' && (
        <div className="error" role="alert">
          Could not load saved resumes and layout.{' '}
          <button type="button" className="link-btn" onClick={() => {
            setLoadStatus('loading')
            setLoadAttempt((attempt) => attempt + 1)
          }}>Retry</button>
        </div>
      )}

      <p className="layout-hint">Use ↑ ↓ to reorder sections. Layout is shared across all three tabs and saved in this browser.</p>
      <div className="sr-only" role="status">{layoutMessage}</div>
      {layoutMessage.startsWith('Could not') && <p className="error">{layoutMessage}</p>}
      <div className="resume-panel" id="resume-panel" role="tabpanel" aria-labelledby={`resume-tab-${activeIndex}`}>
        {sectionOrder.map((id, index) => (
          <ReorderableSection key={id} id={id} title={SECTION_TITLES[id]}
            index={index} count={sectionOrder.length}
            disabled={loadStatus !== 'ready' || isSavingOrder} onMove={handleMoveSection}>
            {sections[id]}
          </ReorderableSection>
        ))}
      </div>

      <footer className="privacy-footer">
        <a className="feature-request" href={FEATURE_REQUEST_URL}>Request a feature</a>
        <span aria-hidden="true"> · </span>
        <a href={chrome.runtime.getURL('privacy.html')} target="_blank" rel="noreferrer">
          Privacy policy
        </a>
        <p>Independent tool. Not affiliated with LinkedIn. {chrome.runtime.getManifest && `v${chrome.runtime.getManifest().version}`}</p>
      </footer>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

export default App
