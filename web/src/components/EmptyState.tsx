import type { ReactNode } from 'react';
import styles from './EmptyState.module.css';

interface Props {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  tone?: 'default' | 'success';
}

/** Centered empty-state: icon + title + optional description and action. */
export function EmptyState({ icon, title, description, action, tone = 'default' }: Props) {
  return (
    <div className={styles.empty}>
      {icon && (
        <div className={`${styles.icon} ${tone === 'success' ? styles.iconSuccess : ''}`}>{icon}</div>
      )}
      <p className={styles.title}>{title}</p>
      {description && <p className={styles.description}>{description}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
