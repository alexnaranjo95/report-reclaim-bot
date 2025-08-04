import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

// CORS headers for web requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log("=== TEXTRACT FUNCTION START ===");
  console.log("Function called at:", new Date().toISOString());
  console.log("Request method:", req.method);

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log("CORS preflight request handled");
    return new Response(null, { headers: corsHeaders });
  }

  let body: any = null;
  let reportId: string | null = null;

  try {
    // Parse request body
    console.log("=== PARSING REQUEST ===");
    body = await req.json();
    reportId = body.reportId;
    console.log("Request body keys:", Object.keys(body));
    console.log("Report ID:", body.reportId);
    console.log("File Path:", body.filePath);

    if (!body.reportId || !body.filePath) {
      throw new Error("Missing required parameters: reportId and filePath");
    }

    // Initialize Supabase client
    console.log("=== CREATING SUPABASE CLIENT ===");
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    console.log("Supabase URL exists:", !!supabaseUrl);
    console.log("Supabase Service Key exists:", !!supabaseServiceKey);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Download PDF from storage
    console.log("Downloading PDF file...");
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('credit-reports')
      .download(body.filePath);

    if (downloadError) {
      throw new Error(`Failed to download PDF: ${downloadError.message}`);
    }

    // Convert to bytes
    const arrayBuffer = await fileData.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    console.log("PDF downloaded successfully, size:", bytes.length, "bytes");

    // Validate file size (max 5MB for Textract)
    if (bytes.length > 5000000) {
      throw new Error(`File too large: ${bytes.length} bytes. Maximum supported size is 5MB.`);
    }

    // Verify PDF header
    const pdfHeader = Array.from(bytes.slice(0, 4), byte => String.fromCharCode(byte)).join('');
    if (pdfHeader !== '%PDF') {
      throw new Error("Invalid PDF file format");
    }

    // Extract text using Amazon Textract
    console.log("🚀 Starting Amazon Textract analysis...");
    const extractedData = await analyzeDocumentWithTextract(bytes);

    if (!extractedData || !extractedData.text || extractedData.text.length < 50) {
      throw new Error("Textract extraction failed - no meaningful text extracted");
    }

    console.log("✅ Textract extraction successful, text length:", extractedData.text.length);

    // Validate extracted content
    if (!isValidCreditReportContent(extractedData.text)) {
      throw new Error("Extracted content does not appear to be a valid credit report");
    }

    // Store raw text in database
    const { error: updateError } = await supabase
      .from('credit_reports')
      .update({
        raw_text: extractedData.text,
        extraction_status: 'completed',
        updated_at: new Date().toISOString()
      })
      .eq('id', body.reportId);

    if (updateError) {
      throw new Error(`Failed to store extracted text: ${updateError.message}`);
    }

    // Parse and store structured data
    await parseAndStoreCreditData(supabase, body.reportId, extractedData);

    console.log("✅ PDF processing completed successfully");

    return new Response(
      JSON.stringify({
        success: true,
        textLength: extractedData.text.length,
        tables: extractedData.tables?.length || 0,
        keyValues: extractedData.keyValues?.length || 0,
        reportId: body.reportId
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error("=== TEXTRACT EXTRACTION ERROR ===");
    console.error("Error type:", error.constructor.name);
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);

    // Update report status to failed (only if we have a reportId)
    if (reportId) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        
        await supabase
          .from('credit_reports')
          .update({
            extraction_status: 'failed',
            processing_errors: error.message,
            updated_at: new Date().toISOString()
          })
          .eq('id', reportId);
      } catch (updateError) {
        console.error("Failed to update error status:", updateError);
      }
    }

    return new Response(
      JSON.stringify({
        error: error.message,
        success: false,
        timestamp: new Date().toISOString()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});

// Amazon Textract integration
async function analyzeDocumentWithTextract(bytes: Uint8Array) {
  console.log("Converting to base64...");
  console.log("File size in bytes:", bytes.length);
  
  // Convert to base64 using proper method for Deno
  const binaryString = Array.from(bytes, byte => String.fromCharCode(byte)).join('');
  const base64String = btoa(binaryString);
  
  console.log("Base64 conversion successful");
  console.log("Base64 length:", base64String.length);
  console.log("Base64 preview (first 100 chars):", base64String.substring(0, 100));

  // Prepare AWS Textract request
  const region = Deno.env.get("AWS_REGION") || "us-east-1";
  const accessKeyId = Deno.env.get("AWS_ACCESS_KEY_ID")!;
  const secretAccessKey = Deno.env.get("AWS_SECRET_ACCESS_KEY")!;

  if (!accessKeyId || !secretAccessKey) {
    throw new Error("AWS credentials not configured");
  }

  const service = "textract";
  const host = `${service}.${region}.amazonaws.com`;
  const endpoint = `https://${host}/`;
  
  const payload = JSON.stringify({
    Document: {
      Bytes: base64String
    },
    FeatureTypes: ["TABLES", "FORMS"]
  });

  // Create AWS signature
  const headers = await createAwsHeaders(payload, host, region, accessKeyId, secretAccessKey);

  console.log("Calling Textract AnalyzeDocument API...");
  
  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: payload,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Textract API error:", errorText);
    throw new Error(`Textract API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  console.log("✅ Textract API call successful");
  
  return processTextractResponse(result);
}

// Process Textract response into structured data
function processTextractResponse(textractResponse: any) {
  const blocks = textractResponse.Blocks || [];
  
  let fullText = '';
  const tables: any[] = [];
  const keyValues: any[] = [];

  // Extract text blocks
  const textBlocks = blocks.filter((block: any) => block.BlockType === 'LINE');
  fullText = textBlocks.map((block: any) => block.Text).join('\n');

  // Extract tables
  const tableBlocks = blocks.filter((block: any) => block.BlockType === 'TABLE');
  for (const table of tableBlocks) {
    const tableData = extractTableFromBlock(table, blocks);
    if (tableData.length > 0) {
      tables.push(tableData);
    }
  }

  // Extract key-value pairs
  const keyValueBlocks = blocks.filter((block: any) => block.BlockType === 'KEY_VALUE_SET');
  for (const kvBlock of keyValueBlocks) {
    if (kvBlock.EntityTypes?.includes('KEY')) {
      const valueBlock = findLinkedValueBlock(kvBlock, blocks);
      if (valueBlock) {
        keyValues.push({
          key: kvBlock.Text || '',
          value: valueBlock.Text || ''
        });
      }
    }
  }

  return {
    text: fullText,
    tables,
    keyValues
  };
}

// Extract table data from Textract blocks
function extractTableFromBlock(tableBlock: any, allBlocks: any[]) {
  const cells = tableBlock.Relationships?.find((rel: any) => rel.Type === 'CHILD')?.Ids || [];
  const tableData: string[][] = [];
  
  for (const cellId of cells) {
    const cellBlock = allBlocks.find(block => block.Id === cellId);
    if (cellBlock && cellBlock.BlockType === 'CELL') {
      const rowIndex = cellBlock.RowIndex - 1;
      const colIndex = cellBlock.ColumnIndex - 1;
      
      if (!tableData[rowIndex]) {
        tableData[rowIndex] = [];
      }
      
      tableData[rowIndex][colIndex] = cellBlock.Text || '';
    }
  }
  
  return tableData.filter(row => row.some(cell => cell && cell.trim()));
}

// Find linked value block for key-value pairs
function findLinkedValueBlock(keyBlock: any, allBlocks: any[]) {
  const valueIds = keyBlock.Relationships?.find((rel: any) => rel.Type === 'VALUE')?.Ids || [];
  
  for (const valueId of valueIds) {
    const valueBlock = allBlocks.find(block => block.Id === valueId);
    if (valueBlock && valueBlock.EntityTypes?.includes('VALUE')) {
      return valueBlock;
    }
  }
  
  return null;
}

// Create AWS signature headers
async function createAwsHeaders(payload: string, host: string, region: string, accessKeyId: string, secretAccessKey: string) {
  const algorithm = 'AWS4-HMAC-SHA256';
  const service = 'textract';
  const date = new Date();
  const amzDate = date.toISOString().replace(/[:\-]|\.\d{3}/g, '');
  const dateStamp = amzDate.substr(0, 8);
  
  const payloadHash = await sha256(payload);
  
  const canonicalHeaders = `host:${host}\nx-amz-date:${amzDate}\nx-amz-target:Textract.AnalyzeDocument\n`;
  const signedHeaders = 'host;x-amz-date;x-amz-target';
  const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${await sha256(canonicalRequest)}`;
  
  const signingKey = await calculateSignature(secretAccessKey, dateStamp, region, service);
  const signature = await hmacSha256(signingKey, stringToSign);
  
  const authorizationHeader = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  
  return {
    'Authorization': authorizationHeader,
    'Content-Type': 'application/x-amz-json-1.1',
    'X-Amz-Date': amzDate,
    'X-Amz-Target': 'Textract.AnalyzeDocument',
  };
}

// Utility functions for AWS signing
async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256(key: Uint8Array, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
  const hashArray = Array.from(new Uint8Array(signature));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function calculateSignature(secretAccessKey: string, dateStamp: string, region: string, service: string): Promise<Uint8Array> {
  const kDate = await hmacSha256Raw(new TextEncoder().encode(`AWS4${secretAccessKey}`), dateStamp);
  const kRegion = await hmacSha256Raw(kDate, region);
  const kService = await hmacSha256Raw(kRegion, service);
  const kSigning = await hmacSha256Raw(kService, 'aws4_request');
  return kSigning;
}

async function hmacSha256Raw(key: Uint8Array, message: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
  return new Uint8Array(signature);
}

// Validate extracted content
function isValidCreditReportContent(text: string): boolean {
  const creditReportIndicators = [
    'credit report', 'credit score', 'experian', 'equifax', 'transunion',
    'account history', 'payment history', 'personal information',
    'credit inquiry', 'credit account', 'balance', 'credit limit'
  ];
  
  const lowerText = text.toLowerCase();
  const foundIndicators = creditReportIndicators.filter(indicator => 
    lowerText.includes(indicator)
  );
  
  return foundIndicators.length >= 3;
}

// Parse and store credit data
async function parseAndStoreCreditData(supabase: any, reportId: string, extractedData: any) {
  const text = extractedData.text;
  
  // Extract personal information
  const personalInfo = extractPersonalInfoFromTextract(text, extractedData);
  if (personalInfo) {
    await supabase.from('personal_information').upsert({
      report_id: reportId,
      ...personalInfo
    });
  }

  // Extract accounts
  const accounts = extractAccountsFromTextract(text, extractedData);
  if (accounts.length > 0) {
    await supabase.from('credit_accounts').upsert(
      accounts.map(account => ({
        report_id: reportId,
        ...account
      }))
    );
  }

  // Extract inquiries
  const inquiries = extractInquiriesFromTextract(text, extractedData);
  if (inquiries.length > 0) {
    await supabase.from('credit_inquiries').upsert(
      inquiries.map(inquiry => ({
        report_id: reportId,
        ...inquiry
      }))
    );
  }

  // Extract negative items
  const negativeItems = extractNegativeItemsFromTextract(text, extractedData);
  if (negativeItems.length > 0) {
    await supabase.from('negative_items').upsert(
      negativeItems.map(item => ({
        report_id: reportId,
        ...item
      }))
    );
  }
}

// Extract personal information
function extractPersonalInfoFromTextract(text: string, extractedData: any) {
  const nameMatch = text.match(/(?:name|consumer)[\s:]*([A-Z][A-Z\s]+[A-Z])/i);
  const ssnMatch = text.match(/(?:ssn|social security)[\s:]*(\*+\d{4}|\d{3}-?\d{2}-?\*+)/i);
  const dobMatch = text.match(/(?:date of birth|dob|born)[\s:]*(\d{1,2}\/\d{1,2}\/\d{4})/i);
  const addressMatch = text.match(/(?:address|addr)[\s:]*([^\n]+(?:st|ave|rd|blvd|ln|dr|ct)[^\n]*)/i);

  if (!nameMatch && !ssnMatch && !dobMatch) {
    return null;
  }

  return {
    full_name: nameMatch?.[1]?.trim(),
    ssn_partial: ssnMatch?.[1]?.trim(),
    date_of_birth: dobMatch?.[1] ? formatDate(dobMatch[1]) : null,
    current_address: addressMatch?.[1]?.trim()
  };
}

// Extract accounts from text and tables
function extractAccountsFromTextract(text: string, extractedData: any) {
  const accounts: any[] = [];
  
  // Extract from tables first
  if (extractedData.tables) {
    for (const table of extractedData.tables) {
      for (const row of table) {
        const account = parseAccountFromTableRow(row);
        if (account) {
          accounts.push(account);
        }
      }
    }
  }
  
  // Fallback to regex parsing
  if (accounts.length === 0) {
    const accountPattern = /([A-Z\s&]+)\s+(\d+[\*\d]*)\s+.*?(\$[\d,]+\.?\d*)/g;
    let match;
    
    while ((match = accountPattern.exec(text)) !== null) {
      accounts.push({
        creditor_name: match[1].trim(),
        account_number: match[2],
        current_balance: parseFloat(match[3].replace(/[$,]/g, '')) || 0,
        account_type: determineAccountType(match[1])
      });
    }
  }
  
  return accounts;
}

// Extract inquiries
function extractInquiriesFromTextract(text: string, extractedData: any) {
  const inquiries: any[] = [];
  
  // Extract from tables
  if (extractedData.tables) {
    for (const table of extractedData.tables) {
      for (const row of table) {
        const inquiry = parseInquiryFromTableRow(row);
        if (inquiry) {
          inquiries.push(inquiry);
        }
      }
    }
  }
  
  // Fallback to regex
  if (inquiries.length === 0) {
    const inquiryPattern = /([A-Z\s&]+)\s+(\d{1,2}\/\d{1,2}\/\d{4})/g;
    let match;
    
    while ((match = inquiryPattern.exec(text)) !== null) {
      inquiries.push({
        company_name: match[1].trim(),
        inquiry_date: formatDate(match[2]),
        inquiry_type: 'hard'
      });
    }
  }
  
  return inquiries;
}

// Extract negative items
function extractNegativeItemsFromTextract(text: string, extractedData: any) {
  const negativeItems: any[] = [];
  
  const negativeTerms = ['collection', 'charge off', 'late payment', 'default', 'delinquent'];
  const lines = text.split('\n');
  
  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    for (const term of negativeTerms) {
      if (lowerLine.includes(term)) {
        const amountMatch = line.match(/\$[\d,]+\.?\d*/);
        const dateMatch = line.match(/\d{1,2}\/\d{1,2}\/\d{4}/);
        
        negativeItems.push({
          description: line.trim(),
          negative_type: term,
          amount: amountMatch ? parseFloat(amountMatch[0].replace(/[$,]/g, '')) : null,
          date_occurred: dateMatch ? formatDate(dateMatch[0]) : null,
          severity_score: getSeverityScore(term)
        });
        break;
      }
    }
  }
  
  return negativeItems;
}

// Helper functions
function parseAccountFromTableRow(row: string[]): any | null {
  if (row.length < 3) return null;
  
  const creditorName = row[0]?.trim();
  const accountNumber = row[1]?.trim();
  const balance = row[2]?.replace(/[$,]/g, '');
  
  if (!creditorName || !accountNumber) return null;
  
  return {
    creditor_name: creditorName,
    account_number: accountNumber,
    current_balance: parseFloat(balance) || 0,
    account_type: determineAccountType(creditorName)
  };
}

function parseInquiryFromTableRow(row: string[]): any | null {
  if (row.length < 2) return null;
  
  const companyName = row[0]?.trim();
  const date = row[1]?.trim();
  
  if (!companyName || !date.match(/\d{1,2}\/\d{1,2}\/\d{4}/)) return null;
  
  return {
    company_name: companyName,
    inquiry_date: formatDate(date),
    inquiry_type: 'hard'
  };
}

function determineAccountType(creditorName: string): string {
  const name = creditorName.toLowerCase();
  
  if (name.includes('card') || name.includes('visa') || name.includes('master')) return 'credit_card';
  if (name.includes('mortgage') || name.includes('home')) return 'mortgage';
  if (name.includes('auto') || name.includes('car')) return 'auto_loan';
  if (name.includes('student') || name.includes('education')) return 'student_loan';
  if (name.includes('personal') || name.includes('loan')) return 'personal_loan';
  
  return 'other';
}

function formatDate(dateStr: string): string | null {
  try {
    const date = new Date(dateStr);
    return date.toISOString().split('T')[0];
  } catch {
    return null;
  }
}

function getSeverityScore(negativeType: string): number {
  const severityMap: { [key: string]: number } = {
    'collection': 8,
    'charge off': 9,
    'late payment': 5,
    'default': 9,
    'delinquent': 6
  };
  
  return severityMap[negativeType] || 5;
}