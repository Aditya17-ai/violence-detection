import { Request, Response } from 'express';
import { Analysis } from '@/models/Analysis';
import { Video } from '@/models/Video';
import { ViolenceDetection } from '@/models/ViolenceDetection';
import { asyncHandler, createError } from '@/middleware/errorHandler';
import { QueueService } from '@/services/QueueService';
import { CacheService } from '@/services/CacheService';

export class AnalysisController {
  private static queueService = new QueueService();

  // Start video analysis
  static startAnalysis = asyncHandler(async (req: Request, res: Response) => {
    const { videoId } = req.params;
    const { 
      confidenceThreshold = 0.7, 
      frameInterval = 1,
      priority = 0 
    } = req.body;

    if (!videoId) {
      throw createError('Video ID is required', 400);
    }

    // Validate video exists
    const video = await Video.findByPk(videoId);
    if (!video) {
      throw createError('Video not found', 404);
    }

    // Check if analysis already exists for this video
    const existingAnalysis = await Analysis.findOne({
      where: { 
        video_id: videoId,
        status: ['pending', 'processing']
      }
    });

    if (existingAnalysis) {
      throw createError('Analysis already in progress for this video', 409);
    }

    // Create analysis record
    const analysis = await Analysis.create({
      video_id: videoId,
      status: 'pending',
      progress: 0,
      confidence_threshold: confidenceThreshold,
    });

    // Add job to queue
    try {
      await this.queueService.addVideoAnalysisJob(
        analysis.id,
        videoId,
        confidenceThreshold,
        frameInterval,
        priority
      );

      // Increment analysis counter
      await CacheService.incrementCounter('analyses_started');

      res.status(201).json({
        success: true,
        message: 'Analysis started successfully',
        data: {
          analysisId: analysis.id,
          videoId: video.id,
          status: analysis.status,
          confidenceThreshold: analysis.confidence_threshold,
          createdAt: analysis.started_at,
        },
      });
    } catch (error) {
      // Clean up analysis record if job creation fails
      await analysis.destroy();
      throw createError(`Failed to start analysis: ${error.message}`, 500);
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
          attributes: ['id', 'filename', 'original_name', 'duration', 'format'],
        },
        {
          model: ViolenceDetection,
          order: [['timestamp_seconds', 'ASC']],
        },
      ],
    });

    if (!analysis) {
      throw createError('Analysis not found', 404);
    }

    // Get job status if still processing
    let jobStatus = null;
    if (analysis.status === 'processing' || analysis.status === 'pending') {
      jobStatus = await this.queueService.getJobStatus(analysisId);
    }

    // Get analysis summary
    const summary = await analysis.getSummary();

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
      detections: analysis.detections.map(detection => ({
        id: detection.id,
        timestampSeconds: detection.timestamp_seconds,
        timestampFormatted: detection.timestampFormatted,
        confidenceScore: detection.confidence_score,
        confidencePercentage: detection.confidencePercentage,
        frameNumber: detection.frame_number,
        severityLevel: detection.severityLevel,
        boundingBoxes: detection.bounding_boxes,
        createdAt: detection.created_at,
      })),
      summary,
      jobStatus,
    };

    // Cache completed results
    if (analysis.status === 'completed') {
      await CacheService.cacheAnalysisResult(analysisId, result, 86400); // Cache for 24 hours
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

    if (analysis.status !== 'processing' && analysis.status !== 'pending') {
      throw createError('Analysis is not in progress', 400);
    }

    // Cancel the job
    const cancelled = await this.queueService.cancelJob(analysisId);
    
    if (cancelled) {
      // Clear cache
      await CacheService.deleteAnalysisCache(analysisId);

      res.json({
        success: true,
        message: 'Analysis stopped successfully',
        data: {
          analysisId: analysis.id,
          status: 'cancelled',
        },
      });
    } else {
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
          attributes: ['id', 'filename', 'original_name', 'format', 'file_size'],
        },
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
          duration: analysis.duration,
          totalFrames: analysis.total_frames,
          violentFrames: analysis.violent_frames,
          violencePercentage: analysis.violencePercentage,
          confidenceThreshold: analysis.confidence_threshold,
          errorMessage: analysis.error_message,
          video: analysis.video ? {
            id: analysis.video.id,
            filename: analysis.video.filename,
            originalName: analysis.video.original_name,
            format: analysis.video.format,
            sizeInMB: analysis.video.sizeInMB,
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

    // Stop analysis if it's still running
    if (analysis.status === 'processing' || analysis.status === 'pending') {
      await this.queueService.cancelJob(analysisId);
    }

    // Delete analysis (this will cascade delete detections)
    await analysis.destroy();

    // Clear cache
    await CacheService.deleteAnalysisCache(analysisId);

    res.json({
      success: true,
      message: 'Analysis deleted successfully',
    });
  });

  // Get analysis statistics
  static getAnalysisStats = asyncHandler(async (req: Request, res: Response) => {
    // Get database stats
    const totalAnalyses = await Analysis.count();
    const completedAnalyses = await Analysis.count({ where: { status: 'completed' } });
    const failedAnalyses = await Analysis.count({ where: { status: 'failed' } });
    const processingAnalyses = await Analysis.count({ 
      where: { status: ['processing', 'pending'] } 
    });

    // Get queue stats
    const queueStats = await this.queueService.getQueueStats();

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
      limit: 100, // Last 100 completed analyses
      order: [['completed_at', 'DESC']],
    });

    let averageProcessingTime = 0;
    if (completedWithDuration.length > 0) {
      const totalTime = completedWithDuration.reduce((sum, analysis) => {
        const duration = analysis.completed_at!.getTime() - analysis.started_at.getTime();
        return sum + duration;
      }, 0);
      averageProcessingTime = Math.round(totalTime / completedWithDuration.length / 1000); // in seconds
    }

    // Get violence detection stats
    const totalDetections = await ViolenceDetection.count();
    const avgConfidence = await ViolenceDetection.findOne({
      attributes: [
        [require('sequelize').fn('AVG', require('sequelize').col('confidence_score')), 'avgConfidence']
      ],
      raw: true,
    });

    res.json({
      success: true,
      data: {
        totalAnalyses,
        completedAnalyses,
        failedAnalyses,
        processingAnalyses,
        recentAnalyses,
        averageProcessingTimeSeconds: averageProcessingTime,
        successRate: totalAnalyses > 0 ? Math.round((completedAnalyses / totalAnalyses) * 100) : 0,
        queueStats,
        detectionStats: {
          totalDetections,
          averageConfidence: avgConfidence ? Math.round(avgConfidence.avgConfidence * 10000) / 10000 : 0,
        },
      },
    });
  });

  // Retry failed analysis
  static retryAnalysis = asyncHandler(async (req: Request, res: Response) => {
    const { analysisId } = req.params;

    if (!analysisId) {
      throw createError('Analysis ID is required', 400);
    }

    const analysis = await Analysis.findByPk(analysisId, {
      include: [Video],
    });

    if (!analysis) {
      throw createError('Analysis not found', 404);
    }

    if (analysis.status !== 'failed') {
      throw createError('Only failed analyses can be retried', 400);
    }

    // Reset analysis status
    await analysis.update({
      status: 'pending',
      progress: 0,
      error_message: null,
      completed_at: null,
    });

    // Clear old detections
    await ViolenceDetection.destroy({
      where: { analysis_id: analysisId },
    });

    // Add job to queue again
    await this.queueService.addVideoAnalysisJob(
      analysis.id,
      analysis.video_id,
      analysis.confidence_threshold,
      1, // Default frame interval
      0  // Default priority
    );

    // Clear cache
    await CacheService.deleteAnalysisCache(analysisId);

    res.json({
      success: true,
      message: 'Analysis retry started successfully',
      data: {
        analysisId: analysis.id,
        status: 'pending',
      },
    });
  });
}