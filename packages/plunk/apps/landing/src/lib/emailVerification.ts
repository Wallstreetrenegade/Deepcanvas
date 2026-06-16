import type {EmailVerificationResult} from '@plunk/types';

export async function verifyEmail(email: string): Promise<EmailVerificationResult> {
  const response = await fetch('/api/verify-email', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({email}),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Verification failed');
  }

  return response.json();
}
