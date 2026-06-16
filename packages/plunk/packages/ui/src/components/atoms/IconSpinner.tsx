import {cn} from '../../lib';

export interface IconSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeConfig = {
  sm: 'w-4 h-4 border-[1.5px]',
  md: 'w-5 h-5 border-[1.5px]',
  lg: 'w-7 h-7 border-2',
};

export function IconSpinner({size = 'md', className}: IconSpinnerProps) {
  return (
    <div
      className={cn(
        'rounded-full border-neutral-200 border-t-neutral-800 animate-spin flex-shrink-0',
        sizeConfig[size],
        className,
      )}
      style={{animationDuration: '0.65s'}}
    />
  );
}
