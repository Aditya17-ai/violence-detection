import { Sequelize } from 'sequelize-typescript';
import { connectDatabase, sequelize } from '@/config/database';
import { User } from '@/models/User';
import { Video } from '@/models/Video';
import { Analysis } from '@/models/Analysis';
import { ViolenceDetection } from '@/models/ViolenceDetection';

// Mock the actual database connection for testing
jest.mock('@/config/database', () => {
  const { Sequelize } = require('sequelize-typescript');
  
  const testSequelize = new Sequelize({
    dialect: 'sqlite',
    storage: ':memory:',
    logging: false,
    models: [
      require('@/models/User').User,
      require('@/models/Video').Video,
      require('@/models/Analysis').Analysis,
      require('@/models/ViolenceDetection').ViolenceDetection,
    ],
  });

  return {
    sequelize: testSequelize,
    connectDatabase: jest.fn().mockImplementation(async () => {
      await testSequelize.authenticate();
      await testSequelize.sync({ force: true });
    }),
  };
});

describe('Database Configuration', () => {
  beforeEach(async () => {
    // Reset the mock and sync the database
    jest.clearAllMocks();
    await sequelize.sync({ force: true });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  describe('Database Connection', () => {
    it('should connect to database successfully', async () => {
      await expect(connectDatabase()).resolves.not.toThrow();
      expect(connectDatabase).toHaveBeenCalled();
    });

    it('should authenticate database connection', async () => {
      await connectDatabase();
      await expect(sequelize.authenticate()).resolves.not.toThrow();
    });

    it('should have all models loaded', () => {
      const models = sequelize.models;
      
      expect(models.User).toBeDefined();
      expect(models.Video).toBeDefined();
      expect(models.Analysis).toBeDefined();
      expect(models.ViolenceDetection).toBeDefined();
    });
  });

  describe('Model Associations', () => {
    it('should have correct User-Video association', async () => {
      const user = await User.create({
        email: 'test@example.com',
        password_hash: '$2b$10$test.hash.here',
        first_name: 'Test',
        last_name: 'User',
      });

      const video = await Video.create({
        filename: 'test-video.mp4',
        original_name: 'Test Video.mp4',
        file_size: 1024000,
        format: 'mp4',
        storage_path: '/uploads/test-video.mp4',
        user_id: user.id,
      });

      const userWithVideos = await User.findByPk(user.id, { include: [Video] });
      const videoWithUser = await Video.findByPk(video.id, { include: [User] });

      expect(userWithVideos!.videos).toHaveLength(1);
      expect(userWithVideos!.videos[0].id).toBe(video.id);
      expect(videoWithUser!.user!.id).toBe(user.id);
    });

    it('should have correct Video-Analysis association', async () => {
      const video = await Video.create({
        filename: 'test-video.mp4',
        original_name: 'Test Video.mp4',
        file_size: 1024000,
        format: 'mp4',
        storage_path: '/uploads/test-video.mp4',
      });

      const analysis = await Analysis.create({
        video_id: video.id,
        status: 'pending',
      });

      const videoWithAnalyses = await Video.findByPk(video.id, { include: [Analysis] });
      const analysisWithVideo = await Analysis.findByPk(analysis.id, { include: [Video] });

      expect(videoWithAnalyses!.analyses).toHaveLength(1);
      expect(videoWithAnalyses!.analyses[0].id).toBe(analysis.id);
      expect(analysisWithVideo!.video.id).toBe(video.id);
    });

    it('should have correct Analysis-ViolenceDetection association', async () => {
      const video = await Video.create({
        filename: 'test-video.mp4',
        original_name: 'Test Video.mp4',
        file_size: 1024000,
        format: 'mp4',
        storage_path: '/uploads/test-video.mp4',
      });

      const analysis = await Analysis.create({
        video_id: video.id,
        status: 'pending',
      });

      const detection = await ViolenceDetection.create({
        analysis_id: analysis.id,
        timestamp_seconds: 10.5,
        confidence_score: 0.85,
        frame_number: 315,
      });

      const analysisWithDetections = await Analysis.findByPk(analysis.id, { 
        include: [ViolenceDetection] 
      });
      const detectionWithAnalysis = await ViolenceDetection.findByPk(detection.id, { 
        include: [Analysis] 
      });

      expect(analysisWithDetections!.detections).toHaveLength(1);
      expect(analysisWithDetections!.detections[0].id).toBe(detection.id);
      expect(detectionWithAnalysis!.analysis.id).toBe(analysis.id);
    });
  });

  describe('Cascade Operations', () => {
    it('should cascade delete analyses when video is deleted', async () => {
      const video = await Video.create({
        filename: 'test-video.mp4',
        original_name: 'Test Video.mp4',
        file_size: 1024000,
        format: 'mp4',
        storage_path: '/uploads/test-video.mp4',
      });

      const analysis = await Analysis.create({
        video_id: video.id,
        status: 'pending',
      });

      await video.destroy();

      const deletedAnalysis = await Analysis.findByPk(analysis.id);
      expect(deletedAnalysis).toBeNull();
    });

    it('should cascade delete detections when analysis is deleted', async () => {
      const video = await Video.create({
        filename: 'test-video.mp4',
        original_name: 'Test Video.mp4',
        file_size: 1024000,
        format: 'mp4',
        storage_path: '/uploads/test-video.mp4',
      });

      const analysis = await Analysis.create({
        video_id: video.id,
        status: 'pending',
      });

      const detection = await ViolenceDetection.create({
        analysis_id: analysis.id,
        timestamp_seconds: 10.5,
        confidence_score: 0.85,
        frame_number: 315,
      });

      await analysis.destroy();

      const deletedDetection = await ViolenceDetection.findByPk(detection.id);
      expect(deletedDetection).toBeNull();
    });

    it('should set user_id to null when user is deleted', async () => {
      const user = await User.create({
        email: 'test@example.com',
        password_hash: '$2b$10$test.hash.here',
      });

      const video = await Video.create({
        filename: 'test-video.mp4',
        original_name: 'Test Video.mp4',
        file_size: 1024000,
        format: 'mp4',
        storage_path: '/uploads/test-video.mp4',
        user_id: user.id,
      });

      await user.destroy();

      const updatedVideo = await Video.findByPk(video.id);
      expect(updatedVideo!.user_id).toBeNull();
    });
  });

  describe('Database Constraints', () => {
    it('should enforce unique email constraint', async () => {
      const email = 'duplicate@example.com';
      
      await User.create({
        email,
        password_hash: '$2b$10$test.hash.here',
      });

      await expect(
        User.create({
          email,
          password_hash: '$2b$10$another.hash.here',
        })
      ).rejects.toThrow();
    });

    it('should enforce foreign key constraints', async () => {
      const nonExistentVideoId = '00000000-0000-4000-8000-000000000000';

      await expect(
        Analysis.create({
          video_id: nonExistentVideoId,
          status: 'pending',
        })
      ).rejects.toThrow();
    });
  });

  describe('Database Transactions', () => {
    it('should support transactions', async () => {
      const transaction = await sequelize.transaction();

      try {
        const user = await User.create({
          email: 'transaction@example.com',
          password_hash: '$2b$10$test.hash.here',
        }, { transaction });

        const video = await Video.create({
          filename: 'transaction-video.mp4',
          original_name: 'Transaction Video.mp4',
          file_size: 1024000,
          format: 'mp4',
          storage_path: '/uploads/transaction-video.mp4',
          user_id: user.id,
        }, { transaction });

        await transaction.commit();

        const createdUser = await User.findByPk(user.id);
        const createdVideo = await Video.findByPk(video.id);

        expect(createdUser).toBeTruthy();
        expect(createdVideo).toBeTruthy();
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    });

    it('should rollback transactions on error', async () => {
      const transaction = await sequelize.transaction();

      try {
        await User.create({
          email: 'rollback@example.com',
          password_hash: '$2b$10$test.hash.here',
        }, { transaction });

        // This should cause an error (duplicate email)
        await User.create({
          email: 'rollback@example.com',
          password_hash: '$2b$10$another.hash.here',
        }, { transaction });

        await transaction.commit();
      } catch (error) {
        await transaction.rollback();
        
        // Verify that no user was created
        const user = await User.findOne({ where: { email: 'rollback@example.com' } });
        expect(user).toBeNull();
      }
    });
  });
});