import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  console.log("=== TEST PDF EXTRACT DIAGNOSTIC START ===")
  console.log("Function called at:", new Date().toISOString())
  console.log("Request method:", req.method)
  console.log("Request headers:", Object.fromEntries(req.headers.entries()))
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log("CORS preflight request handled")
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // STEP A: Test request parsing
    console.log("STEP A: Testing request parsing...")
    const requestBody = await req.json()
    console.log("Request body received:", {
      keys: Object.keys(requestBody),
      reportId: requestBody.reportId ? "Present" : "Missing",
      filePath: requestBody.filePath ? "Present" : "Missing"
    })

    const { reportId, filePath } = requestBody
    
    if (!reportId || !filePath) {
      throw new Error(`Missing required fields: reportId=${!!reportId}, filePath=${!!filePath}`)
    }

    // STEP B: Test Supabase client creation
    console.log("STEP B: Testing Supabase client...")
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    console.log("Supabase URL:", supabaseUrl ? "Present" : "Missing")
    console.log("Supabase Key:", supabaseKey ? "Present (length: " + supabaseKey.length + ")" : "Missing")
    
    const supabase = createClient(supabaseUrl, supabaseKey)

    // STEP C: Test file download from storage
    console.log("STEP C: Testing file download...")
    console.log("Attempting to download file from path:", filePath)
    
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('credit-reports')
      .download(filePath)

    if (downloadError) {
      console.error("File download error:", downloadError)
      throw new Error(`Failed to download file: ${downloadError.message}`)
    }

    if (!fileData) {
      throw new Error("File data is null")
    }

    console.log("File downloaded successfully:")
    console.log("- File size:", fileData.size)
    console.log("- File type:", fileData.type)

    // STEP D: Test file reading
    console.log("STEP D: Testing file reading...")
    const bytes = new Uint8Array(await fileData.arrayBuffer())
    console.log("- Bytes array length:", bytes.length)
    console.log("- First 10 bytes:", Array.from(bytes.slice(0, 10)))
    
    // Check if it's actually a PDF
    const pdfHeader = bytes.slice(0, 4)
    const isPDF = pdfHeader[0] === 0x25 && pdfHeader[1] === 0x50 && pdfHeader[2] === 0x44 && pdfHeader[3] === 0x46
    console.log("- Is valid PDF header:", isPDF)
    console.log("- PDF header bytes:", Array.from(pdfHeader))

    // STEP E: Test base64 conversion
    console.log("STEP E: Testing base64 conversion...")
    const base64String = btoa(String.fromCharCode(...bytes))
    console.log("- Base64 string length:", base64String.length)
    console.log("- First 100 chars:", base64String.substring(0, 100))
    console.log("- Last 50 chars:", base64String.substring(base64String.length - 50))

    // STEP F: Test AWS credentials
    console.log("STEP F: Testing AWS credentials...")
    const awsAccessKey = Deno.env.get('AWS_ACCESS_KEY_ID')
    const awsSecretKey = Deno.env.get('AWS_SECRET_ACCESS_KEY')
    const awsRegion = Deno.env.get('AWS_REGION')
    
    console.log("AWS Access Key:", awsAccessKey ? "Present (length: " + awsAccessKey.length + ")" : "Missing")
    console.log("AWS Secret Key:", awsSecretKey ? "Present (length: " + awsSecretKey.length + ")" : "Missing")
    console.log("AWS Region:", awsRegion || "Missing")

    if (!awsAccessKey || !awsSecretKey || !awsRegion) {
      throw new Error("Missing AWS credentials")
    }

    // STEP G: Test basic AWS request format (without actually calling Textract yet)
    console.log("STEP G: Testing AWS request format...")
    const timestamp = new Date().toISOString().replace(/[:\-]|\.\d{3}/g, '')
    console.log("- AWS timestamp:", timestamp)
    
    const payload = JSON.stringify({
      Document: {
        Bytes: base64String
      },
      FeatureTypes: ['TABLES', 'FORMS']
    })
    
    console.log("- Payload size:", payload.length)
    console.log("- Payload structure valid:", payload.includes('"Document"') && payload.includes('"Bytes"'))

    // Update report status to show we reached this point
    console.log("STEP H: Updating report status...")
    const { error: updateError } = await supabase
      .from('credit_reports')
      .update({ 
        extraction_status: 'diagnostic_complete',
        processing_errors: 'Diagnostic test completed successfully'
      })
      .eq('id', reportId)

    if (updateError) {
      console.error("Failed to update report:", updateError)
    } else {
      console.log("Report status updated successfully")
    }

    console.log("=== TEST PDF EXTRACT DIAGNOSTIC END ===")
    
    return new Response(
      JSON.stringify({
        success: true,
        message: "Diagnostic test completed",
        diagnostics: {
          fileSize: fileData.size,
          fileType: fileData.type,
          isPDF: isPDF,
          base64Length: base64String.length,
          awsCredentials: !!awsAccessKey && !!awsSecretKey && !!awsRegion,
          payloadSize: payload.length
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )

  } catch (error) {
    console.error("=== DIAGNOSTIC ERROR ===")
    console.error("Error type:", error.constructor.name)
    console.error("Error message:", error.message)
    console.error("Error stack:", error.stack)
    console.error("=== DIAGNOSTIC ERROR END ===")

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        stack: error.stack
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    )
  }
})