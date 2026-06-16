import type {Contact} from '@plunk/db';
import type {CursorPaginatedResponse} from '@plunk/types';
import useSWR from 'swr';

interface UseContactsOptions {
  limit?: number;
  search?: string;
}

/**
 * Hook to fetch contacts with optional search
 */
export function useContacts(options: UseContactsOptions = {}) {
  const {limit = 50, search} = options;

  const params = new URLSearchParams();
  params.set('limit', limit.toString());
  if (search) {
    params.set('search', search);
  }

  const {data, error, mutate, isLoading} = useSWR<CursorPaginatedResponse<Contact>>(`/contacts?${params.toString()}`, {
    revalidateOnFocus: false,
    dedupingInterval: 10000, // Prevent duplicate requests within 10 seconds
  });

  return {
    contacts: data?.data || [],
    total: data?.total || 0,
    error,
    isLoading,
    mutate,
  };
}

/**
 * Hook to fetch available contact fields for variable usage
 */
export function useContactFields() {
  const {data, error, mutate, isLoading} = useSWR<{fields: {field: string; type: string}[]; count: number}>(
    '/contacts/fields',
    {
      revalidateOnFocus: false,
      // Cache fields for longer since they don't change often
      dedupingInterval: 60000, // 1 minute
    },
  );

    const fieldNames = (data?.fields || []).map(f => f.field);

  return {
    fields: fieldNames,
    error,
    isLoading,
    mutate,
  };
}
