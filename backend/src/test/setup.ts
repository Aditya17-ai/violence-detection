import { Sequelize } from 'sequelize-typescript';
import { User } from '@/models/User';
import { Video } from '@/models/Video';
import { Analysis } from '@/models/Analysis';
import { ViolenceDetection } from '@/models/ViolenceDetection';

// Test database setup
export const testSequelize = new Sequelize({
  dialect: 'sqlite',
  storage: ':memory:',
  logging: false,
  models: [User, Video, Analysis, ViolenceDetection],
});

// Setup function to run before all tests
export const setupTestDatabase = async (): Promise<void> => {
  await testSequelize.sync({ force: true });
};

// Cleanup function to run after all tests
export const teardownTestDatabase = async (): Promise<void> => {
  await testSequelize.close();
};

// Helper function to create test user
export const createTestUser = async (overrides: Partial<any> = {}): Promise<User> => {
  return await User.create({
    email: 'test@example.com',
    password_hash: '$2b$10$test.hash.here',
    first_name: 'Test',
    last_name: 'User',
    role: 'user',
    ...overrides,
  });
};

// Helper function to create test video
export const createTestVideo = async (userId?: string, overrides: Partial<any> = {}): Promise<Video> => {
  return await Video.create({
    filename: 'test-video.mp4',
    original_name: 'Test Video.mp4',
    file_size: 1024000,
    duration: 120,
    format: 'mp4',
    storage_path: '/uploads/test-video.mp4',
    user_id: userId,
    ...overrides,
  });
};

// Helper function to create test analysis
export const createTestAnalysis = async (videoId: string, overrides: Partial<any> = {}): Promise<Analysis> => {
  return await Analysis.create({
    video_id: videoId,
    status: 'pending',
    progress: 0,
    confidence_threshold: 0.7,
    ...overrides,
  });
};

// Helper function to create test violence detection
export const createTestViolenceDetection = async (
  analysisId: string,
  overrides: Partial<any> = {}
): Promise<ViolenceDetection> => {
  return await ViolenceDetection.create({
    analysis_id: analysisId,
    timestamp_seconds: 10.5,
    confidence_score: 0.85,
    frame_number: 315,
    ...overrides,
  });
};

// Global test setup
beforeAll(async () => {
  await setupTestDatabase();
});

afterAll(async () => {
  await teardownTestDatabase();
});

// Clean database before each test
beforeEach(async () => {
  await testSequelize.sync({ force: true });
});