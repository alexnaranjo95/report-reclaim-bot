export function auditCreditData(data: any) {
  console.groupCollapsed('[Audit] Credit Report Data');
  try {
    if (!data) {
      console.warn('[Audit] No credit report data provided');
      return;
    }

    // Basic JSON serializability check
    let jsonValid = true;
    try {
      JSON.stringify(data);
    } catch (e) {
      jsonValid = false;
      console.error('[Audit] JSON serialization failed:', e);
    }

    // Sections overview
    const sections = ['reportHeader', 'personalInfo', 'creditScores', 'accountSummary', 'accounts', 'inquiries'] as const;
    for (const key of sections) {
      const val = (data as any)[key as any];
      console.log(`[Audit] Section: ${key}`, val);
    }

    // Counts
    const counts = {
      accounts: Array.isArray((data as any).accounts) ? (data as any).accounts.length : 0,
      inquiries: Array.isArray((data as any).inquiries) ? (data as any).inquiries.length : 0,
      alerts: Array.isArray((data as any).reportHeader?.alerts) ? (data as any).reportHeader.alerts.length : 0,
    };
    console.table(counts);

    // Sample keys
    if (Array.isArray((data as any).accounts) && (data as any).accounts.length) {
      const sampleKeys = Object.keys((data as any).accounts[0] ?? {});
      console.log('[Audit] Sample account keys:', sampleKeys);
    }

    console.info('[Audit] JSON valid:', jsonValid);
  } finally {
    console.groupEnd();
  }
}
