const B2 = require("backblaze-b2");

const applicationKeyId = "005d9f00d16e3ab0000000001";
const applicationKey = "K00565ncxQxMwU30n+xNn2v+UnMSbMI";
const bucketId = "8d291fe010fd01e69eb30a1b";
const bucketName = "production-development";

async function uploadToBackblaze(fileBuffer, originalName, folder = "uploads") {
  try {
    const b2 = new B2({
      applicationKeyId,
      applicationKey,
    });

    await b2.authorize();

    const { data: uploadData } = await b2.getUploadUrl({
      bucketId,
    });

    const timestamp = Date.now();
    const safeName = originalName.replace(/\s+/g, "_");
    const fileName = `${folder}/${timestamp}_${safeName}`;

    const { data: uploadedData } = await b2.uploadFile({
      uploadUrl: uploadData.uploadUrl,
      uploadAuthToken: uploadData.authorizationToken,
      fileName,
      data: fileBuffer,
    });

    return `https://f005.backblazeb2.com/file/${bucketName}/${uploadedData.fileName}`;
  } catch (error) {
    throw new Error("Failed to upload file to Backblaze B2");
  }
}

module.exports = {
  uploadToBackblaze,
};
