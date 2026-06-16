import {User} from '@prisma/client';
import useSWR from 'swr';

/**
 * Fetch the current account. undefined means loading, null means logged out
 *
 */
export function useAccount() {
  return useSWR<User | null>('/users/@me', {shouldRetryOnError: false});
}
