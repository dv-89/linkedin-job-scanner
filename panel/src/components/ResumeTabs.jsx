import { useRef } from 'react'

export default function ResumeTabs({ resumes, results, activeIndex, onSelect }) {
  const buttons = useRef([])
  const scores = results.map((result) => result?.score).filter((score) => typeof score === 'number')
  const highest = scores.length ? Math.max(...scores) : null

  function handleKeyDown(event, index) {
    let next
    if (event.key === 'ArrowRight') next = (index + 1) % resumes.length
    if (event.key === 'ArrowLeft') next = (index + resumes.length - 1) % resumes.length
    if (event.key === 'Home') next = 0
    if (event.key === 'End') next = resumes.length - 1
    if (next === undefined) return
    event.preventDefault()
    onSelect(next)
    buttons.current[next]?.focus()
  }

  return (
    <div className="resume-tabs" role="tablist" aria-label="Resumes">
      {resumes.map((resume, index) => {
        const score = results[index]?.score
        const isBest = highest !== null && score === highest
        return (
          <button
            key={index}
            ref={(element) => { buttons.current[index] = element }}
            type="button"
            role="tab"
            id={`resume-tab-${index}`}
            aria-controls="resume-panel"
            aria-selected={activeIndex === index}
            tabIndex={activeIndex === index ? 0 : -1}
            className={`resume-tab${activeIndex === index ? ' active' : ''}${isBest ? ' best-match' : ''}`}
            title={resume?.fileName || `Upload a PDF to Resume ${index + 1}`}
            onClick={() => onSelect(index)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            <span className="tab-label">Resume {index + 1}</span>
            <span className="tab-filename">{resume?.fileName || 'No PDF yet'}</span>
            <span className="tab-score">{typeof score === 'number' ? `${score}% match` : '— match'}</span>
            {isBest && <span className="best-label">Best match</span>}
          </button>
        )
      })}
    </div>
  )
}
