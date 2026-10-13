export default function ResumeStatus({
  resume,
  isExtracting,
  error,
  onFileSelected,
  onClear,
  disabled = false,
}) {
  return (
    <div className="resume-status">
      {resume ? (
        <div className="resume-row">
          <span className="resume-name" title={resume.fileName}>
            📄 {resume.fileName}
          </span>
          <button type="button" className="link-btn" onClick={onClear} disabled={disabled || isExtracting}>
            Change
          </button>
        </div>
      ) : (
        <label className="file-input">
          <input
            type="file"
            accept="application/pdf"
            disabled={disabled || isExtracting}
            onChange={(e) => {
              onFileSelected(e.target.files?.[0] ?? null)
              e.target.value = ''
            }}
          />
          <span>Upload your resume (PDF)</span>
        </label>
      )}
      <p className="hint">
        Resume text stays in this browser and is never uploaded.
        {resume ? ' Change removes the saved text.' : ' Upload a PDF to save it locally for matching.'}
      </p>
      {isExtracting && <p className="hint">Reading resume…</p>}
      {error && <p className="error">{error}</p>}
    </div>
  )
}
