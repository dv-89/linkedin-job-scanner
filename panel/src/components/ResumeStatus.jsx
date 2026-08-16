export default function ResumeStatus({
  resume,
  isExtracting,
  error,
  onFileSelected,
  onClear,
}) {
  return (
    <div className="resume-status">
      {resume ? (
        <div className="resume-row">
          <span className="resume-name" title={resume.fileName}>
            📄 {resume.fileName}
          </span>
          <button type="button" className="link-btn" onClick={onClear}>
            Change
          </button>
        </div>
      ) : (
        <label className="file-input">
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => onFileSelected(e.target.files?.[0] ?? null)}
          />
          <span>Upload your resume (PDF)</span>
        </label>
      )}
      {isExtracting && <p className="hint">Reading resume…</p>}
      {error && <p className="error">{error}</p>}
    </div>
  )
}
