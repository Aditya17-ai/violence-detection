import { Request, Response } from 'express';
import { Video } from '@/models/Video';
import { asyncHandler, createError } from '@/middleware/errorHandler';
import { getVideoFileInfo, validateVideoFile } from '@/middleware/upload';
import { CacheService } from '@/services/CacheService';
import { StorageService } from '@/services/StorageService';
import fs from 'fs/promises';
import path from 'path';

export class VideoController {
  // Upload video file
  static uploadVideo = asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      throw createError('No video file provided', 400);
    }

    // Validate the uploaded file
    const validation = validateVideoFile(req.file);
    if (!validation.isValid) {
      // Clean up uploaded file
      try {
        await fs.unlink(req.file.path);
      } catch (error) {
        console.error('Error cleaning up invalid file:', error);
      }
      throw createError(`File validation failed: ${validation.errors.join(', ')}`, 400);
    }

    try {
      // Get file information
      const fileInfo = getVideoFileInfo(req.file);

      // Upload to cloud storage
      const storageService = new StorageService();
      const uploadResult = await storageService.uploadFile(
        req.file.path,
        fileInfo.originalName,
        fileInfo.mimetype
      );

      // Create video record in database
      const video = await Video.create({
        filename: fileInfo.filename,
        original_name: fileInfo.originalName,
        file_size: fileInfo.size,
        format: fileInfo.format,
        storage_path: uploadResult.key, // Store S3 key instead of local path
        // user_id: req.user?.id, // Will be implemented when authentication is added
      });

      // Clean up local temp file
      try {
        await fs.unlink(req.file.path);
      } catch (cleanupError) {
        console.error('Error cleaning up temp file:', cleanupError);
      }

      // Cache video metadata
      await CacheService.cacheVideoMetadata(video.id, {
        id: video.id,
        filename: video.filename,
        original_name: video.original_name,
        file_size: video.file_size,
        format: video.format,
        uploaded_at: video.uploaded_at,
        sizeInMB: video.sizeInMB,
      });

      // Increment upload counter
      await CacheService.incrementCounter('videos_uploaded');

      res.status(201).json({
        success: true,
        message: 'Video uploaded successfully',
        data: {
          id: video.id,
          filename: video.filename,
          original_name: video.original_name,
          file_size: video.file_size,
          sizeInMB: video.sizeInMB,
          format: video.format,
          uploaded_at: video.uploaded_at,
        },
      });
    } catch (error) {
      // Clean up uploaded file on database error
      try {
        await fs.unlink(req.file.path);
      } catch (cleanupError) {
        console.error('Error cleaning up file after database error:', cleanupError);
      }
      throw error;
    }
  });

  // Get video metadata
  static getVideo = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    if (!id) {
      throw createError('Video ID is required', 400);
    }

    // Try to get from cache first
    let videoData = await CacheService.getVideoMetadata(id);

    if (!videoData) {
      // Get from database
      const video = await Video.findByPk(id);
      
      if (!video) {
        throw createError('Video not found', 404);
      }

      videoData = {
        id: video.id,
        filename: video.filename,
        original_name: video.original_name,
        file_size: video.file_size,
        duration: video.duration,
        format: video.format,
        uploaded_at: video.uploaded_at,
        sizeInMB: video.sizeInMB,
        durationFormatted: video.durationFormatted,
      };

      // Cache the result
      await CacheService.cacheVideoMetadata(id, videoData);
    }

    res.json({
      success: true,
      data: videoData,
    });
  });

  // Delete video
  static deleteVideo = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    if (!id) {
      throw createError('Video ID is required', 400);
    }

    const video = await Video.findByPk(id);
    
    if (!video) {
      throw createError('Video not found', 404);
    }

    try {
      // Delete from cloud storage
      const storageService = new StorageService();
      await storageService.deleteFile(video.storage_path);
    } catch (error) {
      console.error('Error deleting file from cloud storage:', error);
      // Continue with database deletion even if file deletion fails
    }

    // Delete from database (this will cascade delete related analyses and detections)
    await video.destroy();

    // Clear cache
    await CacheService.deleteVideoCache(id);

    res.json({
      success: true,
      message: 'Video deleted successfully',
    });
  });

  // Stream video file
  static streamVideo = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    if (!id) {
      throw createError('Video ID is required', 400);
    }

    const video = await Video.findByPk(id);
    
    if (!video) {
      throw createError('Video not found', 404);
    }

    // Get file from cloud storage
    const storageService = new StorageService();
    
    // Check if file exists in cloud storage
    const fileExists = await storageService.fileExists(video.storage_path);
    if (!fileExists) {
      throw createError('Video file not found in storage', 404);
    }

    // Generate presigned URL for streaming
    const streamUrl = await storageService.generatePresignedDownloadUrl(video.storage_path, 3600);
    
    // Redirect to presigned URL for streaming
    res.redirect(streamUrl);
    return;
    // Note: The redirect above handles the streaming
    // This code is kept for reference but won't be reached
  });

  // Get video list with pagination
  static getVideos = asyncHandler(async (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;

    // Optional filters
    const format = req.query.format as string;
    const sortBy = req.query.sortBy as string || 'uploaded_at';
    const sortOrder = req.query.sortOrder as string || 'DESC';

    const whereClause: any = {};
    if (format) {
      whereClause.format = format;
    }

    const { rows: videos, count: total } = await Video.findAndCountAll({
      where: whereClause,
      limit,
      offset,
      order: [[sortBy, sortOrder]],
    });

    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: {
        videos: videos.map(video => ({
          id: video.id,
          filename: video.filename,
          original_name: video.original_name,
          file_size: video.file_size,
          duration: video.duration,
          format: video.format,
          uploaded_at: video.uploaded_at,
          sizeInMB: video.sizeInMB,
          durationFormatted: video.durationFormatted,
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
    });
  });

  // Get upload statistics
  static getUploadStats = asyncHandler(async (req: Request, res: Response) => {
    const totalVideos = await Video.count();
    const totalSize = await Video.sum('file_size') || 0;
    const totalSizeGB = Math.round((totalSize / (1024 * 1024 * 1024)) * 100) / 100;

    // Get format distribution
    const formatStats = await Video.findAll({
      attributes: [
        'format',
        [require('sequelize').fn('COUNT', require('sequelize').col('format')), 'count'],
        [require('sequelize').fn('SUM', require('sequelize').col('file_size')), 'totalSize'],
      ],
      group: ['format'],
      raw: true,
    });

    // Get recent uploads (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentUploads = await Video.count({
      where: {
        uploaded_at: {
          [require('sequelize').Op.gte]: sevenDaysAgo,
        },
      },
    });

    res.json({
      success: true,
      data: {
        totalVideos,
        totalSizeGB,
        recentUploads,
        formatDistribution: formatStats.map((stat: any) => ({
          format: stat.format,
          count: parseInt(stat.count),
          totalSizeGB: Math.round((stat.totalSize / (1024 * 1024 * 1024)) * 100) / 100,
        })),
      },
    });
  });
}