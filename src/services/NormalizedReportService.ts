import { supabase } from '@/integrations/supabase/client';

export interface NormalizedCreditReport {
  runId: string;
  collectedAt: string;
  version: string;
  report: {
    scores: Array<{
      bureau: string;
      score: number;
      status: string;
      position: number;
    }>;
    accounts: {
      realEstate: Array<any>;
      revolving: Array<any>;
      other: Array<any>;
    };
    inquiries: Array<{
      inquirer_name: string;
      inquiry_date: string;
      bureau: string;
      position: number;
    }>;
    personalInformation: Array<any>;
    consumerStatements: Array<any>;
    collections: Array<any>;
    addresses: Array<any>;
    publicRecords: Array<any>;
  };
  counts: {
    realEstate: number;
    revolving: number;
    other: number;
  };
}

export async function fetchLatestNormalized(userId?: string, runId?: string): Promise<NormalizedCreditReport | null> {
  try {
    const { data, error } = await supabase.functions.invoke('credit-report-latest', {
      body: { userId, runId }
    });

    if (error) {
      console.error('[NormalizedReportService] Error fetching latest report:', error);
      return null;
    }

    if (!data || !data.report) {
      console.log('[NormalizedReportService] No report data found');
      return null;
    }

    return {
      runId: data.runId,
      collectedAt: data.collectedAt,
      version: data.version || 'v1',
      report: data.report,
      counts: data.counts || { realEstate: 0, revolving: 0, other: 0 }
    };
  } catch (error) {
    console.error('[NormalizedReportService] Exception fetching report:', error);
    return null;
  }
}

export async function fetchNormalizedAccounts(userId: string, runId?: string) {
  try {
    let query = supabase
      .from('normalized_credit_accounts')
      .select('*')
      .eq('user_id', userId)
      .order('position');

    if (runId) {
      query = query.eq('run_id', runId);
    } else {
      // Get latest run for user
      const { data: latestRun } = await supabase
        .from('normalized_credit_reports')
        .select('run_id')
        .eq('user_id', userId)
        .order('collected_at', { ascending: false })
        .limit(1)
        .single();
      
      if (latestRun?.run_id) {
        query = query.eq('run_id', latestRun.run_id);
      }
    }

    const { data, error } = await query;

    if (error) {
      console.error('[NormalizedReportService] Error fetching accounts:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('[NormalizedReportService] Exception fetching accounts:', error);
    return [];
  }
}

export async function fetchLatestWithFallback(userId?: string, runId?: string) {
  const normalized = await fetchLatestNormalized(userId, runId);
  if (normalized) {
    return await transformNormalizedToReportData(normalized);
  }
  return null;
}

export async function transformNormalizedToReportData(normalized: NormalizedCreditReport) {
  // Transform the normalized data structure to match the CreditReportData interface
  const report = normalized.report;
  
  // Get additional account details from normalized_credit_accounts
  const accounts = await fetchNormalizedAccounts('', normalized.runId);
  
  // Transform accounts to match expected interface
  const transformedAccounts = accounts.map((acc: any) => ({
    id: acc.id,
    creditor: acc.creditor || 'Unknown',
    accountNumber: acc.account_number_mask || '****',
    type: acc.category === 'realEstate' ? 'mortgage' : 
          acc.category === 'revolving' ? 'revolving' : 'installment',
    status: acc.account_status?.toLowerCase() === 'open' ? 'open' : 
           acc.account_status?.toLowerCase() === 'closed' ? 'closed' : 'open',
    balance: acc.balance || 0,
    limit: acc.credit_limit,
    paymentHistory: [], // TODO: Parse payment history from data
    dateOpened: acc.opened_on || '',
    lastReported: acc.reported_on || '',
    lastPayment: acc.last_payment_on,
    paymentAmount: acc.payment_amount,
    bureaus: [acc.bureau].filter(Boolean),
  }));

  // Transform scores
  const creditScores = {
    transUnion: report.scores.find(s => s.bureau.toLowerCase() === 'transunion'),
    experian: report.scores.find(s => s.bureau.toLowerCase() === 'experian'),
    equifax: report.scores.find(s => s.bureau.toLowerCase() === 'equifax'),
  };

  // Transform inquiries
  const transformedInquiries = report.inquiries.map((inq: any) => ({
    id: `${inq.inquirer_name}-${inq.inquiry_date}`,
    creditor: inq.inquirer_name || 'Unknown',
    date: inq.inquiry_date || '',
    type: 'hard' as const,
    purpose: undefined,
  }));

  // Calculate account summary
  const openAccounts = transformedAccounts.filter(acc => acc.status === 'open').length;
  const closedAccounts = transformedAccounts.filter(acc => acc.status === 'closed').length;
  const totalBalances = transformedAccounts.reduce((sum, acc) => sum + acc.balance, 0);
  const monthlyPayments = transformedAccounts.reduce((sum, acc) => sum + (acc.paymentAmount || 0), 0);

  return {
    reportHeader: {
      referenceNumber: normalized.runId,
      reportDate: new Date(normalized.collectedAt).toLocaleDateString(),
      alerts: [], // TODO: Parse alerts from data
    },
    personalInfo: {
      name: report.personalInformation[0]?.fields?.Name || 'Unknown',
      aliases: [],
      birthDate: report.personalInformation[0]?.fields?.['Date of Birth'] || '',
      addresses: report.addresses.map((addr: any) => ({
        address: addr.address || '',
        type: 'current' as const,
        dates: '',
      })),
      employers: [],
    },
    creditScores: {
      transUnion: creditScores.transUnion ? {
        score: creditScores.transUnion.score,
        rank: 'Good', // TODO: Calculate rank based on score
        factors: [],
      } : undefined,
      experian: creditScores.experian ? {
        score: creditScores.experian.score,
        rank: 'Good',
        factors: [],
      } : undefined,
      equifax: creditScores.equifax ? {
        score: creditScores.equifax.score,
        rank: 'Good',
        factors: [],
      } : undefined,
    },
    accountSummary: {
      totalAccounts: transformedAccounts.length,
      openAccounts,
      closedAccounts,
      delinquentAccounts: 0, // TODO: Calculate from payment status
      collectionsAccounts: report.collections.length,
      totalBalances,
      monthlyPayments,
      inquiries2Years: transformedInquiries.length,
    },
    accounts: transformedAccounts,
    inquiries: transformedInquiries,
  };
}
