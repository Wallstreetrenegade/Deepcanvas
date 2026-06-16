import {Button} from '@plunk/ui';
import {motion} from 'framer-motion';
import {ArrowLeft, ArrowRight, Mail, ShieldCheck, Users} from 'lucide-react';
import {NextSeo} from 'next-seo';
import Link from 'next/link';
import {useRouter} from 'next/router';
import {useEffect} from 'react';

import {OnboardingLayout} from '../../components/onboarding/OnboardingLayout';
import {useActiveProject} from '../../lib/contexts/ActiveProjectProvider';
import {useOnboardingGate} from '../../lib/hooks/useOnboardingGate';
import {useOnboardingPath} from '../../lib/hooks/useOnboardingPath';

interface SetupStep {
  id: string;
  icon: React.ElementType;
  title: string;
  description: string;
  href: string;
  cta: string;
  required?: boolean;
}

const steps: SetupStep[] = [
  {
    id: 'domain',
    icon: ShieldCheck,
    title: 'Verify your sender domain',
    description: 'Two DNS records prove you own the address your campaigns send from.',
    href: '/settings?tab=domains',
    cta: 'Verify domain',
    required: true,
  },
  {
    id: 'contacts',
    icon: Users,
    title: 'Add your contacts',
    description: 'Import a CSV, paste a list, or sync contacts from your app.',
    href: '/contacts',
    cta: 'Add contacts',
  },
  {
    id: 'campaign',
    icon: Mail,
    title: 'Draft your first campaign',
    description: 'Compose in the editor, preview, and schedule — or send when you are ready.',
    href: '/campaigns/create',
    cta: 'Draft campaign',
  },
];

export default function OnboardingMarketing() {
  const router = useRouter();
  const {state} = useOnboardingGate();
  const {activeProject} = useActiveProject();
  const {path, setPath} = useOnboardingPath(activeProject?.id);

  // Record the marketing path so the persistent banner guides the user after
  // they click into a step. Only set if unset — don't overwrite a developer
  // choice if the user navigated here manually.
  useEffect(() => {
    if (activeProject && !path) setPath('marketing');
  }, [activeProject, path, setPath]);

  if (state !== 'show') return null;

  const handleContinue = () => {
    void router.push('/');
  };

  const handleStepClick = (href: string) => {
    void router.push(href);
  };

  return (
    <>
      <NextSeo title="Set up your campaigns" />
      <OnboardingLayout step={2}>
        <div className="flex flex-col gap-6">
          <header className="flex flex-col gap-2">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-neutral-900">
              Set up for campaigns.
            </h1>
            <p className="text-base text-neutral-600 max-w-xl leading-relaxed">
              Three steps to your first broadcast. Start anywhere — you can come back to finish the rest.
            </p>
          </header>

          <div className="flex flex-col gap-3">
            {steps.map((step, index) => {
              const Icon = step.icon;
              return (
                <motion.div
                  key={step.id}
                  initial={{opacity: 0, y: 6}}
                  animate={{opacity: 1, y: 0}}
                  transition={{duration: 0.3, delay: 0.05 + index * 0.06, ease: [0.22, 1, 0.36, 1]}}
                  className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-neutral-50 text-xs font-semibold tabular-nums text-neutral-900">
                        {index + 1}
                      </span>
                      <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-neutral-50 text-neutral-900">
                        <Icon className="h-5 w-5" />
                      </span>
                    </div>
                    <div className="flex flex-col gap-1 pt-0.5">
                      <div className="flex items-center gap-2">
                        <h2 className="text-sm font-semibold text-neutral-900">{step.title}</h2>
                        {step.required && (
                          <span className="rounded bg-neutral-900 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white">
                            Required
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-neutral-600 leading-relaxed">{step.description}</p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="sm:self-center sm:flex-shrink-0"
                    onClick={() => handleStepClick(step.href)}
                  >
                    {step.cta}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </motion.div>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-2">
            <Link
              href="/onboarding"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-500 hover:text-neutral-900 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
            <Button onClick={handleContinue}>
              Continue to dashboard
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </OnboardingLayout>
    </>
  );
}
