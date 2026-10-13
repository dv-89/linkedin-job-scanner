import { useState } from 'react'

function FieldRow({ label, status, evidence, searchTerm, onLocate }) {
  const [expanded, setExpanded] = useState(false)
  const clickable = Boolean(searchTerm)

  return (
    <div className="field-row">
      <div className="field-row-main">
        <span className="field-label">{label}</span>
        {clickable ? (
          <button
            type="button"
            className="field-status field-status-clickable"
            title="Jump to this in the job posting"
            onClick={() => onLocate(searchTerm)}
          >
            {status}
          </button>
        ) : (
          <span className="field-status">{status}</span>
        )}
      </div>
      {evidence && (
        <button
          type="button"
          className="link-btn evidence-toggle"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'Hide evidence' : 'Show evidence'}
        </button>
      )}
      {expanded && evidence && <p className="evidence-text">{evidence}</p>}
    </div>
  )
}

export default function JobFields({ fields, onLocate }) {
  if (!fields) return null

  const { clearance, sponsorship, expectedYOE, preferred } = fields

  return (
    <div className="panel-section">
      <FieldRow
        label="Clearance"
        status={clearance.status}
        evidence={clearance.evidence}
        searchTerm={clearance.searchTerm}
        onLocate={onLocate}
      />
      <FieldRow
        label="Sponsorship"
        status={sponsorship.status}
        evidence={sponsorship.evidence}
        searchTerm={sponsorship.searchTerm}
        onLocate={onLocate}
      />
      <FieldRow
        label="Expected YOE"
        status={expectedYOE.status}
        evidence={expectedYOE.evidence}
        searchTerm={expectedYOE.searchTerm}
        onLocate={onLocate}
      />
      <FieldRow
        label="Preferred candidates"
        status={preferred.status}
        evidence={preferred.evidence}
        searchTerm={preferred.searchTerm}
        onLocate={onLocate}
      />
      {preferred.citizenshipNotes.length > 0 && (
        <div className="citizenship-notes">
          {preferred.citizenshipNotes.map((note) => (
            <p key={note} className="evidence-text">
              {note}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
