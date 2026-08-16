export default function JobHeader({ isLinkedInJobPage, jobData }) {
  if (!isLinkedInJobPage) {
    return (
      <div className="panel-section placeholder">
        <p>Open a LinkedIn job posting to see analysis.</p>
      </div>
    )
  }

  if (!jobData || !jobData.descriptionText) {
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
    </div>
  )
}
