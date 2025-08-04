
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { reportId, filePath } = await req.json();
    
    console.log('=== TEXTRACT EXTRACTION STARTED ===');
    console.log('Report ID:', reportId);
    console.log('File Path:', filePath);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const awsAccessKey = Deno.env.get('AWS_ACCESS_KEY_ID')!;
    const awsSecretKey = Deno.env.get('AWS_SECRET_ACCESS_KEY')!;
    const awsRegion = Deno.env.get('AWS_REGION') || 'us-east-1';
    
    if (!awsAccessKey || !awsSecretKey) {
      throw new Error('AWS credentials not configured');
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Update status to processing
    await supabase
      .from('credit_reports')
      .update({
        extraction_status: 'processing',
        processing_errors: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', reportId);

    // Download PDF file
    console.log('Downloading PDF file...');
    const { data: fileData, error: fileError } = await supabase.storage
      .from('credit-reports')
      .download(filePath);

    if (fileError || !fileData) {
      throw new Error(`Failed to download PDF: ${fileError?.message || 'File not found'}`);
    }

    console.log('PDF downloaded successfully, size:', fileData.size, 'bytes');

    // Convert file to base64 for Textract
    const arrayBuffer = await fileData.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    
    // Use Textract to extract text and tables
    console.log('🚀 Starting Amazon Textract analysis...');
    const textractResult = await analyzeDocumentWithTextract(bytes, awsAccessKey, awsSecretKey, awsRegion);
    
    console.log('✅ Textract analysis completed');
    console.log('Pages analyzed:', textractResult.pages.length);
    console.log('Total text length:', textractResult.fullText.length);
    console.log('Tables found:', textractResult.tables.length);
    console.log('Key-value pairs found:', textractResult.keyValuePairs.length);

    // Validate extraction quality
    if (!isValidCreditReportContent(textractResult.fullText)) {
      throw new Error('Textract extraction failed - no valid credit report content found');
    }

    // Save extracted text and structured data
    const { error: updateError } = await supabase
      .from('credit_reports')
      .update({
        raw_text: textractResult.fullText,
        extraction_status: 'completed',
        processing_errors: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', reportId);

    if (updateError) {
      throw new Error(`Failed to save extracted text: ${updateError.message}`);
    }

    // Parse and store structured data using Textract's organized output
    await parseAndStoreCreditData(supabase, reportId, textractResult);

    console.log('=== TEXTRACT EXTRACTION COMPLETED SUCCESSFULLY ===');

    return new Response(JSON.stringify({ 
      success: true, 
      textLength: textractResult.fullText.length,
      tablesFound: textractResult.tables.length,
      keyValuePairs: textractResult.keyValuePairs.length,
      extractionMethod: 'Amazon Textract',
      message: 'Credit report extracted and parsed successfully with Textract'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('=== TEXTRACT EXTRACTION ERROR ===');
    console.error('Error:', error.message);
    
    // Update report with error status
    try {
      const { reportId } = await req.json();
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      await supabase
        .from('credit_reports')
        .update({
          extraction_status: 'failed',
          processing_errors: error.message,
          updated_at: new Date().toISOString()
        })
        .eq('id', reportId);
    } catch (updateError) {
      console.error('Failed to update error status:', updateError);
    }

    return new Response(JSON.stringify({ 
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function analyzeDocumentWithTextract(bytes: Uint8Array, accessKey: string, secretKey: string, region: string) {
  const endpoint = `https://textract.${region}.amazonaws.com/`;
  
  // Create AWS signature
  const timestamp = new Date().toISOString().replace(/[:\-]|\.\d{3}/g, '');
  const date = timestamp.substr(0, 8);
  
  // Convert bytes to base64 in chunks to avoid call stack overflow
  let base64String = ''
  const chunkSize = 1024 // Process 1KB at a time
  
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.slice(i, i + chunkSize)
    const chunkString = String.fromCharCode(...chunk)
    base64String += btoa(chunkString)
  }
  
  const payload = JSON.stringify({
    Document: {
      Bytes: base64String
    },
    FeatureTypes: ['TABLES', 'FORMS']
  });
  
  const headers = await createAwsHeaders(accessKey, secretKey, region, 'textract', 'AnalyzeDocument', payload, timestamp);
  
  console.log('Calling Textract AnalyzeDocument API...');
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'Textract.AnalyzeDocument'
    },
    body: payload
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Textract API error:', errorText);
    throw new Error(`Textract API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  console.log('Raw Textract response received, blocks:', result.Blocks?.length || 0);
  
  return processTextractResponse(result);
}

function processTextractResponse(textractResponse: any) {
  const blocks = textractResponse.Blocks || [];
  const pages: any[] = [];
  const tables: any[] = [];
  const keyValuePairs: any[] = [];
  let fullText = '';
  
  // Group blocks by type
  const lineBlocks = blocks.filter((block: any) => block.BlockType === 'LINE');
  const tableBlocks = blocks.filter((block: any) => block.BlockType === 'TABLE');
  const keyValueBlocks = blocks.filter((block: any) => block.BlockType === 'KEY_VALUE_SET');
  
  // Extract text from LINE blocks (most reliable for credit reports)
  console.log('Processing LINE blocks:', lineBlocks.length);
  for (const block of lineBlocks) {
    if (block.Text && block.Text.trim()) {
      fullText += block.Text.trim() + '\n';
    }
  }
  
  // Process tables for structured account data
  console.log('Processing TABLE blocks:', tableBlocks.length);
  for (const tableBlock of tableBlocks) {
    const table = extractTableFromBlock(tableBlock, blocks);
    if (table.rows.length > 0) {
      tables.push(table);
    }
  }
  
  // Process key-value pairs for personal information
  console.log('Processing KEY-VALUE blocks:', keyValueBlocks.length);
  const keyBlocks = keyValueBlocks.filter((block: any) => 
    block.EntityTypes && block.EntityTypes.includes('KEY')
  );
  const valueBlocks = keyValueBlocks.filter((block: any) => 
    block.EntityTypes && block.EntityTypes.includes('VALUE')
  );
  
  for (const keyBlock of keyBlocks) {
    const valueBlock = findLinkedValueBlock(keyBlock, valueBlocks, blocks);
    if (keyBlock.Text && valueBlock?.Text) {
      keyValuePairs.push({
        key: keyBlock.Text.trim(),
        value: valueBlock.Text.trim(),
        confidence: Math.min(keyBlock.Confidence || 0, valueBlock.Confidence || 0)
      });
    }
  }
  
  console.log('Textract processing complete:');
  console.log('- Full text length:', fullText.length);
  console.log('- Tables extracted:', tables.length);
  console.log('- Key-value pairs:', keyValuePairs.length);
  
  return {
    fullText: fullText.trim(),
    pages,
    tables,
    keyValuePairs
  };
}

function extractTableFromBlock(tableBlock: any, allBlocks: any[]) {
  const rows: any[] = [];
  const cellBlocks = allBlocks.filter((block: any) => 
    block.BlockType === 'CELL' && 
    block.Relationships?.some((rel: any) => rel.Type === 'CHILD')
  );
  
  // Group cells by row and column
  const cellMap = new Map();
  for (const cell of cellBlocks) {
    const rowIndex = cell.RowIndex || 1;
    const colIndex = cell.ColumnIndex || 1;
    const key = `${rowIndex}-${colIndex}`;
    
    // Get cell text from child word blocks
    let cellText = '';
    if (cell.Relationships) {
      const childIds = cell.Relationships
        .filter((rel: any) => rel.Type === 'CHILD')
        .flatMap((rel: any) => rel.Ids);
      
      for (const childId of childIds) {
        const childBlock = allBlocks.find((block: any) => block.Id === childId);
        if (childBlock && childBlock.Text) {
          cellText += childBlock.Text + ' ';
        }
      }
    }
    
    cellMap.set(key, {
      row: rowIndex,
      col: colIndex,
      text: cellText.trim(),
      confidence: cell.Confidence || 0
    });
  }
  
  // Convert to structured rows
  const maxRow = Math.max(...Array.from(cellMap.values()).map((cell: any) => cell.row), 0);
  for (let r = 1; r <= maxRow; r++) {
    const rowCells: any[] = [];
    const rowEntries = Array.from(cellMap.entries())
      .filter(([key, cell]: any) => cell.row === r)
      .sort(([a]: any, [b]: any) => {
        const colA = parseInt(a.split('-')[1]);
        const colB = parseInt(b.split('-')[1]);
        return colA - colB;
      });
    
    for (const [key, cell] of rowEntries) {
      rowCells.push(cell.text);
    }
    
    if (rowCells.some(cell => cell.length > 0)) {
      rows.push(rowCells);
    }
  }
  
  return { rows, confidence: tableBlock.Confidence || 0 };
}

function findLinkedValueBlock(keyBlock: any, valueBlocks: any[], allBlocks: any[]) {
  if (!keyBlock.Relationships) return null;
  
  const valueRelation = keyBlock.Relationships.find((rel: any) => rel.Type === 'VALUE');
  if (!valueRelation || !valueRelation.Ids) return null;
  
  const valueId = valueRelation.Ids[0];
  return valueBlocks.find((block: any) => block.Id === valueId);
}

async function createAwsHeaders(accessKey: string, secretKey: string, region: string, service: string, action: string, payload: string, timestamp: string) {
  const date = timestamp.substr(0, 8);
  
  // Create canonical request
  const canonicalHeaders = [
    `host:${service}.${region}.amazonaws.com`,
    `x-amz-date:${timestamp}`,
    `x-amz-target:Textract.${action}`
  ].join('\n') + '\n';
  
  const signedHeaders = 'host;x-amz-date;x-amz-target';
  const hashedPayload = await sha256(payload);
  
  const canonicalRequest = [
    'POST',
    '/',
    '',
    canonicalHeaders,
    signedHeaders,
    hashedPayload
  ].join('\n');
  
  // Create string to sign
  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${date}/${region}/${service}/aws4_request`;
  const hashedCanonicalRequest = await sha256(canonicalRequest);
  
  const stringToSign = [
    algorithm,
    timestamp,
    credentialScope,
    hashedCanonicalRequest
  ].join('\n');
  
  // Calculate signature
  const signature = await calculateSignature(secretKey, date, region, service, stringToSign);
  
  // Create authorization header
  const authorization = `${algorithm} Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  
  return {
    'Authorization': authorization,
    'X-Amz-Date': timestamp,
    'Host': `${service}.${region}.amazonaws.com`
  };
}

async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function calculateSignature(secretKey: string, date: string, region: string, service: string, stringToSign: string): Promise<string> {
  const kDate = await hmacSha256(`AWS4${secretKey}`, date);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  const kSigning = await hmacSha256(kService, 'aws4_request');
  const signature = await hmacSha256(kSigning, stringToSign);
  
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hmacSha256(key: string | ArrayBuffer, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    typeof key === 'string' ? new TextEncoder().encode(key) : key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  return await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
}

function isValidCreditReportContent(text: string): boolean {
  if (!text || text.length < 200) return false;
  
  const requiredElements = [
    /\b(?:credit|score|report|account|balance|payment)\b/i,
    /\b(?:name|address|phone|date)\b/i,
    /\b(?:equifax|experian|transunion)\b/i,
    /\b(?:\$\d+|\d+\.\d{2})\b/ // Currency amounts
  ];
  
  const matchCount = requiredElements.filter(pattern => pattern.test(text)).length;
  return matchCount >= 3;
}

async function parseAndStoreCreditData(supabase: any, reportId: string, textractResult: any) {
  try {
    console.log('=== PARSING TEXTRACT DATA ===');
    
    // Extract personal information from key-value pairs and text
    const personalInfo = extractPersonalInfoFromTextract(textractResult);
    if (personalInfo.full_name || personalInfo.date_of_birth || personalInfo.current_address) {
      await supabase.from('personal_information').upsert({
        report_id: reportId,
        ...personalInfo
      });
      console.log('Personal information stored successfully');
    }

    // Extract accounts from tables and text
    const accounts = extractAccountsFromTextract(textractResult);
    for (const account of accounts) {
      await supabase.from('credit_accounts').upsert({
        report_id: reportId,
        ...account
      });
    }
    console.log(`Stored ${accounts.length} credit accounts`);

    // Extract inquiries
    const inquiries = extractInquiriesFromTextract(textractResult);
    for (const inquiry of inquiries) {
      await supabase.from('credit_inquiries').upsert({
        report_id: reportId,
        ...inquiry
      });
    }
    console.log(`Stored ${inquiries.length} credit inquiries`);

    // Extract negative items
    const negativeItems = extractNegativeItemsFromTextract(textractResult);
    for (const item of negativeItems) {
      await supabase.from('negative_items').upsert({
        report_id: reportId,
        ...item
      });
    }
    console.log(`Stored ${negativeItems.length} negative items`);

    console.log('=== TEXTRACT DATA PARSING COMPLETED ===');
  } catch (parseError) {
    console.error('Parsing error:', parseError);
    throw new Error(`Data parsing failed: ${parseError.message}`);
  }
}

function extractPersonalInfoFromTextract(textractResult: any) {
  const info: any = {};
  const { keyValuePairs, fullText } = textractResult;
  
  // Check key-value pairs first (more accurate)
  for (const pair of keyValuePairs) {
    const key = pair.key.toLowerCase();
    const value = pair.value;
    
    if (key.includes('name') && !info.full_name) {
      info.full_name = value;
    } else if (key.includes('date') && key.includes('birth') && !info.date_of_birth) {
      const dateMatch = value.match(/\d{1,2}\/\d{1,2}\/\d{2,4}/);
      if (dateMatch) info.date_of_birth = formatDate(dateMatch[0]);
    } else if (key.includes('address') && !info.current_address) {
      info.current_address = { street: value };
    } else if (key.includes('ssn') && !info.ssn_partial) {
      info.ssn_partial = value;
    }
  }
  
  // Fallback to text parsing
  if (!info.full_name) {
    const nameMatch = fullText.match(/(?:Name|Consumer Name)[:\s]*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i);
    if (nameMatch) info.full_name = nameMatch[1].trim();
  }
  
  if (!info.date_of_birth) {
    const dobMatch = fullText.match(/(?:Date of Birth|DOB)[:\s]*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
    if (dobMatch) info.date_of_birth = formatDate(dobMatch[1]);
  }
  
  return info;
}

function extractAccountsFromTextract(textractResult: any) {
  const accounts: any[] = [];
  const { tables, fullText } = textractResult;
  
  // Process tables first (most structured data)
  for (const table of tables) {
    if (table.rows.length < 2) continue;
    
    const headers = table.rows[0].map((h: string) => h.toLowerCase());
    
    // Look for account-related tables
    if (headers.some((h: string) => h.includes('account') || h.includes('creditor') || h.includes('balance'))) {
      for (let i = 1; i < table.rows.length; i++) {
        const row = table.rows[i];
        const account = parseAccountFromTableRow(headers, row);
        if (account.creditor_name) {
          accounts.push(account);
        }
      }
    }
  }
  
  // Fallback to text parsing if no table data
  if (accounts.length === 0) {
    const accountPattern = /([A-Z][a-z\s]+(?:Bank|Card|Credit|Loan|Financial))[\s\S]*?(?:Balance[:\s]*\$([0-9,]+))?[\s\S]*?(?:Limit[:\s]*\$([0-9,]+))?/gi;
    let match;
    while ((match = accountPattern.exec(fullText)) !== null) {
      accounts.push({
        creditor_name: match[1].trim(),
        current_balance: match[2] ? parseFloat(match[2].replace(/,/g, '')) : 0,
        credit_limit: match[3] ? parseFloat(match[3].replace(/,/g, '')) : null,
        account_type: determineAccountType(match[1]),
        is_negative: false
      });
    }
  }
  
  return accounts;
}

function parseAccountFromTableRow(headers: string[], row: string[]) {
  const account: any = {
    creditor_name: '',
    account_type: 'Other',
    current_balance: 0,
    is_negative: false
  };
  
  for (let i = 0; i < headers.length && i < row.length; i++) {
    const header = headers[i];
    const value = row[i];
    
    if (header.includes('creditor') || header.includes('name')) {
      account.creditor_name = value;
    } else if (header.includes('balance')) {
      const balanceMatch = value.match(/\$?([0-9,]+)/);
      if (balanceMatch) {
        account.current_balance = parseFloat(balanceMatch[1].replace(/,/g, ''));
      }
    } else if (header.includes('limit')) {
      const limitMatch = value.match(/\$?([0-9,]+)/);
      if (limitMatch) {
        account.credit_limit = parseFloat(limitMatch[1].replace(/,/g, ''));
      }
    } else if (header.includes('account') && header.includes('number')) {
      account.account_number = value;
    } else if (header.includes('status')) {
      account.account_status = value;
    }
  }
  
  if (account.creditor_name) {
    account.account_type = determineAccountType(account.creditor_name);
  }
  
  return account;
}

function extractInquiriesFromTextract(textractResult: any) {
  const inquiries: any[] = [];
  const { tables, fullText } = textractResult;
  
  // Look for inquiry tables
  for (const table of tables) {
    if (table.rows.length < 2) continue;
    
    const headers = table.rows[0].map((h: string) => h.toLowerCase());
    
    if (headers.some((h: string) => h.includes('inquir') || h.includes('request'))) {
      for (let i = 1; i < table.rows.length; i++) {
        const row = table.rows[i];
        const inquiry = parseInquiryFromTableRow(headers, row);
        if (inquiry.inquirer_name) {
          inquiries.push(inquiry);
        }
      }
    }
  }
  
  return inquiries;
}

function parseInquiryFromTableRow(headers: string[], row: string[]) {
  const inquiry: any = {
    inquirer_name: '',
    inquiry_type: 'hard'
  };
  
  for (let i = 0; i < headers.length && i < row.length; i++) {
    const header = headers[i];
    const value = row[i];
    
    if (header.includes('name') || header.includes('company')) {
      inquiry.inquirer_name = value;
    } else if (header.includes('date')) {
      const dateMatch = value.match(/\d{1,2}\/\d{1,2}\/\d{2,4}/);
      if (dateMatch) {
        inquiry.inquiry_date = formatDate(dateMatch[0]);
      }
    } else if (header.includes('type')) {
      inquiry.inquiry_type = value.toLowerCase().includes('soft') ? 'soft' : 'hard';
    }
  }
  
  return inquiry;
}

function extractNegativeItemsFromTextract(textractResult: any) {
  const negativeItems: any[] = [];
  const { fullText } = textractResult;
  
  const collectionPattern = /([A-Z][a-z\s]*Collection[s]?)[\s\S]*?(?:Amount[:\s]*\$?([0-9,]+))?/gi;
  let match;
  while ((match = collectionPattern.exec(fullText)) !== null) {
    negativeItems.push({
      negative_type: 'Collection',
      description: match[1],
      amount: match[2] ? parseFloat(match[2].replace(/,/g, '')) : null
    });
  }
  
  return negativeItems;
}

function determineAccountType(creditorName: string): string {
  const lowerName = creditorName.toLowerCase();
  if (lowerName.includes('credit card') || lowerName.includes('card')) return 'Credit Card';
  if (lowerName.includes('auto') || lowerName.includes('car')) return 'Auto Loan';
  if (lowerName.includes('mortgage')) return 'Mortgage';
  if (lowerName.includes('student')) return 'Student Loan';
  return 'Other';
}

function formatDate(dateStr: string): string | null {
  try {
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
  } catch (e) {
    console.log('Invalid date format:', dateStr);
  }
  return null;
}
