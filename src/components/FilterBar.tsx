export function FilterBar<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T
  onChange: (value: T) => void
  /** `count` shows as a small badge after the label, e.g. "All 22". */
  options: { value: T; label: string; count?: number }[]
  className?: string
}) {
  return (
    <div className={`filter-bar${className ? ` ${className}` : ''}`} role="tablist">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          className={`filter-chip${value === option.value ? ' active' : ''}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
          {option.count !== undefined ? <span className="filter-chip-count">{option.count}</span> : null}
        </button>
      ))}
    </div>
  )
}
