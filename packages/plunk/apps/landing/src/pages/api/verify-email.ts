import type {NextApiRequest, NextApiResponse} from 'next';
import type {EmailVerificationResult} from '@plunk/types';
import {UtilitySchemas} from '@plunk/shared';
import {API_URI} from '../../lib/constants';

interface ErrorResponse {
  error: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<EmailVerificationResult | ErrorResponse>,
) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({error: 'Method not allowed'});
  }

  // Validate input using Zod schema
  const result = UtilitySchemas.email.safeParse(req.body);

  if (!result.success) {
    return res.status(400).json({error: 'Invalid email format'});
  }

  const {email} = result.data;

  // Get secret key from environment
  const secretKey = process.env.PLUNK_API_KEY;
  if (!secretKey) {
    console.error('PLUNK_API_KEY is not configured');
    return res.status(500).json({error: 'Service configuration error'});
  }

  try {
    // Call internal Plunk API with secret key from env
    const response = await fetch(`${API_URI}/v1/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${secretKey}`,
      },
      body: JSON.stringify({email}),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Plunk API error:', data);
      return res.status(response.status).json({error: data.error?.message || 'Verification failed'});
    }

    // Return the data field from the Plunk API response
    return res.status(200).json(data.data);
  } catch (error) {
    console.error('Error verifying email:', error);
    return res.status(500).json({error: 'Internal server error'});
  }
}
