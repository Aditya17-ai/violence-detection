import { Router } from 'express';
import { VideoController } from '../controllers/VideoController';
import { handleVideoUpload } from '../middleware/upload';
import { validateRequest } from '../middleware/validation';
import Joi from 'joi';

const router = Router();

// Validation schemas
const getVideoSchema = {
  params: Joi.object({
    id: Joi.string().uuid().required(),
  }),
};

const getVideosSchema = {
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    format: Joi.string().valid('mp4', 'avi', 'mov', 'mkv').optional(),
    sortBy: Joi.string().valid('uploaded_at', 'file_size', 'original_name').default('uploaded_at'),
    sortOrder: Joi.string().valid('ASC', 'DESC').default('DESC'),
  }),
};

// Routes
router.post('/upload', handleVideoUpload, VideoController.uploadVideo);
router.get('/stats', VideoController.getUploadStats);
router.get('/', validateRequest(getVideosSchema), VideoController.getVideos);
router.get('/:id', validateRequest(getVideoSchema), VideoController.getVideo);
router.get('/:id/stream', validateRequest(getVideoSchema), VideoController.streamVideo);
router.delete('/:id', validateRequest(getVideoSchema), VideoController.deleteVideo);

export { router as videoRouter };