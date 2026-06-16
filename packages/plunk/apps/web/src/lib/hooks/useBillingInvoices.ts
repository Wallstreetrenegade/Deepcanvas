import useSWR from 'swr';

export interface Invoice {
  id: string;
  number: string | null;
  status: string;
  amountDue: number;
  amountPaid: number;
  currency: string;
  created: string;
  periodStart: string | null;
  periodEnd: string | null;
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
  subtotal: number;
  total: number;
  paid: boolean;
}

export interface UnpaidInvoice {
  id: string;
  number: string | null;
  amountDue: number;
  currency: string;
  dueDate: string | null;
  hostedInvoiceUrl: string | null;
}

export interface BillingInvoicesData {
  invoices: Invoice[];
  hasUnpaidInvoices: boolean;
  unpaidInvoices: UnpaidInvoice[];
}

/**
 * Hook to fetch billing invoices from Stripe
 */
export function useBillingInvoices(projectId: string | undefined, hasSubscription: boolean) {
  const {data, error, mutate, isLoading} = useSWR<BillingInvoicesData>(
    projectId && hasSubscription ? `/users/@me/projects/${projectId}/billing-invoices` : null,
    {
      revalidateOnFocus: true,
      refreshInterval: 300000, // Refresh every 5 minutes
    },
  );

  return {
    invoicesData: data,
    error,
    isLoading,
    mutate,
  };
}
