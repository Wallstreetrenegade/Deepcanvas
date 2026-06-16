import useSWR from 'swr';

export interface BillingPeriod {
  start: string;
  end: string;
}

export interface UsageRecord {
  period: BillingPeriod;
  totalUsage: number;
}

export interface UpcomingInvoice {
  amountDue: number;
  currency: string;
  periodStart: string;
  periodEnd: string;
  subtotal: number;
  total: number;
}

export interface AccountCredits {
  balance: number;
  hasCredits: boolean;
  creditAmount: number;
  currency: string;
}

export interface BillingConsumptionData {
  period: BillingPeriod;
  usage: {
    total: number;
    records: UsageRecord[];
  };
  credits: AccountCredits | null;
  upcomingInvoice: UpcomingInvoice | null;
}

/**
 * Hook to fetch current month billing consumption from Stripe
 */
export function useBillingConsumption(projectId: string | undefined, hasSubscription: boolean) {
  const {data, error, mutate, isLoading} = useSWR<BillingConsumptionData>(
    projectId && hasSubscription ? `/users/@me/projects/${projectId}/billing-consumption` : null,
    {
      revalidateOnFocus: false,
      refreshInterval: 60000, // Refresh every minute
    },
  );

  return {
    consumptionData: data,
    error,
    isLoading,
    mutate,
  };
}
