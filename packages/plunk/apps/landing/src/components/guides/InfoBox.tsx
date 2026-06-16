import React, {ReactNode} from 'react';
import {AlertTriangle, CheckCircle2, Info, Lightbulb} from 'lucide-react';

type InfoBoxType = 'info' | 'warning' | 'tip' | 'success';

interface InfoBoxProps {
  type?: InfoBoxType;
  title?: string;
  children: ReactNode;
  className?: string;
}

const infoBoxConfig: Record<
  InfoBoxType,
  {
    icon: React.ComponentType<{className?: string}>;
    borderColor: string;
    bgColor: string;
    iconColor: string;
    titleColor: string;
  }
> = {
  info: {
    icon: Info,
    borderColor: 'border-blue-200',
    bgColor: 'bg-blue-50',
    iconColor: 'text-blue-600',
    titleColor: 'text-blue-900',
  },
  warning: {
    icon: AlertTriangle,
    borderColor: 'border-amber-200',
    bgColor: 'bg-amber-50',
    iconColor: 'text-amber-600',
    titleColor: 'text-amber-900',
  },
  tip: {
    icon: Lightbulb,
    borderColor: 'border-purple-200',
    bgColor: 'bg-purple-50',
    iconColor: 'text-purple-600',
    titleColor: 'text-purple-900',
  },
  success: {
    icon: CheckCircle2,
    borderColor: 'border-green-200',
    bgColor: 'bg-green-50',
    iconColor: 'text-green-600',
    titleColor: 'text-green-900',
  },
};

/**
 * InfoBox component for displaying tips, warnings, notes, and other callouts in guides
 */
export function InfoBox({type = 'info', title, children, className}: InfoBoxProps) {
  const config = infoBoxConfig[type];
  const Icon = config.icon;

  const defaultTitles: Record<InfoBoxType, string> = {
    info: 'Note',
    warning: 'Warning',
    tip: 'Tip',
    success: 'Success',
  };

  return (
    <div className={`rounded-xl border ${config.borderColor} ${config.bgColor} p-6 my-6 ${className || ''}`}>
      <div className={'flex gap-4'}>
        <div className={'shrink-0'}>
          <Icon className={`h-5 w-5 ${config.iconColor}`} />
        </div>
        <div>
          {(title || defaultTitles[type]) && (
            <h4 className={`not-prose font-semibold ${config.titleColor}`}>{title || defaultTitles[type]}</h4>
          )}
          <div className={'text-sm text-neutral-700 leading-relaxed mt-0 prose prose-sm max-w-none'}>{children}</div>
        </div>
      </div>
    </div>
  );
}
