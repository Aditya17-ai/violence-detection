import Bull, { Queue, Job, JobOptions } from 'bull';
import redisManager from '@/config/redis';
import { Analysis } from '@/models/Analysis';
import { Video } from '@/models/Video';
import { ViolenceDetection } from '@/models/ViolenceDetection';
import { CacheService } from '@/services/CacheService';
import { io } from '../index';
import axios from 'axios';

export interface VideoAnalysisJobData {
  analysisId: string;
  videoId: string;
  videoPath: string;
  confidenceThreshold: number;
  frameInterval: number;
}

export interface AnalysisProgress {
  analysisId: string;
  progress: number;
  currentFrame: number;
  totalFrames: number;
  status: string;
  message?: string;
}

export interface ViolenceDetectionResult {
  timestampSeconds: number;
  confidenceScore: number;
  frameNumber: number;
  boundingBoxes?: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
    confidence?: number;
  }>;
}

export class QueueService {
  private videoAnalysisQueue: Queue<VideoAnalysisJobData>;
  private readonly AI_SERVICE_URL: string;

  constructor() {
    this.AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8001';
    
    // Initialize Bull queue with Redis connection
    this.videoAnalysisQueue = new Bull('video-analysis', {
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

  /**
   * Setup job processors
   */
  private setupJobProcessors(): void {
    // Process video analysis jobs
    this.videoAnalysisQueue.process('analyze-video', 5, this.processVideoAnalysis.bind(this));
  }

  /**
   * Setup event handlers for job lifecycle
   */
  private setupEventHandlers(): void {
    // Job progress updates
    this.videoAnalysisQueue.on('progress', async (job: Job<VideoAnalysisJobData>, progress: number) => {
      const { analysisId } = job.data;
      
      // Update cache
      await CacheService.cacheAnalysisProgress(analysisId, progress);
      
      // Emit real-time update
      io.emit(`analysis:${analysisId}:progress`, {
        analysisId,
        progress,
        status: 'processing',
      });
    });

    // Job completion
    this.videoAnalysisQueue.on('completed', async (job: Job<VideoAnalysisJobData>, result: any) => {
      const { analysisId } = job.data;
      
      console.log(`✅ Analysis ${analysisId} completed successfully`);
      
      // Update analysis status
      await Analysis.update(
        { 
          status: 'completed',
          progress: 100,
          completed_at: new Date(),
        },
        { where: { id: analysisId } }
      );

      // Cache result
      await CacheService.cacheAnalysisResult(analysisId, result);
      
      // Emit completion event
      io.emit(`analysis:${analysisId}:completed`, {
        analysisId,
        status: 'completed',
        result,
      });
    });

    // Job failure
    this.videoAnalysisQueue.on('failed', async (job: Job<VideoAnalysisJobData>, error: Error) => {
      const { analysisId } = job.data;
      
      console.error(`❌ Analysis ${analysisId} failed:`, error.message);
      
      // Update analysis status
      await Analysis.update(
        { 
          status: 'failed',
          error_message: error.message,
          completed_at: new Date(),
        },
        { where: { id: analysisId } }
      );
      
      // Emit failure event
      io.emit(`analysis:${analysisId}:failed`, {
        analysisId,
        status: 'failed',
        error: error.message,
      });
    });

    // Job stalled
    this.videoAnalysisQueue.on('stalled', async (job: Job<VideoAnalysisJobData>) => {
      const { analysisId } = job.data;
      console.warn(`⚠️ Analysis ${analysisId} stalled`);
    });
  }

  /**
   * Add video analysis job to queue
   */
  async addVideoAnalysisJob(
    analysisId: string,
    videoId: string,
    videoPath: string,
    options: {
      confidenceThreshold?: number;
      frameInterval?: number;
      priority?: number;
      delay?: number;
    } = {}
  ): Promise<Job<VideoAnalysisJobData>> {
    const jobData: VideoAnalysisJobData = {
      analysisId,
      videoId,
      videoPath,
      confidenceThreshold: options.confidenceThreshold || 0.7,
      frameInterval: options.frameInterval || 1,
    };

    const jobOptions: JobOptions = {
      priority: options.priority || 0,
      delay: options.delay || 0,
    };

    const job = await this.videoAnalysisQueue.add('analyze-video', jobData, jobOptions);
    
    console.log(`📋 Added analysis job ${analysisId} to queue with ID ${job.id}`);
    
    return job;
  }

  /**
   * Process video analysis job
   */
  private async processVideoAnalysis(job: Job<VideoAnalysisJobData>): Promise<any> {
    const { analysisId, videoId, videoPath, confidenceThreshold, frameInterval } = job.data;
    
    try {
      console.log(`🔄 Starting analysis ${analysisId} for video ${videoId}`);
      
      // Update analysis status to processing
      await Analysis.update(
        { status: 'processing', progress: 0 },
        { where: { id: analysisId } }
      );

      // Call AI service to start analysis
      const response = await axios.post(`${this.AI_SERVICE_URL}/analysis/start`, {
        video_path: videoPath,
        confidence_threshold: confidenceThreshold,
        frame_interval: frameInterval,
      });

      const aiAnalysisId = response.data.analysis_id;
      
      // Poll AI service for progress and results
      const result = await this.pollAIAnalysis(job, aiAnalysisId);
      
      // Store results in database
      await this.storeAnalysisResults(analysisId, result);
      
      return result;
      
    } catch (error) {
      console.error(`Analysis ${analysisId} processing error:`, error);
      throw error;
    }
  }

  /**
   * Poll AI service for analysis progress and results
   */
  private async pollAIAnalysis(job: Job<VideoAnalysisJobData>, aiAnalysisId: string): Promise<any> {
    const { analysisId } = job.data;
    let lastProgress = 0;
    
    while (true) {
      try {
        // Get analysis status from AI service
        const response = await axios.get(`${this.AI_SERVICE_URL}/analysis/${aiAnalysisId}`);
        const aiResult = response.data;
        
        // Update progress if changed
        if (aiResult.progress !== lastProgress) {
          lastProgress = aiResult.progress;
          await job.progress(aiResult.progress);
        }
        
        // Check if analysis is complete
        if (aiResult.status === 'completed') {
          return aiResult;
        }
        
        // Check if analysis failed
        if (aiResult.status === 'failed') {
          throw new Error(aiResult.error_message || 'AI analysis failed');
        }
        
        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        if ((error as any).response?.status === 404) {
          throw new Error('AI analysis not found');
        }
        throw error;
      }
    }
  }

  /**
   * Store analysis results in database
   */
  private async storeAnalysisResults(analysisId: string, aiResult: any): Promise<void> {
    try {
      // Update analysis record
      await Analysis.update(
        {
          total_frames: aiResult.total_frames,
          violent_frames: aiResult.violent_frames,
        },
        { where: { id: analysisId } }
      );

      // Store violence detections
      if (aiResult.detections && aiResult.detections.length > 0) {
        const detections = aiResult.detections.map((detection: ViolenceDetectionResult) => ({
          analysis_id: analysisId,
          timestamp_seconds: detection.timestampSeconds,
          confidence_score: detection.confidenceScore,
          frame_number: detection.frameNumber,
          bounding_boxes: detection.boundingBoxes || null,
        }));

        await ViolenceDetection.bulkCreate(detections);
      }

      console.log(`💾 Stored ${aiResult.detections?.length || 0} detections for analysis ${analysisId}`);
      
    } catch (error) {
      console.error('Error storing analysis results:', error);
      throw error;
    }
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId: string): Promise<any> {
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
    };
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
      return true;
      
    } catch (error) {
      console.error('Error canceling job:', error);
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
  }> {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.videoAnalysisQueue.getWaiting(),
      this.videoAnalysisQueue.getActive(),
      this.videoAnalysisQueue.getCompleted(),
      this.videoAnalysisQueue.getFailed(),
      this.videoAnalysisQueue.getDelayed(),
    ]);

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length,
    };
  }

  /**
   * Clean old jobs
   */
  async cleanOldJobs(olderThanMs: number = 24 * 60 * 60 * 1000): Promise<void> {
    await this.videoAnalysisQueue.clean(olderThanMs, 'completed');
    await this.videoAnalysisQueue.clean(olderThanMs, 'failed');
  }

  /**
   * Pause queue
   */
  async pauseQueue(): Promise<void> {
    await this.videoAnalysisQueue.pause();
  }

  /**
   * Resume queue
   */
  async resumeQueue(): Promise<void> {
    await this.videoAnalysisQueue.resume();
  }

  /**
   * Get queue health status
   */
  async getHealthStatus(): Promise<{ status: 'healthy' | 'unhealthy'; stats: any }> {
    try {
      const stats = await this.getQueueStats();
      const isHealthy = stats.active < 10 && stats.waiting < 100; // Adjust thresholds as needed
      
      return {
        status: isHealthy ? 'healthy' : 'unhealthy',
        stats,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        stats: null,
      };
    }
  }

  /**
   * Shutdown queue gracefully
   */
  async shutdown(): Promise<void> {
    await this.videoAnalysisQueue.close();
  }
}