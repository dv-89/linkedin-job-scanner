export default function JobHeader({ isLinkedInJobPage, jobData }) {
  if (!isLinkedInJobPage) {
    return (
      <div className="panel-section placeholder">
        <p>Open a LinkedIn job posting to see analysis.</p>
      </div>
    )
  }

  if (!jobData) {
    return (
      <div className="panel-section placeholder">
        <p>Reading job posting…</p>
      </div>
    )
  }

  return (
    <div className="panel-section job-header">
      <h2>{jobData.title || 'Job posting'}</h2>
      {jobData.company && <p className="company">{jobData.company}</p>}
      {jobData.location && <p className="location">{jobData.location}</p>}
      {!jobData.descriptionText && <p className="hint">Waiting for the job description to load…</p>}
    </div>
  )
}
