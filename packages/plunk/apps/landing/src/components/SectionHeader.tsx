import {motion} from 'framer-motion';
import React from 'react';

export function SectionHeader({
  number,
  label,
  title,
  titleAccent,
  subtitle,
}: {
  number: string;
  label: string;
  title: string;
  titleAccent?: string;
  subtitle?: string;
}) {
  return (
    <motion.div
      initial={{opacity: 0, y: 16}}
      whileInView={{opacity: 1, y: 0}}
      viewport={{once: true, margin: '-10%'}}
      transition={{duration: 0.7, ease: [0.22, 1, 0.36, 1]}}
      className={'grid gap-8 lg:grid-cols-12 lg:gap-16'}
    >
      <div
        style={{fontFamily: 'var(--font-mono)'}}
        className={
          'flex items-center gap-4 border-t border-neutral-900 pt-4 text-[11px] uppercase tracking-[0.2em] text-neutral-700 lg:col-span-3 lg:self-start'
        }
      >
        <span className={'font-medium text-neutral-900'}>§ {number}</span>
        <span className={'text-neutral-500'}>{label}</span>
      </div>
      <div className={'lg:col-span-9'}>
        <h2
          style={{fontFamily: 'var(--font-display)'}}
          className={
            'text-[clamp(2.25rem,5.5vw,4.5rem)] font-extrabold leading-[0.95] tracking-[-0.03em] text-neutral-900'
          }
        >
          {title}
          {titleAccent && <> {titleAccent}</>}
        </h2>
        {subtitle && <p className={'mt-6 max-w-2xl text-lg leading-relaxed text-neutral-600'}>{subtitle}</p>}
      </div>
    </motion.div>
  );
}
