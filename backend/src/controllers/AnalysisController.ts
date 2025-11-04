import { Request, Response } from 'express';
import { Analysis } from '@/models/Analysis';
import { Video } from '@/models/Video';
import { ViolenceDetection } from '@/models/ViolenceDetection';
import { QueueService } from '@/services/QueueService';
import { CacheService } from '@/services/CacheService';
import { asyncHandler, createError } from '@/middleware/errorHandler';

export class AnalysisController {
  private static queueService = new QueueService();

  // Start video analysis
  static startAnalysis = asyncHandler(async (req: Request, res: Response) => {
    const { videoId } = req.params;
    const { 
      confidenceThreshold = 0.7, 
      frameInterval = 1 
    } = req.body;

    if (!videoId) {
      throw createError('Video ID is required', 400);
    }

    // Validate video exists
    const video = await Video.findByPk(videoId);
    if (!video) {
      throw createError('Video not found', 404);
    }

    // Check if analysis already exists and is not failed
    const existingAnalysis = await Analysis.findOne({
      where: { 
        video_id: videoId,
        status: ['pending', 'processing', 'completed']
      }
    });

    if (existingAnalysis) {
      if (existingAnalysis.status === 'completed') {
        return res.json({
          success: true,
          message: 'Analysis already completed',
          data: {
            analysisId: existingAnalysis.id,
            status: existingAnalysis.status,
            progress: existingAnalysis.progress,
          }
        });
      } else {
        return res.json({
          success: true,
          message: 'Analysis already in progress',
          data: {
            analysisId: existingAnalysis.id,
            status: existingAnalysis.status,
            progress: existingAnalysis.progress,
          }
        });
      }
    }

    try {
      // Create new analysis record
      const analysis = await Analysis.create({
        video_id: videoId,
        status: 'pending',
        progress: 0,
        confidence_threshold: confidenceThreshold,
      });

      // Add job to queue
      const job = await AnalysisController.queueService.addVideoAnalysisJob(
        analysis.id,
        videoId,
        video.storage_path,
        {
          confidenceThreshold,
          frameInterval,
        }
      );

      // Cache initial progress
      await CacheService.cacheAnalysisProgress(analysis.id, 0);

      res.status(201).json({
        success: true,
        message: 'Analysis started successfully',
        data: {
          analysisId: analysis.id,
          jobId: job.id,
          status: analysis.status,
          progress: analysis.progress,
          estimatedDuration: video.duration ? Math.ceil(video.duration / 60) : null, // rough estimate in minutes
        }
      });

    } catch (error) {
      console.error('Error starting analysis:', error);
      throw createError('Failed to start analysis', 500);
    }
  });

  // Get analysis status and results
  static getAnalysis = asyncHandler(async (req: Request, res: Response) => {
    const { analysisId } = req.params;

    if (!analysisId) {
      throw createError('Analysis ID is required', 400);
    }

    // Try to get from cache first
    let cachedResult = await CacheService.getAnalysisResult(analysisId);
    
    if (cachedResult) {
      return res.json({
        success: true,
        data: cachedResult,
        cached: true,
      });
    }

    // Get from database
    const analysis = await Analysis.findByPk(analysisId, {
      include: [
        {
          model: Video,
          attributes: ['id', 'filename', 'original_name', 'duration', 'format']
        },
        {
          model: ViolenceDetection,
          order: [['timestamp_seconds', 'ASC']]
        }
      ]
    });

    if (!analysis) {
      throw createError('Analysis not found', 404);
    }

    // Get summary if completed
    let summary = null;
    if (analysis.status === 'completed') {
      summary = await analysis.getSummary();
    }

    const result = {
      id: analysis.id,
      videoId: analysis.video_id,
      status: analysis.status,
      progress: analysis.progress,
      startedAt: analysis.started_at,
      completedAt: analysis.completed_at,
      totalFrames: analysis.total_frames,
      violentFrames: analysis.violent_frames,
      confidenceThreshold: analysis.confidence_threshold,
      errorMessage: analysis.error_message,
      video: analysis.video ? {
        id: analysis.video.id,
        filename: analysis.video.filename,
        originalName: analysis.video.original_name,
        duration: analysis.video.duration,
        format: analysis.video.format,
        durationFormatted: analysis.video.durationFormatted,
      } : null,
      detections: analysis.detections?.map(detection => ({
        id: detection.id,
        timestampSeconds: detection.timestamp_seconds,
        confidenceScore: detection.confidence_score,
        frameNumber: detection.frame_number,
        boundingBoxes: detection.bounding_boxes,
        timestampFormatted: detection.timestampFormatted,
        confidencePercentage: detection.confidencePercentage,
        severityLevel: detection.severityLevel,
      })) || [],
      summary,
      duration: analysis.duration,
      violencePercentage: analysis.violencePercentage,
    };

    // Cache result if completed
    if (analysis.status === 'completed') {
      await CacheService.cacheAnalysisResult(analysisId, result);
    }

    res.json({
      success: true,
      data: result,
    });
  });

  // Stop ongoing analysis
  static stopAnalysis = asyncHandler(async (req: Request, res: Response) => {
    const { analysisId } = req.params;

    if (!analysisId) {
      throw createError('Analysis ID is required', 400);
    }

    const analysis = await Analysis.findByPk(analysisId);
    
    if (!analysis) {
      throw createError('Analysis not found', 404);
    }

    if (analysis.status === 'completed') {
      return res.json({
        success: false,
        message: 'Analysis already completed',
      });
    }

    if (analysis.status === 'failed') {
      return res.json({
        success: false,
        message: 'Analysis already failed',
      });
    }

    try {
      // Update analysis status
      await analysis.update({
        status: 'cancelled',
        completed_at: new Date(),
        error_message: 'Analysis cancelled by user',
      });

      // Clear cache
      await CacheService.deleteAnalysisCache(analysisId);

      res.json({
        success: true,
        message: 'Analysis stopped successfully',
      });

    } catch (error) {
      console.error('Error stopping analysis:', error);
      throw createError('Failed to stop analysis', 500);
    }
  });

  // Get analysis history with pagination
  static getAnalysisHistory = asyncHandler(async (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;

    // Optional filters
    const status = req.query.status as string;
    const videoId = req.query.videoId as string;
    const sortBy = req.query.sortBy as string || 'started_at';
    const sortOrder = req.query.sortOrder as string || 'DESC';

    const whereClause: any = {};
    if (status) {
      whereClause.status = status;
    }
    if (videoId) {
      whereClause.video_id = videoId;
    }

    const { rows: analyses, count: total } = await Analysis.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: Video,
          attributes: ['id', 'filename', 'original_name', 'duration', 'format']
        }
      ],
      limit,
      offset,
      order: [[sortBy, sortOrder]],
    });

    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: {
        analyses: analyses.map(analysis => ({
          id: analysis.id,
          videoId: analysis.video_id,
          status: analysis.status,
          progress: analysis.progress,
          startedAt: analysis.started_at,
          completedAt: analysis.completed_at,
          totalFrames: analysis.total_frames,
          violentFrames: analysis.violent_frames,
          confidenceThreshold: analysis.confidence_threshold,
          errorMessage: analysis.error_message,
          duration: analysis.duration,
          violencePercentage: analysis.violencePercentage,
          video: analysis.video ? {
            id: analysis.video.id,
            filename: analysis.video.filename,
            originalName: analysis.video.original_name,
            duration: analysis.video.duration,
            format: analysis.video.format,
            durationFormatted: analysis.video.durationFormatted,
          } : null,
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

  // Delete analysis and its results
  static deleteAnalysis = asyncHandler(async (req: Request, res: Response) => {
    const { analysisId } = req.params;

    if (!analysisId) {
      throw createError('Analysis ID is required', 400);
    }

    const analysis = await Analysis.findByPk(analysisId);
    
    if (!analysis) {
      throw createError('Analysis not found', 404);
    }

    try {
      // Delete analysis (cascade will delete detections)
      await analysis.destroy();

      // Clear cache
      await CacheService.deleteAnalysisCache(analysisId);

      res.json({
        success: true,
        message: 'Analysis deleted successfully',
      });

    } catch (error) {
      console.error('Error deleting analysis:', error);
      throw createError('Failed to delete analysis', 500);
    }
  });

  // Get analysis statistics
  static getAnalysisStats = asyncHandler(async (req: Request, res: Response) => {
    const totalAnalyses = await Analysis.count();
    const completedAnalyses = await Analysis.count({ where: { status: 'completed' } });
    const failedAnalyses = await Analysis.count({ where: { status: 'failed' } });
    const processingAnalyses = await Analysis.count({ where: { status: 'processing' } });

    // Get recent analyses (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentAnalyses = await Analysis.count({
      where: {
        started_at: {
          [require('sequelize').Op.gte]: sevenDaysAgo,
        },
      },
    });

    // Get average processing time for completed analyses
    const completedWithDuration = await Analysis.findAll({
      where: { 
        status: 'completed',
        completed_at: { [require('sequelize').Op.ne]: null }
      },
      attributes: ['started_at', 'completed_at'],
      raw: true,
    });

    let averageProcessingTime = 0;
    if (completedWithDuration.length > 0) {
      const totalTime = completedWithDuration.reduce((sum, analysis) => {
        const duration = new Date(analysis.completed_at!).getTime() - new Date(analysis.started_at).getTime();
        return sum + duration;
      }, 0);
      averageProcessingTime = Math.round(totalTime / completedWithDuration.length / 1000); // in seconds
    }

    // Get queue statistics
    const queueStats = await AnalysisController.queueService.getQueueStats();

    res.json({
      success: true,
      data: {
        totalAnalyses,
        completedAnalyses,
        failedAnalyses,
        processingAnalyses,
        recentAnalyses,
        averageProcessingTime,
        successRate: totalAnalyses > 0 ? Math.round((completedAnalyses / totalAnalyses) * 100) : 0,
        queue: queueStats,
      },
    });
  });

  // Get system status
  static getSystemStatus = asyncHandler(async (req: Request, res: Response) => {
    const queueHealth = await AnalysisController.queueService.getHealthStatus();
    const processingAnalyses = await Analysis.count({ where: { status: 'processing' } });
    const pendingAnalyses = await Analysis.count({ where: { status: 'pending' } });

    const systemLoad = {
      processing: processingAnalyses,
      pending: pendingAnalyses,
      queueHealth: queueHealth.status,
      queueStats: queueHealth.stats,
    };

    const isHealthy = queueHealth.status === 'healthy' && processingAnalyses < 10;

    res.json({
      success: true,
      data: {
        status: isHealthy ? 'healthy' : 'degraded',
        load: systemLoad,
        timestamp: new Date().toISOString(),
      },
    });
  });
}