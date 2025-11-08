import { ReactNode } from 'react';

interface StatusBadgeProps {
  tone?: 'pending' | 'progress' | 'done' | 'alert';
  children: ReactNode;
}

export function StatusBadge({ tone = 'progress', children }: StatusBadgeProps) {
  const className = `status-badge badge-${tone}`;
  return <span className={className}>{children}</span>;
}

