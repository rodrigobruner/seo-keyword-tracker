import styles from './SegmentedControl.module.css';

export interface Segment<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  value: T;
  segments: Segment<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
}

/** Small two-or-more-way toggle (e.g. Chart ↔ Table). */
export function SegmentedControl<T extends string>({ value, segments, onChange, ariaLabel }: Props<T>) {
  return (
    <div className={styles.group} role="tablist" aria-label={ariaLabel}>
      {segments.map((s) => (
        <button
          key={s.value}
          role="tab"
          aria-selected={s.value === value}
          className={s.value === value ? `${styles.segment} ${styles.active}` : styles.segment}
          onClick={() => onChange(s.value)}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
