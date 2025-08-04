# PDF Text Extraction System - Deployment Guide

## 🚨 CRITICAL BUG FIXED

The PDF text extraction system has been completely rewritten to fix the 500 errors. The root cause was that the `textract-extract` function was **NOT** using Amazon Textract at all, but instead using a primitive binary extraction method that produced gibberish.

## 🔧 REQUIRED SETUP

### 1. AWS Credentials Setup

You **MUST** set the following environment variables in your Supabase project:

```bash
AWS_ACCESS_KEY_ID=your_aws_access_key_here
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key_here
AWS_REGION=us-east-1  # or your preferred region
```

**To set these in Supabase Dashboard:**
1. Go to your Supabase project dashboard
2. Navigate to Settings → Edge Functions
3. Add the environment variables above
4. Redeploy the functions

### 2. AWS IAM Permissions

Your AWS user/role needs the following permissions for Amazon Textract:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "textract:DetectDocumentText",
                "textract:AnalyzeDocument"
            ],
            "Resource": "*"
        }
    ]
}
```

## 🧪 TESTING PLAN

### Step 1: Verify Environment Variables

Test that AWS credentials are properly set:

```bash
# Test the textract-extract function with a simple call
curl -X POST https://your-project.supabase.co/functions/v1/textract-extract \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-anon-key" \
  -d '{"reportId": "test", "filePath": "test.pdf"}'
```

**Expected Response:**
- If credentials missing: `"Missing AWS credentials: AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set"`
- If credentials valid: Function will attempt to process (may fail on missing file, but won't be a 500 error)

### Step 2: Test with Real PDF

1. Upload a credit report PDF through the dashboard
2. Monitor the console logs for detailed extraction progress
3. Check the database for extracted text

**Expected Flow:**
```
=== AMAZON TEXTRACT FUNCTION START ===
=== VALIDATING AWS CREDENTIALS ===
AWS Access Key ID exists: true
AWS Secret Access Key exists: true
AWS Region: us-east-1
=== DOWNLOADING PDF FILE ===
PDF downloaded successfully, size: XXXXX bytes
=== CALLING AMAZON TEXTRACT ===
✅ AWS Textract response received
=== EXTRACTING TEXT FROM TEXTRACT RESPONSE ===
Found XXX text lines
✅ Extracted text contains credit report keywords
=== STORING IN DATABASE ===
✅ Processing completed successfully
```

### Step 3: Verify Extracted Text Quality

The system now includes text quality validation. Check that extracted text contains:

- ✅ Credit report keywords (credit, account, balance, payment, etc.)
- ✅ Personal information (names, addresses, dates)
- ✅ Account information (creditors, balances, account numbers)
- ❌ No gibberish like `",NvHC ShJhs rrN+f nqC3P -IND! *7byg]"`

## 🔄 FALLBACK SYSTEM

If Amazon Textract fails, the system automatically falls back to:

1. **Enhanced PDF Extraction** - Advanced regex and binary scanning
2. **Process Credit Report** - Basic extraction with structured data parsing

## 📊 MONITORING

### Debug Information

Use the new `PDFDebugService` to monitor extraction health:

```typescript
import { PDFDebugService } from '@/services/PDFDebugService';

// Get extraction health summary
const health = await PDFDebugService.getExtractionHealth();
console.log('Extraction Health:', health);

// Get debug info for specific report
const debugInfo = await PDFDebugService.getExtractionDebugInfo(reportId);
console.log('Debug Info:', debugInfo);

// Test all extraction methods
const testResults = await PDFDebugService.testExtractionMethods(reportId);
console.log('Test Results:', testResults);
```

### Log Monitoring

Monitor these log patterns for issues:

**✅ Success Patterns:**
- `=== AMAZON TEXTRACT FUNCTION START ===`
- `✅ AWS Textract response received`
- `✅ Extracted text contains credit report keywords`

**❌ Error Patterns:**
- `Missing AWS credentials`
- `No text blocks found in Textract response`
- `Insufficient text extracted from PDF via Textract`

## 🚀 DEPLOYMENT STEPS

### 1. Set Environment Variables
```bash
# In Supabase Dashboard → Settings → Edge Functions
AWS_ACCESS_KEY_ID=your_key_here
AWS_SECRET_ACCESS_KEY=your_secret_here
AWS_REGION=us-east-1
```

### 2. Deploy Functions
```bash
# Deploy the updated functions
supabase functions deploy textract-extract
supabase functions deploy enhanced-pdf-extract
```

### 3. Test Upload
1. Upload a credit report PDF
2. Monitor the extraction process
3. Verify extracted text quality
4. Check structured data parsing

## 🔍 TROUBLESHOOTING

### Common Issues

**1. "Missing AWS credentials"**
- Solution: Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in Supabase environment variables

**2. "No text blocks found in Textract response"**
- Solution: Check if PDF is corrupted or password-protected
- Try the enhanced extraction fallback

**3. "Insufficient text extracted"**
- Solution: PDF may not contain readable text (scanned image)
- Consider using OCR preprocessing

**4. "AWS Textract API error"**
- Solution: Check AWS permissions and region settings
- Verify AWS account has Textract access

### Debug Commands

```typescript
// Test extraction methods
const results = await PDFDebugService.testExtractionMethods(reportId);

// Analyze text quality
const quality = PDFDebugService.analyzeTextQuality(extractedText);

// Get extraction health
const health = await PDFDebugService.getExtractionHealth();
```

## 📈 EXPECTED RESULTS

After the fix, you should see:

1. **No more 500 errors** from the textract-extract endpoint
2. **Readable text extraction** instead of gibberish
3. **Proper credit report parsing** with structured data
4. **Fallback system** working when Textract fails
5. **Comprehensive logging** for debugging

## 🎯 SUCCESS METRICS

- ✅ 0% 500 errors on PDF uploads
- ✅ >90% successful text extractions
- ✅ Extracted text contains credit report keywords
- ✅ Structured data (accounts, inquiries, negative items) properly parsed
- ✅ Fallback system working for edge cases

## 📞 SUPPORT

If you encounter issues:

1. Check the console logs for detailed error messages
2. Use the `PDFDebugService` to analyze the problem
3. Verify AWS credentials and permissions
4. Test with different PDF formats
5. Check the fallback extraction methods

The system now provides comprehensive error handling and multiple extraction methods to ensure reliable PDF processing.