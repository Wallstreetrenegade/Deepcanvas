import {Body, Container, Head, Html, Tailwind} from '@react-email/components';
import * as React from 'react';

interface EmailLayoutProps {
  children: React.ReactNode;
}

const tailwindConfig = {
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          900: '#1e3a8a',
        },
      },
      fontFamily: {
        sans: [
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
    },
  },
};

export function EmailLayout({children}: EmailLayoutProps) {
  return (
    <Tailwind config={tailwindConfig}>
      <Html>
        <Head>
          <meta name="color-scheme" content="light" />
          <meta name="supported-color-schemes" content="light" />
        </Head>
        <Body className="m-0 bg-gray-50 p-0 font-sans antialiased">
          <Container
            className="mx-auto my-8 max-w-[600px] overflow-hidden rounded-lg bg-white shadow-sm"
            style={{border: '1px solid #e5e7eb'}}
          >
            {children}
          </Container>
        </Body>
      </Html>
    </Tailwind>
  );
}
