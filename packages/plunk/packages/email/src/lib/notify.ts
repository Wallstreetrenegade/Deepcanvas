import {render} from '@react-email/components';
import type {ReactElement} from 'react';
import {sendEmail} from './send';

/**
 * Check if platform email notifications are enabled
 * Requires PLUNK_API_KEY to be set in environment
 */
export function isPlatformEmailEnabled(): boolean {
  return !!process.env.PLUNK_API_KEY && !!process.env.PLUNK_FROM_ADDRESS;
}

/**
 * Send a platform notification email (only if PLUNK_API_KEY is configured)
 * @param to - Recipient email address
 * @param subject - Email subject line
 * @param template - React email template component
 */
export async function sendPlatformEmail(to: string, subject: string, template: ReactElement): Promise<void> {
  // Skip if platform emails are not enabled
  if (!isPlatformEmailEnabled()) {
    return;
  }

  try {
    // Render React email template to HTML
    const html = await render(template);

    // Send email using the platform
    await sendEmail({
      to,
      from: process.env.PLUNK_FROM_ADDRESS as string,
      subject,
      body: html,
    });
  } catch (error) {
    // Log error but don't throw - notifications should not break the main flow
    console.error('[Platform Email] Failed to send notification:', error);
  }
}
