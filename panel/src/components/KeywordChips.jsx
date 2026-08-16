export default function KeywordChips({ items, variant, emptyLabel, onChipClick }) {
  if (items.length === 0) {
    return <p className="chips-empty">{emptyLabel}</p>
  }

  return (
    <div className="chips">
      {items.map((item) => (
        <button
          key={item}
          type="button"
          className={`chip chip-${variant}`}
          onClick={() => onChipClick?.(item)}
        >
          {item}
        </button>
      ))}
    </div>
  )
}
