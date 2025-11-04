import Joi from 'joi';

const envSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(3000),
  DATABASE_URL: Joi.string().optional(),
  REDIS_URL: Joi.string().optional(),
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('7d'),
  AWS_ACCESS_KEY_ID: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  AWS_SECRET_ACCESS_KEY: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  AWS_REGION: Joi.string().default('us-east-1'),
  S3_BUCKET_NAME: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  CORS_ORIGIN: Joi.string().default('http://localhost:5173'),
  AI_SERVICE_URL: Joi.string().default('http://localhost:8001'),
  MAX_FILE_SIZE: Joi.number().default(500000000), // 500MB
  ALLOWED_VIDEO_FORMATS: Joi.string().default('mp4,avi,mov,mkv'),
  CONFIDENCE_THRESHOLD: Joi.number().min(0).max(1).default(0.7),
  RATE_LIMIT_WINDOW_MS: Joi.number().default(900000), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: Joi.number().default(100)
}).unknown();

export const validateEnv = () => {
  const { error, value } = envSchema.validate(process.env);
  
  if (error) {
    throw new Error(`Environment validation error: ${error.message}`);
  }
  
  // Replace process.env with validated values
  Object.assign(process.env, value);
  
  console.log('✅ Environment variables validated successfully');
};