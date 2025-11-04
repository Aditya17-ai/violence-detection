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

    // Configure AWS S3
    this.s3 = new AWS.S3({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: this.region,
      signatureVersion: 'v4',
    });
  }

  /**
   * Upload file to S3
   */
  async uploadFile(
    filePath: string,
    key?: string,
    contentType?: string
  ): Promise<UploadResult> {
    try {
      // Generate unique key if not provided
      if (!key) {
        const extension = path.extname(filePath);
        key = `videos/${uuidv4()}${extension}`;
      }

      // Read file
      const fileBuffer = await fs.readFile(filePath);
      const fileSize = fileBuffer.length;

      // Determine content type
      if (!contentType) {
        contentType = FileSystemUtils.getMimeType(filePath);
      }

      // Upload parameters
      const uploadParams: AWS.S3.PutObjectRequest = {
        Bucket: this.bucket,
        Key: key,
        Body: fileBuffer,
        ContentType: contentType,
        ServerSideEncryption: 'AES256',
        Metadata: {
          'uploaded-at': new Date().toISOString(),
          'original-name': path.basename(filePath),
        },
      };

      // Upload to S3
      const result = await this.s3.upload(uploadParams).promise();

      return {
        key: result.Key!,
        url: result.Location!,
        bucket: result.Bucket!,
        size: fileSize,
      };
    } catch (error) {
      console.error('S3 upload error:', error);
      throw createError(`Failed to upload file to storage: ${error}`, 500);
    }
  }

  /**
   * Upload file buffer to S3
   */
  async uploadBuffer(
    buffer: Buffer,
    key: string,
    contentType: string,
    metadata?: Record<string, string>
  ): Promise<UploadResult> {
    try {
      const uploadParams: AWS.S3.PutObjectRequest = {
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        ServerSideEncryption: 'AES256',
        Metadata: {
          'uploaded-at': new Date().toISOString(),
          ...metadata,
        },
      };

      const result = await this.s3.upload(uploadParams).promise();

      return {
        key: result.Key!,
        url: result.Location!,
        bucket: result.Bucket!,
        size: buffer.length,
      };
    } catch (error) {
      console.error('S3 buffer upload error:', error);
      throw createError(`Failed to upload buffer to storage: ${error}`, 500);
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

      if (!result.Body) {
        throw createError('File not found in storage', 404);
      }

      return {
        buffer: result.Body as Buffer,
        contentType: result.ContentType || 'application/octet-stream',
        contentLength: result.ContentLength || 0,
      };
    } catch (error) {
      if ((error as any).statusCode === 404) {
        throw createError('File not found in storage', 404);
      }
      console.error('S3 download error:', error);
      throw createError(`Failed to download file from storage: ${error}`, 500);
    }
  }

  /**
   * Get signed URL for file access
   */
  async getSignedUrl(
    key: string,
    operation: 'getObject' | 'putObject' = 'getObject',
    expiresIn: number = 3600
  ): Promise<string> {
    try {
      const params = {
        Bucket: this.bucket,
        Key: key,
        Expires: expiresIn,
      };

      return await this.s3.getSignedUrlPromise(operation, params);
    } catch (error) {
      console.error('S3 signed URL error:', error);
      throw createError(`Failed to generate signed URL: ${error}`, 500);
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
   * Get file metadata from S3
   */
  async getFileMetadata(key: string): Promise<AWS.S3.HeadObjectOutput> {
    try {
      const params: AWS.S3.HeadObjectRequest = {
        Bucket: this.bucket,
        Key: key,
      };

      return await this.s3.headObject(params).promise();
    } catch (error) {
      if ((error as any).statusCode === 404) {
        throw createError('File not found in storage', 404);
      }
      console.error('S3 metadata error:', error);
      throw createError(`Failed to get file metadata: ${error}`, 500);
    }
  }

  /**
   * List files in S3 bucket
   */
  async listFiles(
    prefix?: string,
    maxKeys: number = 1000
  ): Promise<AWS.S3.Object[]> {
    try {
      const params: AWS.S3.ListObjectsV2Request = {
        Bucket: this.bucket,
        MaxKeys: maxKeys,
        Prefix: prefix,
      };

      const result = await this.s3.listObjectsV2(params).promise();
      return result.Contents || [];
    } catch (error) {
      console.error('S3 list error:', error);
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
        ServerSideEncryption: 'AES256',
      };

      await this.s3.copyObject(params).promise();
      return true;
    } catch (error) {
      console.error('S3 copy error:', error);
      return false;
    }
  }

  /**
   * Move file within S3 (copy + delete)
   */
  async moveFile(sourceKey: string, destinationKey: string): Promise<boolean> {
    try {
      const copySuccess = await this.copyFile(sourceKey, destinationKey);
      if (copySuccess) {
        await this.deleteFile(sourceKey);
        return true;
      }
      return false;
    } catch (error) {
      console.error('S3 move error:', error);
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
   * Cleanup old files (older than specified days)
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
   * Health check for storage service
   */
  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; latency?: number }> {
    try {
      const start = Date.now();
      
      // Try to list objects (minimal operation)
      await this.s3.listObjectsV2({
        Bucket: this.bucket,
        MaxKeys: 1,
      }).promise();
      
      const latency = Date.now() - start;
      
      return { status: 'healthy', latency };
    } catch (error) {
      console.error('Storage health check failed:', error);
      return { status: 'unhealthy' };
    }
  }
}