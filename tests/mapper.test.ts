import { describe, it, expect } from 'vitest';
import { mapJsonToSchema, groupAccountsByCreditor, mapFields } from '../src/mapper';
import type { CreditReport, AccountDetails } from '../src/schema';

describe('mapJsonToSchema', () => {
  it('should map basic credit report data', () => {
    const rawData = {
      personalInformation: {
        fullName: 'John Doe',
        birthDate: '1980-01-01',
      },
      creditScores: [
        {
          bureau: 'Equifax',
          score: 720,
          date: '2024-01-01',
        },
      ],
      accountSummary: {
        totalAccounts: 5,
        openAccounts: 3,
      },
    };

    const result = mapJsonToSchema(rawData);

    expect(result.personalInformation?.fullName).toBe('John Doe');
    expect(result.personalInformation?.birthDate).toBe('1980-01-01');
    expect(result.creditScores?.[0]?.bureau).toBe('Equifax');
    expect(result.creditScores?.[0]?.score).toBe(720);
    expect(result.accountSummary?.totalAccounts).toBe(5);
  });

  it('should handle nested report structure', () => {
    const rawData = {
      report: {
        personal: {
          name: 'Jane Smith',
          dob: '1990-05-15',
        },
        scores: [
          {
            source: 'TransUnion',
            value: 680,
          },
        ],
      },
    };

    const result = mapJsonToSchema(rawData);

    expect(result.personalInformation?.fullName).toBe('Jane Smith');
    expect(result.personalInformation?.birthDate).toBe('1990-05-15');
    expect(result.creditScores?.[0]?.bureau).toBe('TransUnion');
    expect(result.creditScores?.[0]?.score).toBe(680);
  });

  it('should return minimal structure for invalid data', () => {
    const result = mapJsonToSchema(null);

    expect(result).toEqual({
      personalInformation: undefined,
      creditScores: undefined,
      accountSummary: undefined,
      accountDetails: undefined,
      inquiries: undefined,
      publicRecords: undefined,
      creditorContacts: undefined,
    });
  });
});

describe('groupAccountsByCreditor', () => {
  it('should group accounts by creditor name', () => {
    const accounts: AccountDetails[] = [
      { creditorName: 'Bank A', accountType: 'Credit Card' },
      { creditorName: 'Bank B', accountType: 'Loan' },
      { creditorName: 'Bank A', accountType: 'Savings' },
    ];

    const result = groupAccountsByCreditor(accounts);

    expect(Object.keys(result)).toHaveLength(2);
    expect(result['Bank A']).toHaveLength(2);
    expect(result['Bank B']).toHaveLength(1);
  });

  it('should handle accounts with no creditor name', () => {
    const accounts: AccountDetails[] = [
      { accountType: 'Credit Card' },
      { creditorName: 'Bank A', accountType: 'Loan' },
    ];

    const result = groupAccountsByCreditor(accounts);

    expect(result['Unknown Creditor']).toHaveLength(1);
    expect(result['Bank A']).toHaveLength(1);
  });
});

describe('mapFields', () => {
  it('should map fields using field mappings', () => {
    const obj = {
      full_name: 'John Doe',
      birth_date: '1980-01-01',
      unused_field: 'value',
    };

    const mappings = {
      fullName: ['fullName', 'full_name', 'name'],
      birthDate: ['birthDate', 'birth_date', 'dob'],
    };

    const result = mapFields(obj, mappings);

    expect(result.fullName).toBe('John Doe');
    expect(result.birthDate).toBe('1980-01-01');
    expect(result.unused_field).toBeUndefined();
  });

  it('should prioritize first matching field', () => {
    const obj = {
      name: 'First Name',
      fullName: 'Full Name',
    };

    const mappings = {
      displayName: ['name', 'fullName'],
    };

    const result = mapFields(obj, mappings);

    expect(result.displayName).toBe('First Name');
  });

  it('should skip empty and null values', () => {
    const obj = {
      name: '',
      fullName: null,
      displayName: 'Valid Name',
    };

    const mappings = {
      finalName: ['name', 'fullName', 'displayName'],
    };

    const result = mapFields(obj, mappings);

    expect(result.finalName).toBe('Valid Name');
  });
});