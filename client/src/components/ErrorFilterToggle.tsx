/**
 * Two-state feed filter for the live monitor. In the normal ("all") state it
 * reads "Show only errors" and offers a faithful checkbox; once the error
 * filter is active the label flips to "Show all" so the user has an obvious,
 * single-click path back to the full feed.
 */
interface ErrorFilterToggleProps {
  /** True when the "failed only" filter is active. */
  filtered: boolean;
  onToggle: () => void;
}

export function ErrorFilterToggle({ filtered, onToggle }: ErrorFilterToggleProps) {
  return (
    <label className="filter filter--toggle" title="Toggle failed-only filter">
      <input
        className="filter__checkbox"
        type="checkbox"
        checked={filtered}
        onChange={onToggle}
        aria-label={filtered ? 'Show all transactions' : 'Show only errors'}
      />
      <span className="filter__switch" aria-hidden="true">
        <span className="filter__knob" />
      </span>
      <span className="filter__label">{filtered ? 'Show all' : 'Show only errors'}</span>
    </label>
  );
}
