import type {LucideIcon} from 'lucide-react';
import type {ReactNode} from 'react';

import {cn} from '../../lib';

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({icon: Icon, title, description, action, className}: EmptyStateProps) {
  return (
    <div className={cn('text-center py-14', className)}>
      <div className="inline-flex items-center justify-center w-10 h-10 rounded-md border border-neutral-200 bg-neutral-50 mb-4">
        <Icon className="h-5 w-5 text-neutral-400" />
      </div>
      <h3 className="text-sm font-semibold text-neutral-900 mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-neutral-500 max-w-xs mx-auto leading-relaxed mb-5">{description}</p>
      )}
      {action}
    </div>
  );
}
