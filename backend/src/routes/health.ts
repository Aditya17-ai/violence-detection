import { Router, Request, Response } from 'express';
import { asyncHandler } from '@/middleware/errorHandler';
import { sequelize } from '@/config/database';
import { CacheService } from '@/services/CacheService';

const router = Router();

interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  uptime: number;
  environment: string;
  version: string;
  services: {
    database: 'connected' | 'disconnected' | 'unknown';
    redis: 'connected' | 'disconnected' | 'unknown';
    aiService: 'connected' | 'disconnected' | 'unknown';
  };
}

router.get('/', asyncHandler(async (req: Request, res: Response) => {
  // Check database connection
  let databaseStatus: 'connected' | 'disconnected' | 'unknown' = 'unknown';
  try {
    await sequelize.authenticate();
    databaseStatus = 'connected';
  } catch (error) {
    databaseStatus = 'disconnected';
  }

  // Check Redis connection
  const redisHealth = await CacheService.healthCheck();
  const redisStatus = redisHealth.status === 'healthy' ? 'connected' : 'disconnected';

  // Check AI service (placeholder for now)
  let aiServiceStatus: 'connected' | 'disconnected' | 'unknown' = 'unknown';
  try {
    // This will be implemented when AI service integration is ready
    aiServiceStatus = 'unknown';
  } catch (error) {
    aiServiceStatus = 'disconnected';
  }

  const overallStatus = 
    databaseStatus === 'connected' && redisStatus === 'connected' 
      ? 'healthy' 
      : 'unhealthy';

  const healthStatus: HealthStatus = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0',
    services: {
      database: databaseStatus,
      redis: redisStatus,
      aiService: aiServiceStatus
    }
  };

  const statusCode = overallStatus === 'healthy' ? 200 : 503;
  res.status(statusCode).json(healthStatus);
}));

router.get('/ping', asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json({ 
    message: 'pong',
    timestamp: new Date().toISOString()
  });
}));

export { router as healthRouter };