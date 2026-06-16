import {Loader2} from 'lucide-react';

import {cn} from '../../lib';

export interface LoadingStateProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeMap = {
  sm: 'h-4 w-4',
  md: 'h-8 w-8',
  lg: 'h-12 w-12',
};

export function LoadingState({message = 'Loading...', size = 'md', className}: LoadingStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-12', className)}>
      <Loader2 className={cn('animate-spin text-neutral-400', sizeMap[size])} />
      {message && <p className="mt-4 text-sm text-neutral-500">{message}</p>}
    </div>
  );
}
