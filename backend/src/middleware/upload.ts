import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { createError } from './errorHandler';

// Allowed video formats
const ALLOWED_FORMATS = (process.env.ALLOWED_VIDEO_FORMATS || 'mp4,avi,mov,mkv').split(',');
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '500000000'); // 500MB default

// Configure multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Store in temp directory first, will be moved to cloud storage later
    const uploadDir = path.join(process.cwd(), 'temp-uploads');
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename
    const uniqueId = uuidv4();
    const extension = path.extname(file.originalname).toLowerCase();
    const filename = `${uniqueId}${extension}`;
    cb(null, filename);
  },
});

// File filter function
const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Check file extension
  const extension = path.extname(file.originalname).toLowerCase().substring(1);
  
  if (!ALLOWED_FORMATS.includes(extension)) {
    const error = createError(
      `Invalid file format. Allowed formats: ${ALLOWED_FORMATS.join(', ')}`,
      400
    );
    return cb(error);
  }

  // Check MIME type
  const allowedMimeTypes = [
    'video/mp4',
    'video/avi',
    'video/x-msvideo',
    'video/quicktime',
    'video/x-matroska',
  ];

  if (!allowedMimeTypes.includes(file.mimetype)) {
    const error = createError(
      'Invalid file type. Please upload a valid video file.',
      400
    );
    return cb(error);
  }

  cb(null, true);
};

// Configure multer
export const uploadVideo = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1, // Only allow one file at a time
  },
}).single('video');

// Middleware wrapper with error handling
export const handleVideoUpload = (req: any, res: any, next: any) => {
  uploadVideo(req, res, (err: any) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(createError(
          `File too large. Maximum size allowed: ${Math.round(MAX_FILE_SIZE / (1024 * 1024))}MB`,
          400
        ));
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return next(createError('Only one file allowed per upload', 400));
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return next(createError('Unexpected field name. Use "video" as the field name', 400));
      }
      return next(createError(`Upload error: ${err.message}`, 400));
    }
    
    if (err) {
      return next(err);
    }

    // Check if file was uploaded
    if (!req.file) {
      return next(createError('No video file provided', 400));
    }

    next();
  });
};

// Utility function to validate video file
export const validateVideoFile = (file: Express.Multer.File) => {
  const errors: string[] = [];

  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    errors.push(`File size exceeds maximum limit of ${Math.round(MAX_FILE_SIZE / (1024 * 1024))}MB`);
  }

  // Check file extension
  const extension = path.extname(file.originalname).toLowerCase().substring(1);
  if (!ALLOWED_FORMATS.includes(extension)) {
    errors.push(`Invalid file format. Allowed formats: ${ALLOWED_FORMATS.join(', ')}`);
  }

  // Check original filename
  if (!file.originalname || file.originalname.trim().length === 0) {
    errors.push('Invalid filename');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

// Utility function to get file info
export const getVideoFileInfo = (file: Express.Multer.File) => {
  const extension = path.extname(file.originalname).toLowerCase().substring(1);
  const sizeInMB = Math.round((file.size / (1024 * 1024)) * 100) / 100;

  return {
    originalName: file.originalname,
    filename: file.filename,
    size: file.size,
    sizeInMB,
    format: extension,
    mimetype: file.mimetype,
    path: file.path,
  };
};