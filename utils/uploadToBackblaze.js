const B2 = require("backblaze-b2");

const applicationKeyId = "005d9f00d16e3ab0000000001";
const applicationKey = "K00565ncxQxMwU30n+xNn2v+UnMSbMI";
const bucketId = "8d291fe010fd01e69eb30a1b";
const bucketName = "production-development";

async function uploadToBackblaze(fileBuffer, originalName, folder = "uploads") {
  console.log(`🚀 [B2 Start]: Preparing upload for "${originalName}" into folder "${folder}"`);

  try {
    const b2 = new B2({
      applicationKeyId,
      applicationKey,
    });

    // 1. Authorization
    console.log("🔑 [B2 Step 1]: Authorizing...");
    const authResponse = await b2.authorize();
    console.log("✅ [B2 Step 1 Success]: Authorized. Allowed actions:", authResponse.data.allowed.capabilities);

    // 2. Get Upload URL
    console.log("🌐 [B2 Step 2]: Getting Upload URL...");
    const { data: uploadData } = await b2.getUploadUrl({
      bucketId,
    });
    console.log("✅ [B2 Step 2 Success]: Received Upload URL and Token.");

    // 3. File Naming logic
    const timestamp = Date.now();
    const safeName = originalName.replace(/\s+/g, "_");
    const fileName = `${folder}/${timestamp}_${safeName}`;
    console.log(`📝 [B2 Logic]: Final FileName will be: ${fileName}`);

    // 4. Actual Upload
    console.log(`📤 [B2 Step 3]: Uploading ${fileBuffer.length} bytes...`);
    const { data: uploadedData } = await b2.uploadFile({
      uploadUrl: uploadData.uploadUrl,
      uploadAuthToken: uploadData.authorizationToken,
      fileName,
      data: fileBuffer,
    });

    const finalUrl = `https://f005.backblazeb2.com/file/${bucketName}/${uploadedData.fileName}`;
    console.log("🎯 [B2 Upload Complete]: Public URL:", finalUrl);

    return finalUrl;

  } catch (error) {
    // Detailed Error Logging
    console.error("❌ [B2 Fatal Error]:");
    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("B2 Error Code:", error.response.data.code);
      console.error("B2 Error Message:", error.response.data.message);
      console.error("Full Data:", JSON.stringify(error.response.data, null, 2));
    } else {
      console.error("Message:", error.message);
      console.error("Stack:", error.stack);
    }
    
    throw new Error(`Backblaze Upload failed: ${error.message}`);
  }
}

module.exports = {
  uploadToBackblaze,
};