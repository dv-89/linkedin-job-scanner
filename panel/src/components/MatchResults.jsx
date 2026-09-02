import { useState } from 'react'
import KeywordChips from './KeywordChips'

export default function MatchResults({ results, onKeywordClick }) {
  const [copied, setCopied] = useState(false)

  if (!results) return null

  const { matched, missing, otherTerms, score } = results

  async function handleCopyMissing() {
    try {
      await navigator.clipboard.writeText(missing.map((s) => s.term).join(', '))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard permission denied - button just won't confirm.
    }
  }

  return (
    <div className="panel-section">
      {score !== null && (
        <div className="score">
          <div className="score-bar">
            <div className="score-bar-fill" style={{ width: `${score}%` }} />
          </div>
          <p>
            <strong>{score}%</strong> skill match
          </p>
        </div>
      )}

      <div className="section-heading">
        <h3>Missing ({missing.length})</h3>
        {missing.length > 0 && (
          <button type="button" className="link-btn" onClick={handleCopyMissing}>
            {copied ? 'Copied!' : 'Copy'}
          </button>
        )}
      </div>
      <KeywordChips
        items={missing.map((s) => s.term)}
        variant="missing"
        emptyLabel="No gaps found."
        onChipClick={onKeywordClick}
      />

      <h3>Matched ({matched.length})</h3>
      <KeywordChips
        items={matched.map((s) => s.term)}
        variant="matched"
        emptyLabel="No dictionary matches yet."
        onChipClick={onKeywordClick}
      />

      {otherTerms.length > 0 && (
        <>
          <h3>Other terms in JD</h3>
          <KeywordChips
            items={otherTerms}
            variant="other"
            emptyLabel=""
            onChipClick={onKeywordClick}
          />
        </>
      )}
    </div>
  )
}
