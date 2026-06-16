import {CardDescription, CardTitle} from '@plunk/ui';

interface StepHeaderProps {
  stepNumber: number;
  title: string;
  description: string;
}

/**
 * Reusable step header component with numbered circle
 * Used in multi-step forms like campaign creation
 */
export function StepHeader({stepNumber, title, description}: StepHeaderProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-semibold">
        {stepNumber}
      </div>
      <div>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </div>
    </div>
  );
}
