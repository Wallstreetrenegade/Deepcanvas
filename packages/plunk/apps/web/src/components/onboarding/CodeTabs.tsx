import {Tabs, TabsContent, TabsList, TabsTrigger} from '@plunk/ui';
import {AnimatePresence, motion} from 'framer-motion';
import {Check, Copy} from 'lucide-react';
import {useState} from 'react';

export interface CodeSnippet {
  id: string;
  label: string;
  code: string;
}

interface CodeTabsProps {
  snippets: CodeSnippet[];
  defaultTab?: string;
}

export function CodeTabs({snippets, defaultTab}: CodeTabsProps) {
  const [active, setActive] = useState(defaultTab ?? snippets[0]?.id ?? '');
  const [copied, setCopied] = useState(false);

  const activeSnippet = snippets.find(s => s.id === active) ?? snippets[0];

  const handleCopy = async () => {
    if (!activeSnippet) return;
    try {
      await navigator.clipboard.writeText(activeSnippet.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard unavailable — silent
    }
  };

  return (
    <Tabs value={active} onValueChange={setActive} className="w-full">
      <div className="flex items-center justify-between gap-2 border-b border-neutral-200 px-3 py-2">
        <TabsList className="bg-transparent p-0 h-auto gap-1">
          {snippets.map(s => (
            <TabsTrigger
              key={s.id}
              value={s.id}
              className="rounded-md px-2.5 py-1 text-xs font-medium text-neutral-500 data-[state=active]:bg-neutral-100 data-[state=active]:text-neutral-900 data-[state=active]:shadow-none"
            >
              {s.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="relative flex h-7 items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2 text-xs font-medium text-neutral-600 hover:text-neutral-900 hover:border-neutral-300 transition-colors overflow-hidden"
          aria-label={`Copy ${activeSnippet?.label ?? ''} snippet`}
        >
          <AnimatePresence mode="wait" initial={false}>
            {copied ? (
              <motion.span
                key="copied"
                initial={{opacity: 0, y: 6}}
                animate={{opacity: 1, y: 0}}
                exit={{opacity: 0, y: -6}}
                transition={{duration: 0.15}}
                className="flex items-center gap-1.5"
              >
                <Check className="h-3.5 w-3.5 text-green-600" />
                <span className="text-green-600">Copied</span>
              </motion.span>
            ) : (
              <motion.span
                key="idle"
                initial={{opacity: 0, y: 6}}
                animate={{opacity: 1, y: 0}}
                exit={{opacity: 0, y: -6}}
                transition={{duration: 0.15}}
                className="flex items-center gap-1.5"
              >
                <Copy className="h-3.5 w-3.5" />
                <span>Copy</span>
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>

      {snippets.map(s => (
        <TabsContent key={s.id} value={s.id} className="mt-0">
          <pre className="m-0 overflow-x-auto bg-neutral-50 px-4 py-4 text-xs leading-relaxed text-neutral-900 font-mono">
            <code>{s.code}</code>
          </pre>
        </TabsContent>
      ))}
    </Tabs>
  );
}
