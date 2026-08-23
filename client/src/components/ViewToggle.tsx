export type ViewMode = 'cards' | 'table';

interface ViewToggleProps {
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
}

/**
 * Two-state view switcher for the live monitor. Toggles between the existing
 * card-based feed ("Cards") and the new professional grid ("Table"). The active
 * view is visually highlighted; clicking the inactive label switches to it.
 * Keyboard accessible — the buttons are focusable and activate on Enter/Space.
 */
export function ViewToggle({ view, onViewChange }: ViewToggleProps) {
  return (
    <div className="view-toggle" role="radiogroup" aria-label="Feed view">
      <button
        className={`view-toggle__btn${view === 'cards' ? ' view-toggle__btn--active' : ''}`}
        role="radio"
        aria-checked={view === 'cards'}
        onClick={() => onViewChange('cards')}
      >
        <span className="view-toggle__icon" aria-hidden="true">▦</span>
        Cards
      </button>
      <button
        className={`view-toggle__btn${view === 'table' ? ' view-toggle__btn--active' : ''}`}
        role="radio"
        aria-checked={view === 'table'}
        onClick={() => onViewChange('table')}
      >
        <span className="view-toggle__icon" aria-hidden="true">⊞</span>
        Table
      </button>
    </div>
  );
}
