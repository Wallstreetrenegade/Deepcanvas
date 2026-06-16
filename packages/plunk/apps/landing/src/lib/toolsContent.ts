import {CheckCircle, Mail, Search, Shield, User} from 'lucide-react';

/**
 * Educational content for the email verification tool
 */
export const EMAIL_VERIFICATION_FEATURES = [
  {
    title: 'Improve Deliverability',
    description: 'Remove invalid emails before sending to reduce bounce rates and improve email deliverability.',
    icon: Mail,
  },
  {
    title: 'Catch Typos',
    description: 'Detect common typos like "gmial.com" and suggest corrections to capture valid addresses.',
    icon: Search,
  },
  {
    title: 'Protect Reputation',
    description: 'High bounce rates hurt your sender reputation. Verify emails to maintain a good standing.',
    icon: Shield,
  },
  {
    title: 'DNS Validation',
    description: 'Check if the email domain exists and has properly configured MX records for receiving mail.',
    icon: CheckCircle,
  },
  {
    title: 'Disposable Detection',
    description: 'Identify temporary email addresses that are often used for spam or fake signups.',
    icon: Mail,
  },
  {
    title: 'Personal Email Detection',
    description: 'Detect personal/free email providers like Gmail, Hotmail, Yahoo for B2B validation.',
    icon: User,
  },
  {
    title: 'Plus Addressing',
    description: 'Detect plus-addressed emails (user+tag@domain.com) which can be useful for tracking.',
    icon: Shield,
  },
] as const;
