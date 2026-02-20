import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

/**
 * DigitalOcean Spaces client (S3-compatible)
 *
 * Setup:
 * 1. Create a Space in DigitalOcean: https://cloud.digitalocean.com/spaces
 * 2. Generate API keys: https://cloud.digitalocean.com/account/api/spaces
 * 3. Add to .env.local:
 *    DO_SPACES_REGION=nyc3 (or your region: nyc3, sfo3, sgp1, fra1, ams3)
 *    DO_SPACES_BUCKET=your-bucket-name
 *    DO_SPACES_KEY=your-access-key
 *    DO_SPACES_SECRET=your-secret-key
 *    DO_SPACES_ENDPOINT=https://nyc3.digitaloceanspaces.com (match your region)
 */

let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (s3Client) return s3Client;

  const region = process.env.DO_SPACES_REGION;
  const endpoint = process.env.DO_SPACES_ENDPOINT;
  const accessKeyId = process.env.DO_SPACES_KEY;
  const secretAccessKey = process.env.DO_SPACES_SECRET;

  if (!region || !endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "DigitalOcean Spaces not configured. Please set DO_SPACES_REGION, DO_SPACES_ENDPOINT, DO_SPACES_KEY, and DO_SPACES_SECRET in your environment."
    );
  }

  s3Client = new S3Client({
    region,
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  return s3Client;
}

/**
 * Upload a file to DigitalOcean Spaces
 * Returns the public URL of the uploaded file
 */
export async function uploadToSpaces(
  buffer: Buffer,
  key: string,
  contentType: string = "image/jpeg"
): Promise<string> {
  const client = getS3Client();
  const bucket = process.env.DO_SPACES_BUCKET;

  if (!bucket) {
    throw new Error("DO_SPACES_BUCKET not configured");
  }

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    ACL: "public-read", // Make images publicly accessible
  });

  await client.send(command);

  // Return the public URL
  const endpoint = process.env.DO_SPACES_ENDPOINT!;
  const publicUrl = `${endpoint}/${bucket}/${key}`;

  return publicUrl;
}

/**
 * Download an image from a URL and upload it to Spaces
 * Returns the permanent Spaces URL
 */
export async function downloadAndUploadImage(
  imageUrl: string,
  destinationKey: string
): Promise<string> {
  // Download the image
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Determine content type from response or default to jpeg
  const contentType = response.headers.get("content-type") || "image/jpeg";

  // Upload to Spaces
  return uploadToSpaces(buffer, destinationKey, contentType);
}

/**
 * Generate a unique key for an image
 */
export function generateImageKey(orgId: number, prefix: string = "creatives"): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  return `${prefix}/${orgId}/${timestamp}-${random}.jpg`;
}
