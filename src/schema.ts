import { z } from 'zod';

// Address Schema
export const AddressSchema = z.object({
  type: z.string().optional(),
  street: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
});

// Personal Information Schema
export const PersonalInformationSchema = z.object({
  fullName: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  middleName: z.string().optional(),
  birthDate: z.string().optional(),
  ssn: z.string().optional(),
  phone: z.string().optional(),
  addresses: z.array(AddressSchema).optional(),
  employers: z.array(z.object({
    name: z.string().optional(),
    address: z.string().optional(),
    position: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  })).optional(),
});

// Credit Score Schema
export const CreditScoreSchema = z.object({
  bureau: z.enum(['Equifax', 'Experian', 'TransUnion']),
  score: z.number().optional(),
  date: z.string().optional(),
  model: z.string().optional(),
  factors: z.array(z.string()).optional(),
});

// Payment History Schema
export const PaymentHistorySchema = z.object({
  month: z.string(),
  status: z.string(), // OK, 30, 60, 90, etc.
});

// Account Details Schema
export const AccountDetailsSchema = z.object({
  creditorName: z.string().optional(),
  accountNumber: z.string().optional(),
  accountType: z.string().optional(),
  balance: z.string().optional(),
  creditLimit: z.string().optional(),
  highBalance: z.string().optional(),
  status: z.string().optional(),
  openDate: z.string().optional(),
  lastPaymentDate: z.string().optional(),
  lastReportedDate: z.string().optional(),
  monthlyPayment: z.string().optional(),
  paymentHistory: z.array(PaymentHistorySchema).optional(),
  remarks: z.string().optional(),
  bureau: z.array(z.string()).optional(),
});

// Account Summary Schema
export const AccountSummarySchema = z.object({
  totalAccounts: z.number().optional(),
  openAccounts: z.number().optional(),
  closedAccounts: z.number().optional(),
  delinquentAccounts: z.number().optional(),
  totalBalance: z.string().optional(),
  totalCreditLimit: z.string().optional(),
  creditUtilization: z.string().optional(),
});

// Inquiry Schema
export const InquirySchema = z.object({
  creditorName: z.string().optional(),
  date: z.string().optional(),
  type: z.enum(['hard', 'soft']).optional(),
  bureau: z.string().optional(),
});

// Public Record Schema
export const PublicRecordSchema = z.object({
  type: z.string().optional(),
  filingDate: z.string().optional(),
  status: z.string().optional(),
  amount: z.string().optional(),
  court: z.string().optional(),
  caseNumber: z.string().optional(),
});

// Creditor Contact Schema
export const CreditorContactSchema = z.object({
  name: z.string(),
  address: z.string().optional(),
  phone: z.string().optional(),
  website: z.string().optional(),
  disputeAddress: z.string().optional(),
});

// Main Credit Report Schema
export const CreditReportSchema = z.object({
  personalInformation: PersonalInformationSchema.optional(),
  creditScores: z.array(CreditScoreSchema).optional(),
  accountSummary: AccountSummarySchema.optional(),
  accountDetails: z.array(AccountDetailsSchema).optional(),
  inquiries: z.array(InquirySchema).optional(),
  publicRecords: z.array(PublicRecordSchema).optional(),
  creditorContacts: z.array(CreditorContactSchema).optional(),
  reportDate: z.string().optional(),
  reportSource: z.string().optional(),
});

export type CreditReport = z.infer<typeof CreditReportSchema>;
export type AccountDetails = z.infer<typeof AccountDetailsSchema>;
export type PersonalInformation = z.infer<typeof PersonalInformationSchema>;
export type CreditScore = z.infer<typeof CreditScoreSchema>;
export type AccountSummary = z.infer<typeof AccountSummarySchema>;
export type Inquiry = z.infer<typeof InquirySchema>;
export type PublicRecord = z.infer<typeof PublicRecordSchema>;
export type CreditorContact = z.infer<typeof CreditorContactSchema>;