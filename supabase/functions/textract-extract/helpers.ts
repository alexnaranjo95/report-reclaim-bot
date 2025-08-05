/**
 * Helper functions for PDF text extraction and quality assessment
 */

/**
 * Basic PDF.js extraction as final fallback
 */
export async function basicPDFExtraction(pdfBytes: Uint8Array): Promise<string> {
  console.log('🔄 Attempting basic PDF.js text extraction...');
  
  try {
    const { getDocument } = await import('pdfjs-dist');
    const pdf = await getDocument(pdfBytes).promise;
    
    let fullText = '';
    
    for (let i = 1; i <= pdf.numPages; i++) {
      console.log(`📄 Extracting text from page ${i}/${pdf.numPages}`);
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');
      
      fullText += pageText + '\n\n';
    }
    
    console.log(`✅ Basic PDF extraction completed: ${fullText.length} characters`);
    return fullText;
    
  } catch (error) {
    console.error('❌ Basic PDF extraction failed:', error);
    throw error;
  }
}

/**
 * Assess text quality to determine if extraction was successful
 */
export function assessTextQuality(text: string): number {
  if (!text || text.length < 100) return 0;
  
  let score = 0;
  const length = text.length;
  
  // Check for readable characters (letters, numbers, spaces, punctuation)
  const readableChars = (text.match(/[a-zA-Z0-9\s.,!?;:\-()]/g) || []).length;
  const readableRatio = readableChars / length;
  score += readableRatio * 40;
  
  // Check for credit-related keywords
  const creditKeywords = [
    'credit', 'report', 'account', 'balance', 'payment', 'history',
    'inquiry', 'experian', 'equifax', 'transunion', 'fico', 'score',
    'creditor', 'tradeline', 'collection', 'dispute', 'address',
    'social security', 'date of birth', 'ssn'
  ];
  
  const foundKeywords = creditKeywords.filter(keyword => 
    text.toLowerCase().includes(keyword.toLowerCase())
  ).length;
  
  score += (foundKeywords / creditKeywords.length) * 30;
  
  // Check for structured data patterns
  const hasSSN = /\d{3}-?\d{2}-?\d{4}/.test(text);
  const hasAccount = /account|acct/i.test(text);
  const hasAmount = /\$\d+|\d+\.\d{2}/.test(text);
  const hasDate = /\d{1,2}\/\d{1,2}\/\d{2,4}|\d{2}-\d{2}-\d{4}/.test(text);
  
  if (hasSSN) score += 7.5;
  if (hasAccount) score += 7.5;
  if (hasAmount) score += 7.5;
  if (hasDate) score += 7.5;
  
  // Penalize for too many special characters (corrupted text)
  const specialChars = (text.match(/[^\w\s.,!?;:\-()]/g) || []).length;
  const specialRatio = specialChars / length;
  if (specialRatio > 0.3) score -= 20;
  
  return Math.max(0, Math.min(100, score));
}

/**
 * Enhanced content validation with detailed metrics
 */
export function validateExtractedContent(text: string, extractionMethod: string) {
  const length = text.length;
  
  // Count credit-related keywords with fuzzy matching
  const creditPatterns = [
    /credit\s*report/i,
    /experian|equifax|transunion/i,
    /account\s*number|acct\s*#?/i,
    /current\s*balance|payment\s*history/i,
    /creditor|lender/i,
    /inquiry|inquiries/i,
    /social\s*security|ssn/i,
    /date\s*of\s*birth|dob/i,
    /address|phone/i,
    /fico|credit\s*score/i,
    /tradeline|trade\s*line/i,
    /collection|charge.?off/i
  ];
  
  const creditKeywords = creditPatterns.reduce((count, pattern) => {
    return count + (text.match(pattern) || []).length;
  }, 0);
  
  // Calculate quality ratios
  const alphabeticChars = (text.match(/[a-zA-Z]/g) || []).length;
  const alphanumericChars = (text.match(/[a-zA-Z0-9]/g) || []).length;
  const qualityRatio = alphanumericChars / length;
  
  // Detection flags
  const isIdentityIQ = /identityiq|identity\s*iq/i.test(text);
  const hasMozillaMarkers = /mozilla/i.test(text);
  const isLargeDocument = length > 50000;
  const hasPDFMetadata = /endstream|endobj|stream/i.test(text) && length < 50000;
  
  // Determine content type
  let detectedType = 'unknown';
  if (creditKeywords > 5) detectedType = 'credit_report';
  else if (creditKeywords > 2) detectedType = 'possible_credit_report';
  else if (hasPDFMetadata) detectedType = 'pdf_metadata';
  
  // Overall assessment
  const hasReasonableContent = (
    creditKeywords > 0 &&
    qualityRatio > 0.2 &&
    !hasPDFMetadata
  ) || (
    isLargeDocument && qualityRatio > 0.15
  ) || (
    isIdentityIQ && length > 10000
  );
  
  return {
    creditKeywords,
    qualityRatio,
    alphabeticRatio: alphabeticChars / length,
    hasReasonableContent,
    detectedType,
    isIdentityIQ,
    hasMozillaMarkers,
    isLargeDocument,
    hasPDFMetadata
  };
}