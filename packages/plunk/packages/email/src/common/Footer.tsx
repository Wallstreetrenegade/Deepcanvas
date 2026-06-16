import {Link, Section, Text} from '@react-email/components';
import * as React from 'react';

interface FooterProps {
  projectId?: string;
  landingUrl?: string;
}

export function Footer({projectId, landingUrl = 'https://www.useplunk.com'}: FooterProps) {
  return (
    <Section className="border-t border-gray-100 bg-gray-50 px-8 py-8">
      <Text className="mb-4 mt-0 text-center text-xs leading-relaxed text-gray-600">
        This email was sent by Plunk. .
      </Text>
      {projectId && (
        <Text className="mb-4 mt-0 text-center text-xs leading-relaxed text-gray-400">
          Project ID: <span className="font-mono">{projectId}</span>
        </Text>
      )}
      <Text className="mb-0 mt-0 text-center text-xs leading-relaxed text-gray-500">
        <Link href={landingUrl} className="text-gray-500 no-underline hover:text-gray-700">
          Plunk
        </Link>
        {' • '}
        <Link href={`${landingUrl}/privacy`} className="text-gray-500 no-underline hover:text-gray-700">
          Privacy
        </Link>
        {' • '}
        <Link href={`${landingUrl}/terms`} className="text-gray-500 no-underline hover:text-gray-700">
          Terms
        </Link>
      </Text>
    </Section>
  );
}
