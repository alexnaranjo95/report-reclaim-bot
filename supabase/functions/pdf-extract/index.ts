import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { reportId, filePath } = await req.json();

    if (!reportId || !filePath) {
      throw new Error('Missing required parameters: reportId or filePath');
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`Starting PDF extraction for report ${reportId}`);

    // Update status to processing
    await supabase
      .from('credit_reports')
      .update({ extraction_status: 'processing' })
      .eq('id', reportId);

    // Download the PDF file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('credit-reports')
      .download(filePath);

    if (downloadError) {
      throw new Error(`Failed to download file: ${downloadError.message}`);
    }

    // Convert file to ArrayBuffer for processing
    const arrayBuffer = await fileData.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Extract text from PDF using simple text extraction
    const extractedText = await extractTextFromPDF(uint8Array);

    if (!extractedText || extractedText.length < 100) {
      throw new Error('Failed to extract meaningful text from PDF');
    }

    console.log(`Extracted ${extractedText.length} characters of text`);

    // Update credit report with extracted text
    await supabase
      .from('credit_reports')
      .update({ 
        raw_text: extractedText,
        extraction_status: 'completed' 
      })
      .eq('id', reportId);

    // Parse and store structured data
    await parseAndStoreData(supabase, reportId, extractedText);

    console.log(`Successfully processed report ${reportId}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'PDF processed successfully',
        textLength: extractedText.length 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('PDF extraction error:', error);

    // Update status to failed if we have a reportId
    const { reportId } = await req.json().catch(() => ({}));
    if (reportId) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      await supabase
        .from('credit_reports')
        .update({ 
          extraction_status: 'failed',
          processing_errors: error.message 
        })
        .eq('id', reportId);
    }

    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200  // Return 200 to avoid triggering error handlers
      }
    );
  }
});

async function extractTextFromPDF(uint8Array: Uint8Array): Promise<string> {
  try {
    // Simple PDF text extraction using basic parsing
    const pdfText = new TextDecoder().decode(uint8Array);
    
    // Extract text content using regex patterns for PDF objects
    const textObjects: string[] = [];
    
    // Look for text objects in PDF structure
    const btRegex = /BT\s+(.*?)\s+ET/gs;
    let match;
    
    while ((match = btRegex.exec(pdfText)) !== null) {
      const textBlock = match[1];
      // Extract text from Tj and TJ operators
      const tjRegex = /\((.*?)\)\s*Tj/g;
      const arrayRegex = /\[(.*?)\]\s*TJ/g;
      
      let textMatch;
      while ((textMatch = tjRegex.exec(textBlock)) !== null) {
        textObjects.push(textMatch[1]);
      }
      
      while ((textMatch = arrayRegex.exec(textBlock)) !== null) {
        // Parse array format and extract strings
        const arrayContent = textMatch[1];
        const stringRegex = /\(([^)]*)\)/g;
        let stringMatch;
        while ((stringMatch = stringRegex.exec(arrayContent)) !== null) {
          textObjects.push(stringMatch[1]);
        }
      }
    }
    
    // Fallback: Look for readable ASCII text
    if (textObjects.length === 0) {
      const readableText = pdfText.replace(/[^\x20-\x7E\n\r]/g, ' ')
        .split('\n')
        .filter(line => line.trim().length > 3 && /[a-zA-Z]/.test(line))
        .join('\n');
      
      if (readableText.length > 100) {
        return readableText;
      }
    }
    
    // Clean and join extracted text
    const finalText = textObjects
      .map(text => text.replace(/\\[rn]/g, '\n').replace(/\\\\/g, '\\'))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    if (finalText.length < 100) {
      throw new Error('Insufficient text extracted from PDF');
    }
    
    return finalText;
    
  } catch (error) {
    console.error('Text extraction error:', error);
    throw new Error(`PDF text extraction failed: ${error.message}`);
  }
}

async function parseAndStoreData(supabase: any, reportId: string, text: string) {
  try {
    console.log('Starting data parsing and storage...');
    
    // Detect bureau name
    let bureauName = 'Unknown';
    if (text.toLowerCase().includes('experian')) bureauName = 'Experian';
    else if (text.toLowerCase().includes('equifax')) bureauName = 'Equifax';
    else if (text.toLowerCase().includes('transunion')) bureauName = 'TransUnion';
    
    // Update bureau name
    await supabase
      .from('credit_reports')
      .update({ bureau_name: bureauName })
      .eq('id', reportId);

    // Extract and store personal information
    const personalInfo = extractPersonalInfo(text);
    if (personalInfo.full_name || personalInfo.ssn_partial) {
      await supabase
        .from('personal_information')
        .upsert({
          report_id: reportId,
          ...personalInfo
        });
    }

    // Extract and store credit accounts
    const accounts = extractCreditAccounts(text);
    for (const account of accounts) {
      await supabase
        .from('credit_accounts')
        .insert({
          report_id: reportId,
          ...account
        });
    }

    // Extract and store credit inquiries
    const inquiries = extractCreditInquiries(text);
    for (const inquiry of inquiries) {
      await supabase
        .from('credit_inquiries')
        .insert({
          report_id: reportId,
          ...inquiry
        });
    }

    // Extract and store negative items
    const negativeItems = extractNegativeItems(text);
    for (const item of negativeItems) {
      await supabase
        .from('negative_items')
        .insert({
          report_id: reportId,
          ...item
        });
    }

    console.log(`Parsed and stored: ${accounts.length} accounts, ${inquiries.length} inquiries, ${negativeItems.length} negative items`);

  } catch (error) {
    console.error('Data parsing error:', error);
    throw error;
  }
}

function extractPersonalInfo(text: string) {
  const info: any = {};
  
  // Extract name (look for common patterns)
  const nameMatch = text.match(/(?:Name|BORROWER|Consumer)[\s:]+([A-Z][a-z]+ [A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
  if (nameMatch) {
    info.full_name = nameMatch[1].trim();
  }
  
  // Extract partial SSN
  const ssnMatch = text.match(/SSN[\s:]*(\*{3,5}\d{4}|\d{3}-\d{2}-\*{4})/i);
  if (ssnMatch) {
    info.ssn_partial = ssnMatch[1];
  }
  
  // Extract date of birth
  const dobMatch = text.match(/(?:DOB|Date of Birth|Birth Date)[\s:]+(\d{1,2}\/\d{1,2}\/\d{4})/i);
  if (dobMatch) {
    info.date_of_birth = new Date(dobMatch[1]).toISOString().split('T')[0];
  }
  
  return info;
}

function extractCreditAccounts(text: string): any[] {
  const accounts: any[] = [];
  
  // Simple pattern matching for common creditors and account info
  const creditorPatterns = [
    /(?:BANK OF AMERICA|BOA|CHASE|CAPITAL ONE|DISCOVER|AMEX|AMERICAN EXPRESS|WELLS FARGO|CITI)/gi
  ];
  
  creditorPatterns.forEach(pattern => {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const context = text.slice(Math.max(0, match.index! - 200), match.index! + 200);
      
      // Extract account details from context
      const balanceMatch = context.match(/(?:Balance|Bal)[\s:$]*(\d{1,3}(?:,\d{3})*)/i);
      const limitMatch = context.match(/(?:Limit|Credit Limit)[\s:$]*(\d{1,3}(?:,\d{3})*)/i);
      
      accounts.push({
        creditor_name: match[0],
        account_type: determineAccountType(match[0]),
        current_balance: balanceMatch ? parseInt(balanceMatch[1].replace(/,/g, '')) : 0,
        credit_limit: limitMatch ? parseInt(limitMatch[1].replace(/,/g, '')) : null,
        payment_status: 'Current', // Default
        account_status: 'Open',    // Default
        is_negative: false         // Default
      });
    }
  });
  
  return accounts.slice(0, 20); // Limit to prevent spam
}

function extractCreditInquiries(text: string): any[] {
  const inquiries: any[] = [];
  
  // Look for inquiry patterns
  const inquiryPattern = /(?:inquiry|inq)[\s]*(?:by|from)?[\s]*([A-Z][A-Z\s&]+)(?:on|date)?[\s]*(\d{1,2}\/\d{1,2}\/\d{4})?/gi;
  const matches = text.matchAll(inquiryPattern);
  
  for (const match of matches) {
    if (match[1] && match[1].length > 3) {
      inquiries.push({
        inquirer_name: match[1].trim(),
        inquiry_date: match[2] ? new Date(match[2]).toISOString().split('T')[0] : null,
        inquiry_type: 'Hard'
      });
    }
  }
  
  return inquiries.slice(0, 20);
}

function extractNegativeItems(text: string): any[] {
  const negativeItems: any[] = [];
  
  // Look for negative item patterns
  const negativePatterns = [
    /(?:late payment|past due|delinquent|collection|charge[- ]?off|bankruptcy)/gi,
    /(?:30|60|90|120)\s*days?\s*late/gi
  ];
  
  negativePatterns.forEach(pattern => {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const context = text.slice(Math.max(0, match.index! - 100), match.index! + 100);
      const amountMatch = context.match(/\$(\d{1,3}(?:,\d{3})*)/);
      
      negativeItems.push({
        negative_type: match[0].toLowerCase().includes('late') ? 'Late Payment' : 
                      match[0].toLowerCase().includes('collection') ? 'Collection' :
                      match[0].toLowerCase().includes('charge') ? 'Charge Off' : 'Other',
        description: match[0],
        amount: amountMatch ? parseInt(amountMatch[1].replace(/,/g, '')) : 0,
        severity_score: 7, // Default medium severity
        dispute_eligible: true
      });
    }
  });
  
  return negativeItems.slice(0, 20);
}

function determineAccountType(creditorName: string): string {
  const name = creditorName.toLowerCase();
  if (name.includes('amex') || name.includes('american express')) return 'Credit Card';
  if (name.includes('discover')) return 'Credit Card';
  if (name.includes('visa') || name.includes('mastercard')) return 'Credit Card';
  if (name.includes('mortgage') || name.includes('home loan')) return 'Mortgage';
  if (name.includes('auto') || name.includes('car')) return 'Auto Loan';
  if (name.includes('student')) return 'Student Loan';
  return 'Credit Card'; // Default
}