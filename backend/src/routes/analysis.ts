import { Router } from 'express';
import { AnalysisController } from '@/controllers/AnalysisController';
import { validateRequest } from '@/middleware/validation';
import Joi from 'joi';

const router = Router();

// Validation schemas
const startAnalysisSchema = {
  params: Joi.object({
    videoId: Joi.string().uuid().required(),
  }),
  body: Joi.object({
    confidenceThreshold: Joi.number().min(0).max(1).default(0.7),
    frameInterval: Joi.number().integer().min(1).default(1),
    priority: Joi.number().integer().min(-10).max(10).default(0),
  }),
};

const getAnalysisSchema = {
  params: Joi.object({
    analysisId: Joi.string().uuid().required(),
  }),
};

const getAnalysisHistorySchema = {
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    status: Joi.string().valid('pending', 'processing', 'completed', 'failed', 'cancelled').optional(),
    videoId: Joi.string().uuid().optional(),
    sortBy: Joi.string().valid('started_at', 'completed_at', 'progress', 'status').default('started_at'),
    sortOrder: Joi.string().valid('ASC', 'DESC').default('DESC'),
  }),
};

// Routes
router.post('/start/:videoId', validateRequest(startAnalysisSchema), AnalysisController.startAnalysis);
router.get('/stats', AnalysisController.getAnalysisStats);
router.get('/history', validateRequest(getAnalysisHistorySchema), AnalysisController.getAnalysisHistory);
router.get('/:analysisId', validateRequest(getAnalysisSchema), AnalysisController.getAnalysis);
router.post('/:analysisId/stop', validateRequest(getAnalysisSchema), AnalysisController.stopAnalysis);
router.post('/:analysisId/retry', validateRequest(getAnalysisSchema), AnalysisController.retryAnalysis);
router.delete('/:analysisId', validateRequest(getAnalysisSchema), AnalysisController.deleteAnalysis);

export { router as analysisRouter };