import { useEffect, useMemo, useState } from 'react'
import ResumeStatus from './components/ResumeStatus'
import JobHeader from './components/JobHeader'
import MatchResults from './components/MatchResults'
import JobFields from './components/JobFields'
import { extractTextFromPdf } from './lib/extractText'
import { matchKeywords } from './lib/keywordMatch'
import { analyzeJobFields } from './lib/jobFields'
import { getResume, setResume as saveResume, clearResume } from './lib/storage'
import './App.css'

const LINKEDIN_JOB_URL = /^https:\/\/www\.linkedin\.com\/jobs\//

function App() {
  const [resume, setResumeState] = useState(null)
  const [isExtracting, setIsExtracting] = useState(false)
  const [resumeError, setResumeError] = useState(null)

  const [isLinkedInJobPage, setIsLinkedInJobPage] = useState(false)
  const [jobData, setJobData] = useState(null)
  const [toast, setToast] = useState(null)

  useEffect(() => {
    getResume().then(setResumeState)
  }, [])

  useEffect(() => {
    async function syncActiveTab() {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      })
      if (!tab?.url || !LINKEDIN_JOB_URL.test(tab.url)) {
        setIsLinkedInJobPage(false)
        setJobData(null)
        return
      }
      setIsLinkedInJobPage(true)
      try {
        const response = await chrome.tabs.sendMessage(tab.id, {
          type: 'REQUEST_JOB_DATA',
        })
        if (response) setJobData(response)
      } catch {
        // Content script may not be injected yet; it will push JOB_DATA
        // once ready.
      }
    }

    function handleMessage(message) {
      if (message?.type === 'JOB_DATA') {
        setJobData(message)
        setIsLinkedInJobPage(true)
      }
    }

    syncActiveTab()
    chrome.tabs.onActivated.addListener(syncActiveTab)
    chrome.tabs.onUpdated.addListener(syncActiveTab)
    chrome.runtime.onMessage.addListener(handleMessage)

    return () => {
      chrome.tabs.onActivated.removeListener(syncActiveTab)
      chrome.tabs.onUpdated.removeListener(syncActiveTab)
      chrome.runtime.onMessage.removeListener(handleMessage)
    }
  }, [])

  async function handleFileSelected(file) {
    if (!file) return
    setResumeError(null)
    setIsExtracting(true)
    try {
      const text = await extractTextFromPdf(file)
      const next = { fileName: file.name, text }
      await saveResume(next)
      setResumeState(next)
    } catch {
      setResumeError('Could not read that PDF. Try a different file.')
    } finally {
      setIsExtracting(false)
    }
  }

  async function handleClearResume() {
    await clearResume()
    setResumeState(null)
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

  const results = useMemo(() => {
    if (!resume?.text || !jobData?.descriptionText) return null
    return matchKeywords(jobData.descriptionText, resume.text)
  }, [resume, jobData])

  const fields = useMemo(() => {
    if (!jobData?.descriptionText) return null
    return analyzeJobFields(jobData.descriptionText)
  }, [jobData])

  return (
    <div className="app">
      <header>
        <h1>Job Scanner</h1>
      </header>

      <ResumeStatus
        resume={resume}
        isExtracting={isExtracting}
        error={resumeError}
        onFileSelected={handleFileSelected}
        onClear={handleClearResume}
      />

      <JobHeader isLinkedInJobPage={isLinkedInJobPage} jobData={jobData} />

      {isLinkedInJobPage && jobData?.descriptionText && !resume && (
        <div className="panel-section placeholder">
          <p>Upload your resume above to see keyword matches.</p>
        </div>
      )}

      <MatchResults results={results} onKeywordClick={handleLocate} />
      <JobFields fields={fields} onLocate={handleLocate} />

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

export default App
