import Bull, { Queue, Job, JobOptions } from 'bull';
import redisManager from '@/config/redis';
import { Analysis } from '@/models/Analysis';
import { Video } from '@/models/Video';
import { ViolenceDetection } from '@/models/ViolenceDetection';
import { CacheService } from '@/services/CacheService';
import { StorageService } from '@/services/StorageService';
import axios from 'axios';

export interface VideoAnalysisJobData {
  analysisId: string;
  videoId: string;
  confidenceThreshold: number;
  frameInterval: number;
}

export interface AnalysisProgress {
  analysisId: string;
  progress: number;
  status: string;
  currentFrame?: number;
  totalFrames?: number;
  detectedViolence?: number;
  error?: string;
}

export class QueueService {
  private videoAnalysisQueue: Queue<VideoAnalysisJobData>;
  private readonly AI_SERVICE_URL: string;

  constructor() {
    this.AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8001';
    
    // Create Bull queue with Redis connection
    this.videoAnalysisQueue = new Bull<VideoAnalysisJobData>('video-analysis', {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
      },
      defaultJobOptions: {
        removeOnComplete: 10, // Keep last 10 completed jobs
        removeOnFail: 50,     // Keep last 50 failed jobs
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    });

    this.setupJobProcessors();
    this.setupEventHandlers();
  }

  private setupJobProcessors(): void {
    // Process video analysis jobs
    this.videoAnalysisQueue.process('analyze-video', 5, this.processVideoAnalysis.bind(this));
  }

  private setupEventHandlers(): void {
    // Job progress events
    this.videoAnalysisQueue.on('progress', (job: Job<VideoAnalysisJobData>, progress: number) => {
      console.log(`Job ${job.id} progress: ${progress}%`);
      this.updateAnalysisProgress(job.data.analysisId, progress);
    });

    // Job completion events
    this.videoAnalysisQueue.on('completed', (job: Job<VideoAnalysisJobData>, result: any) => {
      console.log(`Job ${job.id} completed successfully`);
      this.handleJobCompletion(job.data.analysisId, result);
    });

    // Job failure events
    this.videoAnalysisQueue.on('failed', (job: Job<VideoAnalysisJobData>, err: Error) => {
      console.error(`Job ${job.id} failed:`, err);
      this.handleJobFailure(job.data.analysisId, err.message);
    });

    // Job stalled events
    this.videoAnalysisQueue.on('stalled', (job: Job<VideoAnalysisJobData>) => {
      console.warn(`Job ${job.id} stalled`);
    });
  }

  /**
   * Add video analysis job to queue
   */
  async addVideoAnalysisJob(
    analysisId: string,
    videoId: string,
    confidenceThreshold: number = 0.7,
    frameInterval: number = 1,
    priority: number = 0
  ): Promise<Job<VideoAnalysisJobData>> {
    const jobData: VideoAnalysisJobData = {
      analysisId,
      videoId,
      confidenceThreshold,
      frameInterval,
    };

    const jobOptions: JobOptions = {
      priority,
      delay: 0,
      jobId: analysisId, // Use analysis ID as job ID for easy tracking
    };

    return await this.videoAnalysisQueue.add('analyze-video', jobData, jobOptions);
  }

  /**
   * Process video analysis job
   */
  private async processVideoAnalysis(job: Job<VideoAnalysisJobData>): Promise<any> {
    const { analysisId, videoId, confidenceThreshold, frameInterval } = job.data;

    try {
      // Update analysis status to processing
      await Analysis.update(
        { status: 'processing', progress: 0 },
        { where: { id: analysisId } }
      );

      // Get video information
      const video = await Video.findByPk(videoId);
      if (!video) {
        throw new Error(`Video with ID ${videoId} not found`);
      }

      // Generate download URL for AI service
      const storageService = new StorageService();
      const videoUrl = await storageService.generatePresignedDownloadUrl(video.storage_path, 3600);

      // Start analysis with AI service
      const analysisResponse = await axios.post(`${this.AI_SERVICE_URL}/analysis/start`, {
        video_url: videoUrl,
        confidence_threshold: confidenceThreshold,
        frame_interval: frameInterval,
      });

      const aiAnalysisId = analysisResponse.data.analysis_id;

      // Poll AI service for progress
      let completed = false;
      let lastProgress = 0;

      while (!completed) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds

        try {
          const statusResponse = await axios.get(`${this.AI_SERVICE_URL}/analysis/${aiAnalysisId}`);
          const analysisResult = statusResponse.data;

          // Update progress
          if (analysisResult.progress > lastProgress) {
            lastProgress = analysisResult.progress;
            job.progress(analysisResult.progress);
            
            await this.updateAnalysisProgress(analysisId, analysisResult.progress, {
              totalFrames: analysisResult.total_frames,
              violentFrames: analysisResult.violent_frames,
            });
          }

          // Check if completed
          if (analysisResult.status === 'completed') {
            completed = true;
            
            // Save detection results
            if (analysisResult.detections && analysisResult.detections.length > 0) {
              await this.saveDetectionResults(analysisId, analysisResult.detections);
            }

            // Update final analysis status
            await Analysis.update(
              {
                status: 'completed',
                progress: 100,
                completed_at: new Date(),
                total_frames: analysisResult.total_frames,
                violent_frames: analysisResult.violent_frames,
              },
              { where: { id: analysisId } }
            );

            return analysisResult;
          } else if (analysisResult.status === 'failed') {
            throw new Error(analysisResult.error_message || 'AI analysis failed');
          }
        } catch (pollError) {
          console.error('Error polling AI service:', pollError);
          // Continue polling unless it's a critical error
          if (pollError.response?.status === 404) {
            throw new Error('Analysis not found in AI service');
          }
        }
      }
    } catch (error) {
      console.error('Video analysis job failed:', error);
      
      // Update analysis status to failed
      await Analysis.update(
        {
          status: 'failed',
          error_message: error.message,
        },
        { where: { id: analysisId } }
      );

      throw error;
    }
  }

  /**
   * Update analysis progress
   */
  private async updateAnalysisProgress(
    analysisId: string,
    progress: number,
    additionalData?: { totalFrames?: number; violentFrames?: number }
  ): Promise<void> {
    try {
      const updateData: any = { progress };
      
      if (additionalData?.totalFrames) {
        updateData.total_frames = additionalData.totalFrames;
      }
      
      if (additionalData?.violentFrames !== undefined) {
        updateData.violent_frames = additionalData.violentFrames;
      }

      await Analysis.update(updateData, { where: { id: analysisId } });

      // Cache progress for real-time updates
      await CacheService.cacheAnalysisProgress(analysisId, progress);
    } catch (error) {
      console.error('Error updating analysis progress:', error);
    }
  }

  /**
   * Save detection results to database
   */
  private async saveDetectionResults(analysisId: string, detections: any[]): Promise<void> {
    try {
      const detectionRecords = detections.map(detection => ({
        analysis_id: analysisId,
        timestamp_seconds: detection.timestamp_seconds,
        confidence_score: detection.confidence_score,
        frame_number: detection.frame_number,
        bounding_boxes: detection.bounding_boxes || null,
      }));

      await ViolenceDetection.bulkCreate(detectionRecords);
    } catch (error) {
      console.error('Error saving detection results:', error);
      throw error;
    }
  }

  /**
   * Handle job completion
   */
  private async handleJobCompletion(analysisId: string, result: any): Promise<void> {
    try {
      // Cache final result
      await CacheService.cacheAnalysisResult(analysisId, result);
      
      // Increment completion counter
      await CacheService.incrementCounter('analyses_completed');
      
      console.log(`Analysis ${analysisId} completed successfully`);
    } catch (error) {
      console.error('Error handling job completion:', error);
    }
  }

  /**
   * Handle job failure
   */
  private async handleJobFailure(analysisId: string, errorMessage: string): Promise<void> {
    try {
      // Update analysis status
      await Analysis.update(
        {
          status: 'failed',
          error_message: errorMessage,
        },
        { where: { id: analysisId } }
      );

      // Increment failure counter
      await CacheService.incrementCounter('analyses_failed');
      
      console.error(`Analysis ${analysisId} failed: ${errorMessage}`);
    } catch (error) {
      console.error('Error handling job failure:', error);
    }
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId: string): Promise<any> {
    try {
      const job = await this.videoAnalysisQueue.getJob(jobId);
      if (!job) {
        return null;
      }

      return {
        id: job.id,
        data: job.data,
        progress: job.progress(),
        state: await job.getState(),
        createdAt: new Date(job.timestamp),
        processedAt: job.processedOn ? new Date(job.processedOn) : null,
        finishedAt: job.finishedOn ? new Date(job.finishedOn) : null,
        failedReason: job.failedReason,
        attempts: job.attemptsMade,
        maxAttempts: job.opts.attempts,
      };
    } catch (error) {
      console.error('Error getting job status:', error);
      return null;
    }
  }

  /**
   * Cancel job
   */
  async cancelJob(jobId: string): Promise<boolean> {
    try {
      const job = await this.videoAnalysisQueue.getJob(jobId);
      if (!job) {
        return false;
      }

      await job.remove();
      
      // Update analysis status
      await Analysis.update(
        { status: 'cancelled' },
        { where: { id: jobId } }
      );

      return true;
    } catch (error) {
      console.error('Error cancelling job:', error);
      return false;
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    paused: number;
  }> {
    try {
      const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
        this.videoAnalysisQueue.getWaiting(),
        this.videoAnalysisQueue.getActive(),
        this.videoAnalysisQueue.getCompleted(),
        this.videoAnalysisQueue.getFailed(),
        this.videoAnalysisQueue.getDelayed(),
        this.videoAnalysisQueue.getPaused(),
      ]);

      return {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        delayed: delayed.length,
        paused: paused.length,
      };
    } catch (error) {
      console.error('Error getting queue stats:', error);
      return {
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
        paused: 0,
      };
    }
  }

  /**
   * Clean up old jobs
   */
  async cleanupOldJobs(olderThanHours: number = 24): Promise<number> {
    try {
      const cutoffTime = Date.now() - (olderThanHours * 60 * 60 * 1000);
      
      // Clean completed jobs
      const completedJobs = await this.videoAnalysisQueue.getCompleted();
      let cleanedCount = 0;

      for (const job of completedJobs) {
        if (job.finishedOn && job.finishedOn < cutoffTime) {
          await job.remove();
          cleanedCount++;
        }
      }

      // Clean failed jobs
      const failedJobs = await this.videoAnalysisQueue.getFailed();
      for (const job of failedJobs) {
        if (job.finishedOn && job.finishedOn < cutoffTime) {
          await job.remove();
          cleanedCount++;
        }
      }

      return cleanedCount;
    } catch (error) {
      console.error('Error cleaning up old jobs:', error);
      return 0;
    }
  }

  /**
   * Health check for queue service
   */
  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; stats?: any }> {
    try {
      const stats = await this.getQueueStats();
      
      // Consider unhealthy if too many failed jobs
      const isHealthy = stats.failed < 100 && stats.active < 50;
      
      return {
        status: isHealthy ? 'healthy' : 'unhealthy',
        stats,
      };
    } catch (error) {
      console.error('Queue health check failed:', error);
      return { status: 'unhealthy' };
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    try {
      await this.videoAnalysisQueue.close();
      console.log('Queue service shut down gracefully');
    } catch (error) {
      console.error('Error shutting down queue service:', error);
    }
  }
}