const { default: axios } = require("axios");
const aws = require("aws-sdk");

require("dotenv").config();

// S3 Bucket configuration
aws.config.update({
  endpoint: process.env.ENDPOINT,
  accessKeyId: process.env.ACCESS_KEY_ID,
  secretAccessKey: process.env.SECRET_ACCESS_KEY,
  signatureVersion: "v4",
});

const s3 = new aws.S3();

// minimum part size 5MB
const minimumInitialChunkSize = 5242880;

/**
 *
 * @param {string} fileUrl
 * @returns {string} - The file access URL
 */
const uploader = async (fileUrl) => {
  const fileName = `${Date.now()}`;

  const multipartUpload = await s3
    .createMultipartUpload({
      Bucket: process.env.BUCKET_NAME,
      Key: fileName,
    })
    .promise();

  try {
    const partPromises = [];
    let partNumber = 1;

    // set chunk trackers
    let accumulatedChunks = [];
    let accumulatedChunkLength = 0;
    let totalLength = 0;

    // initial file fetch
    const response = await axios({
      method: "get",
      url: fileUrl,
      responseType: "stream",
    });

    return new Promise(async (resolve, reject) => {
      // capture data chunks
      response.data.on("data", (chunk) => {
        // accummulate chunk
        accumulatedChunks.push(chunk);
        accumulatedChunkLength += chunk.length;
        totalLength += chunk.length;

        // upload accummulated chunk at minimum part size
        if (accumulatedChunkLength >= minimumInitialChunkSize) {
          console.log(
            `uploading ${accumulatedChunks.length} chunks size: ${accumulatedChunkLength}`
          );

          const uploadPartPromise = s3
            .uploadPart({
              Bucket: process.env.BUCKET_NAME,
              Key: fileName,
              PartNumber: partNumber,
              UploadId: multipartUpload.UploadId,
              Body: Buffer.concat(accumulatedChunks),
            })
            .promise();

          partPromises.push(uploadPartPromise);

          // reset chunk tracker
          partNumber++;
          accumulatedChunks = [];
          accumulatedChunkLength = 0;
        }
      });

      // end of file fetch
      response.data.on("end", async () => {
        if (totalLength < minimumInitialChunkSize) {
          // files less than 5MB upload

          s3.upload(
            {
              Bucket: process.env.BUCKET_NAME,
              Key: fileName,
              Body: Buffer.concat(accumulatedChunks),
            },
            (err, data) => {
              if (err) {
                resolve("");
              } else {
                resolve(
                  `${process.env.ACCESS_URL}/${process.env.BUCKET_NAME}/${data.Key}`
                );
              }
            }
          );
        } else {
          if (accumulatedChunkLength) {
            console.log(
              `uploading last part ${accumulatedChunks.length} chunks size: ${accumulatedChunkLength}`
            );

            const uploadPartPromise = s3
              .uploadPart({
                Bucket: process.env.BUCKET_NAME,
                Key: fileName,
                PartNumber: partNumber,
                UploadId: multipartUpload.UploadId,
                Body: Buffer.concat(accumulatedChunks),
              })
              .promise();

            partPromises.push(uploadPartPromise);
          }

          // ensure all chunk upload are complete
          await Promise.all(partPromises);

          // pull all chunk parts
          const parts = await s3
            .listParts({
              Bucket: process.env.BUCKET_NAME,
              Key: fileName,
              UploadId: multipartUpload.UploadId,
            })
            .promise();

          // complete file upload
          await s3
            .completeMultipartUpload({
              Bucket: process.env.BUCKET_NAME,
              Key: fileName,
              MultipartUpload: {
                Parts: parts.Parts.map((part) => ({
                  ETag: part.ETag,
                  PartNumber: part.PartNumber,
                })),
              },
              UploadId: multipartUpload.UploadId,
            })
            .promise();

          resolve(`${process.env.ACCESS_URL}/${multipartUpload.Key}`);
        }
      });
    });
  } catch (error) {
    return "";
  }
};

module.exports = uploader;
