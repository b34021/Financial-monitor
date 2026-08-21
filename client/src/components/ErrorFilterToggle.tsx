/**
 * "Show only errors" toggle for the live feed. Filters the list down to
 * Failed transactions only — controlled by the parent via `checked`/`onToggle`.
 */
interface ErrorFilterToggleProps {
  checked: boolean;
  onToggle: () => void;
}

export function ErrorFilterToggle({ checked, onToggle }: ErrorFilterToggleProps) {
  return (
    <label className="filter">
      <input type="checkbox" checked={checked} onChange={onToggle} />
      <span>Show only errors</span>
    </label>
  );
}
