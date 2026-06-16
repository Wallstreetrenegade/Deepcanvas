import Stripe from 'stripe';

import {STRIPE_ENABLED, STRIPE_SK} from './constants.js';

/**
 * Stripe client instance
 * Only initialized if STRIPE_SK is configured
 * Returns null if billing is disabled (self-hosted mode)
 */
export const stripe = STRIPE_ENABLED
  ? new Stripe(STRIPE_SK, {
      apiVersion: '2025-11-17.clover',
    })
  : null;
