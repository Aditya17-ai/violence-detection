import fs from 'fs/promises';
import path from 'path';

export class FileSystemUtils {
  /**
   * Ensure directory exists, create if it doesn't
   */
  static async ensureDirectory(dirPath: string): Promise<void> {
    try {
      await fs.access(dirPath);
    } catch (error) {
      await fs.mkdir(dirPath, { recursive: true });
    }
  }

  /**
   * Check if file exists
   */
  static async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get file size in bytes
   */
  static async getFileSize(filePath: string): Promise<number> {
    const stats = await fs.stat(filePath);
    return stats.size;
  }

  /**
   * Move file from source to destination
   */
  static async moveFile(sourcePath: string, destinationPath: string): Promise<void> {
    // Ensure destination directory exists
    const destDir = path.dirname(destinationPath);
    await this.ensureDirectory(destDir);

    // Move file
    await fs.rename(sourcePath, destinationPath);
  }

  /**
   * Copy file from source to destination
   */
  static async copyFile(sourcePath: string, destinationPath: string): Promise<void> {
    // Ensure destination directory exists
    const destDir = path.dirname(destinationPath);
    await this.ensureDirectory(destDir);

    // Copy file
    await fs.copyFile(sourcePath, destinationPath);
  }

  /**
   * Delete file if it exists
   */
  static async deleteFile(filePath: string): Promise<boolean> {
    try {
      await fs.unlink(filePath);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get file extension
   */
  static getFileExtension(filename: string): string {
    return path.extname(filename).toLowerCase().substring(1);
  }

  /**
   * Generate safe filename
   */
  static generateSafeFilename(originalName: string, uniqueId: string): string {
    const extension = this.getFileExtension(originalName);
    const baseName = path.basename(originalName, path.extname(originalName));
    const safeName = baseName.replace(/[^a-zA-Z0-9.-]/g, '_');
    return `${uniqueId}_${safeName}.${extension}`;
  }

  /**
   * Get directory size
   */
  static async getDirectorySize(dirPath: string): Promise<number> {
    let totalSize = 0;

    try {
      const files = await fs.readdir(dirPath);
      
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stats = await fs.stat(filePath);
        
        if (stats.isDirectory()) {
          totalSize += await this.getDirectorySize(filePath);
        } else {
          totalSize += stats.size;
        }
      }
    } catch (error) {
      console.error(`Error calculating directory size for ${dirPath}:`, error);
    }

    return totalSize;
  }

  /**
   * Clean up old files in directory
   */
  static async cleanupOldFiles(dirPath: string, maxAgeHours: number = 24): Promise<number> {
    let deletedCount = 0;
    const maxAge = maxAgeHours * 60 * 60 * 1000; // Convert to milliseconds
    const now = Date.now();

    try {
      const files = await fs.readdir(dirPath);
      
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stats = await fs.stat(filePath);
        
        if (stats.isFile() && (now - stats.mtime.getTime()) > maxAge) {
          await fs.unlink(filePath);
          deletedCount++;
        }
      }
    } catch (error) {
      console.error(`Error cleaning up old files in ${dirPath}:`, error);
    }

    return deletedCount;
  }

  /**
   * Format file size to human readable format
   */
  static formatFileSize(bytes: number): string {
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 Bytes';
    
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const size = bytes / Math.pow(1024, i);
    
    return `${Math.round(size * 100) / 100} ${sizes[i]}`;
  }

  /**
   * Get MIME type from file extension
   */
  static getMimeType(filename: string): string {
    const extension = this.getFileExtension(filename);
    
    const mimeTypes: Record<string, string> = {
      'mp4': 'video/mp4',
      'avi': 'video/x-msvideo',
      'mov': 'video/quicktime',
      'mkv': 'video/x-matroska',
      'webm': 'video/webm',
      'flv': 'video/x-flv',
      'wmv': 'video/x-ms-wmv',
    };

    return mimeTypes[extension] || 'application/octet-stream';
  }
}