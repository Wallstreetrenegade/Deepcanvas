import {AnimatePresence, motion} from 'framer-motion';
import {ArrowRight, Check, Code2, FileText, Mail, ShieldCheck, Users, Workflow, X, Zap} from 'lucide-react';
import {useRouter} from 'next/router';
import {useEffect, useMemo} from 'react';
import {useSWRConfig} from 'swr';

import {useActiveProject} from '../../lib/contexts/ActiveProjectProvider';
import {useOnboardingComplete} from '../../lib/hooks/useOnboardingComplete';
import {type OnboardingPath, useOnboardingPath} from '../../lib/hooks/useOnboardingPath';
import {useOnboardingStatus} from '../../lib/hooks/useOnboardingStatus';
import {useProjectSetupState} from '../../lib/hooks/useProjectSetupState';

// Keys the banner derives state from. Revalidated on every route change so
// progress reflects the latest state as soon as the user moves between pages.
const LIVE_KEY_FRAGMENTS = ['/setup-state', '/activity/stats', '/contacts?limit=1', '/campaigns?page=1&limit=1'];
const BANNER_POLL_MS = 5_000;

interface BannerStep {
  id: string;
  icon: React.ElementType;
  title: string;
  href: string;
  done: boolean;
}

function buildMarketingSteps(setupState: ReturnType<typeof useProjectSetupState>['setupState']): BannerStep[] {
  if (!setupState) return [];
  return [
    {
      id: 'domain',
      icon: ShieldCheck,
      title: 'Verify your domain',
      href: '/settings?tab=domains',
      done: setupState.hasVerifiedDomain,
    },
    {
      id: 'contacts',
      icon: Users,
      title: 'Add contacts',
      href: '/contacts',
      done: setupState.contactCount > 0,
    },
    {
      id: 'campaign',
      icon: Mail,
      title: 'Draft your first campaign',
      href: '/campaigns/create',
      done: setupState.lastCampaignSentAt !== null,
    },
  ];
}

function buildDeveloperSteps(setupState: ReturnType<typeof useProjectSetupState>['setupState']): BannerStep[] {
  if (!setupState) return [];
  return [
    {
      id: 'domain',
      icon: ShieldCheck,
      title: 'Verify your domain',
      href: '/settings?tab=domains',
      done: setupState.hasVerifiedDomain,
    },
    {
      id: 'snippets',
      icon: Code2,
      title: 'Send your first email',
      href: '/onboarding/developer',
      done: false,
    },
  ];
}

function buildWorkflowSteps(setupState: ReturnType<typeof useProjectSetupState>['setupState']): BannerStep[] {
  if (!setupState) return [];
  return [
    {
      id: 'domain',
      icon: ShieldCheck,
      title: 'Verify your domain',
      href: '/settings?tab=domains',
      done: setupState.hasVerifiedDomain,
    },
    {
      id: 'event',
      icon: Zap,
      title: 'Fire your first event',
      href: '/onboarding/workflows',
      done: false,
    },
    {
      id: 'template',
      icon: FileText,
      title: 'Create a template',
      href: '/templates/create',
      done: false,
    },
    {
      id: 'workflow',
      icon: Workflow,
      title: 'Build a workflow',
      href: '/workflows',
      done: setupState.hasEnabledWorkflow,
    },
  ];
}

function stepsForPath(
  path: OnboardingPath,
  setupState: ReturnType<typeof useProjectSetupState>['setupState'],
): BannerStep[] {
  if (path === 'developer') return buildDeveloperSteps(setupState);
  if (path === 'workflows') return buildWorkflowSteps(setupState);
  return buildMarketingSteps(setupState);
}

export function OnboardingBanner() {
  const router = useRouter();
  const {activeProject} = useActiveProject();
  const status = useOnboardingStatus();
  const {path, clearPath} = useOnboardingPath(activeProject?.id);
  const {markComplete} = useOnboardingComplete(activeProject?.id);

  const onOnboardingRoute = router.pathname.startsWith('/onboarding');
  const bannerCandidate = !onOnboardingRoute && status === 'show' && Boolean(path);

  const {setupState} = useProjectSetupState(activeProject?.id);

  const {mutate} = useSWRConfig();
  useEffect(() => {
    if (!bannerCandidate) return;

    const revalidate = () => {
      void mutate(
        key => typeof key === 'string' && LIVE_KEY_FRAGMENTS.some(fragment => key.includes(fragment)),
      );
    };

    const interval = window.setInterval(revalidate, BANNER_POLL_MS);
    router.events.on('routeChangeComplete', revalidate);

    return () => {
      window.clearInterval(interval);
      router.events.off('routeChangeComplete', revalidate);
    };
  }, [bannerCandidate, mutate, router.events]);

  const steps = useMemo<BannerStep[]>(() => {
    if (!path) return [];
    return stepsForPath(path, setupState);
  }, [path, setupState]);

  const visible = bannerCandidate && steps.length > 0;

  const doneCount = steps.filter(s => s.done).length;
  const currentStepId = steps.find(s => !s.done)?.id;

  const handleDismiss = () => {
    markComplete();
    clearPath();
  };

  const handleStepClick = (href: string) => {
    void router.push(href);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{opacity: 0, y: -6}}
          animate={{opacity: 1, y: 0}}
          exit={{opacity: 0, y: -6}}
          transition={{duration: 0.25, ease: [0.22, 1, 0.36, 1]}}
          className="mb-6 rounded-xl border border-neutral-200 bg-white shadow-sm"
        >
          <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:p-5">
            <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-start sm:justify-center">
              <div className="flex flex-col gap-0.5">
                <p className="text-sm font-semibold text-neutral-900">Finish your setup</p>
                <p className="text-xs text-neutral-500 tabular-nums">
                  {doneCount} of {steps.length} {doneCount === 1 ? 'step' : 'steps'} done
                </p>
              </div>
              <button
                type="button"
                onClick={handleDismiss}
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 transition-colors sm:hidden"
                aria-label="Dismiss setup guide"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-1 flex-wrap items-center gap-2 sm:justify-center lg:justify-end">
              {steps.map((step, index) => {
                const Icon = step.icon;
                const isCurrent = step.id === currentStepId;
                const base =
                  'group relative inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';
                const variant = step.done
                  ? 'border-green-200 bg-green-50 text-green-900 hover:border-green-300'
                  : isCurrent
                    ? 'border-neutral-900 bg-neutral-900 text-white hover:bg-neutral-800'
                    : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 hover:text-neutral-900';
                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => handleStepClick(step.href)}
                    className={`${base} ${variant}`}
                  >
                    <span
                      className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums ${
                        step.done
                          ? 'bg-green-600 text-white'
                          : isCurrent
                            ? 'bg-white text-neutral-900'
                            : 'bg-neutral-100 text-neutral-500'
                      }`}
                    >
                      {step.done ? <Check className="h-2.5 w-2.5" /> : index + 1}
                    </span>
                    <Icon className="h-3.5 w-3.5 opacity-80" />
                    <span>{step.title}</span>
                    {isCurrent && (
                      <ArrowRight className="h-3 w-3 opacity-80 transition-transform group-hover:translate-x-0.5" />
                    )}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={handleDismiss}
              className="hidden h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 transition-colors sm:flex"
              aria-label="Dismiss setup guide"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
