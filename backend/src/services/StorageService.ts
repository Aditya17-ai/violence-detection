import AWS from 'aws-sdk';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { createError } from '@/middleware/errorHandler';
import { FileSystemUtils } from '@/utils/fileSystem';

export interface UploadResult {
  key: string;
  url: string;
  bucket: string;
  size: number;
  etag: string;
}

export interface DownloadResult {
  buffer: Buffer;
  contentType: string;
  contentLength: number;
}

export class StorageService {
  private s3: AWS.S3;
  private bucket: string;
  private region: string;

  constructor() {
    this.region = process.env.AWS_REGION || 'us-east-1';
    this.bucket = process.env.S3_BUCKET_NAME || 'violence-detection-videos';

    // Configure AWS SDK
    AWS.config.update({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: this.region,
    });

    this.s3 = new AWS.S3({
      apiVersion: '2006-03-01',
      signatureVersion: 'v4',
    });
  }

  /**
   * Upload file to S3
   */
  async uploadFile(
    filePath: string,
    originalName: string,
    contentType?: string
  ): Promise<UploadResult> {
    try {
      // Generate unique key
      const extension = path.extname(originalName);
      const key = `videos/${uuidv4()}${extension}`;

      // Read file
      const fileBuffer = await fs.readFile(filePath);
      const fileSize = fileBuffer.length;

      // Determine content type
      const mimeType = contentType || FileSystemUtils.getMimeType(originalName);

      // Upload parameters
      const uploadParams: AWS.S3.PutObjectRequest = {
        Bucket: this.bucket,
        Key: key,
        Body: fileBuffer,
        ContentType: mimeType,
        ContentLength: fileSize,
        Metadata: {
          originalName: originalName,
          uploadedAt: new Date().toISOString(),
        },
        ServerSideEncryption: 'AES256',
      };

      // Upload to S3
      const result = await this.s3.upload(uploadParams).promise();

      return {
        key: result.Key!,
        url: result.Location!,
        bucket: result.Bucket!,
        size: fileSize,
        etag: result.ETag!,
      };
    } catch (error) {
      console.error('S3 upload error:', error);
      throw createError(`Failed to upload file to cloud storage: ${error}`, 500);
    }
  }

  /**
   * Download file from S3
   */
  async downloadFile(key: string): Promise<DownloadResult> {
    try {
      const params: AWS.S3.GetObjectRequest = {
        Bucket: this.bucket,
        Key: key,
      };

      const result = await this.s3.getObject(params).promise();

      return {
        buffer: result.Body as Buffer,
        contentType: result.ContentType || 'application/octet-stream',
        contentLength: result.ContentLength || 0,
      };
    } catch (error) {
      console.error('S3 download error:', error);
      throw createError(`Failed to download file from cloud storage: ${error}`, 500);
    }
  }

  /**
   * Delete file from S3
   */
  async deleteFile(key: string): Promise<boolean> {
    try {
      const params: AWS.S3.DeleteObjectRequest = {
        Bucket: this.bucket,
        Key: key,
      };

      await this.s3.deleteObject(params).promise();
      return true;
    } catch (error) {
      console.error('S3 delete error:', error);
      return false;
    }
  }

  /**
   * Generate presigned URL for direct upload
   */
  async generatePresignedUploadUrl(
    originalName: string,
    contentType: string,
    expiresIn: number = 3600
  ): Promise<{ url: string; key: string; fields: Record<string, string> }> {
    try {
      const extension = path.extname(originalName);
      const key = `videos/${uuidv4()}${extension}`;

      const params = {
        Bucket: this.bucket,
        Key: key,
        Expires: expiresIn,
        ContentType: contentType,
        Conditions: [
          ['content-length-range', 0, parseInt(process.env.MAX_FILE_SIZE || '500000000')],
          ['starts-with', '$Content-Type', 'video/'],
        ],
      };

      const presignedPost = await new Promise<AWS.S3.PresignedPost>((resolve, reject) => {
        this.s3.createPresignedPost(params, (err, data) => {
          if (err) reject(err);
          else resolve(data);
        });
      });

      return {
        url: presignedPost.url,
        key: key,
        fields: presignedPost.fields,
      };
    } catch (error) {
      console.error('Presigned URL generation error:', error);
      throw createError(`Failed to generate upload URL: ${error}`, 500);
    }
  }

  /**
   * Generate presigned URL for download
   */
  async generatePresignedDownloadUrl(key: string, expiresIn: number = 3600): Promise<string> {
    try {
      const params = {
        Bucket: this.bucket,
        Key: key,
        Expires: expiresIn,
      };

      return await this.s3.getSignedUrlPromise('getObject', params);
    } catch (error) {
      console.error('Presigned download URL generation error:', error);
      throw createError(`Failed to generate download URL: ${error}`, 500);
    }
  }

  /**
   * Check if file exists in S3
   */
  async fileExists(key: string): Promise<boolean> {
    try {
      const params: AWS.S3.HeadObjectRequest = {
        Bucket: this.bucket,
        Key: key,
      };

      await this.s3.headObject(params).promise();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get file metadata
   */
  async getFileMetadata(key: string): Promise<AWS.S3.HeadObjectOutput | null> {
    try {
      const params: AWS.S3.HeadObjectRequest = {
        Bucket: this.bucket,
        Key: key,
      };

      return await this.s3.headObject(params).promise();
    } catch (error) {
      return null;
    }
  }

  /**
   * List files with prefix
   */
  async listFiles(prefix: string = 'videos/', maxKeys: number = 1000): Promise<AWS.S3.Object[]> {
    try {
      const params: AWS.S3.ListObjectsV2Request = {
        Bucket: this.bucket,
        Prefix: prefix,
        MaxKeys: maxKeys,
      };

      const result = await this.s3.listObjectsV2(params).promise();
      return result.Contents || [];
    } catch (error) {
      console.error('S3 list files error:', error);
      throw createError(`Failed to list files: ${error}`, 500);
    }
  }

  /**
   * Copy file within S3
   */
  async copyFile(sourceKey: string, destinationKey: string): Promise<boolean> {
    try {
      const params: AWS.S3.CopyObjectRequest = {
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${sourceKey}`,
        Key: destinationKey,
      };

      await this.s3.copyObject(params).promise();
      return true;
    } catch (error) {
      console.error('S3 copy error:', error);
      return false;
    }
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<{
    totalFiles: number;
    totalSize: number;
    totalSizeGB: number;
  }> {
    try {
      const files = await this.listFiles();
      const totalFiles = files.length;
      const totalSize = files.reduce((sum, file) => sum + (file.Size || 0), 0);
      const totalSizeGB = Math.round((totalSize / (1024 * 1024 * 1024)) * 100) / 100;

      return {
        totalFiles,
        totalSize,
        totalSizeGB,
      };
    } catch (error) {
      console.error('Storage stats error:', error);
      return {
        totalFiles: 0,
        totalSize: 0,
        totalSizeGB: 0,
      };
    }
  }

  /**
   * Cleanup old files
   */
  async cleanupOldFiles(olderThanDays: number = 30): Promise<number> {
    try {
      const files = await this.listFiles();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      let deletedCount = 0;

      for (const file of files) {
        if (file.LastModified && file.LastModified < cutoffDate) {
          const success = await this.deleteFile(file.Key!);
          if (success) {
            deletedCount++;
          }
        }
      }

      return deletedCount;
    } catch (error) {
      console.error('Cleanup error:', error);
      return 0;
    }
  }

  /**
   * Health check for S3 connection
   */
  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; latency?: number }> {
    try {
      const start = Date.now();
      
      // Try to list objects (lightweight operation)
      await this.s3.listObjectsV2({
        Bucket: this.bucket,
        MaxKeys: 1,
      }).promise();
      
      const latency = Date.now() - start;
      
      return { status: 'healthy', latency };
    } catch (error) {
      console.error('S3 health check failed:', error);
      return { status: 'unhealthy' };
    }
  }
}