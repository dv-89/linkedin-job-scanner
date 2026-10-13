export default function ReorderableSection({ id, title, index, count, disabled, onMove, children }) {
  return (
    <section className="reorderable-section" aria-labelledby={`section-${id}`}>
      <div className="section-toolbar">
        <h2 id={`section-${id}`}>{title}</h2>
        <div className="section-move-controls">
          <button type="button" disabled={disabled || index === 0}
            aria-label={`Move ${title} up`} title={`Move ${title} up`}
            onClick={() => onMove(id, -1)}>↑</button>
          <button type="button" disabled={disabled || index === count - 1}
            aria-label={`Move ${title} down`} title={`Move ${title} down`}
            onClick={() => onMove(id, 1)}>↓</button>
        </div>
      </div>
      {children}
    </section>
  )
}
