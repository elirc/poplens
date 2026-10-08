import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { env } from "@/env";
import type { StorageAdapter } from "../types";

let client: S3Client | null = null;

function s3(): S3Client {
  if (!client) {
    if (!env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
      throw new Error("S3 credentials not set (S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY)");
    }
    client = new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT || undefined,
      forcePathStyle: !!env.S3_ENDPOINT,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      },
    });
  }
  return client;
}

/** Real driver: any S3-compatible object store. */
export const s3StorageAdapter: StorageAdapter = {
  async put(key, data, contentType) {
    await s3().send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: key,
        Body: data,
        ContentType: contentType,
      }),
    );
  },
  async get(key) {
    try {
      const res = await s3().send(
        new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }),
      );
      const bytes = await res.Body?.transformToByteArray();
      return bytes ? Buffer.from(bytes) : null;
    } catch (e) {
      if ((e as { name?: string }).name === "NoSuchKey") return null;
      throw e;
    }
  },
  async exists(key) {
    try {
      await s3().send(
        new HeadObjectCommand({ Bucket: env.S3_BUCKET, Key: key }),
      );
      return true;
    } catch {
      return false;
    }
  },
  async delete(key) {
    await s3().send(
      new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }),
    );
  },
};
