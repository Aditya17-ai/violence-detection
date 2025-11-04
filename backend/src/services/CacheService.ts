import redisManager from '@/config/redis';

export class CacheService {
  private static readonly DEFAULT_TTL = 3600; // 1 hour
  private static readonly CACHE_PREFIX = 'violence_detection:';

  private static getKey(key: string): string {
    return `${this.CACHE_PREFIX}${key}`;
  }

  // Generic cache operations
  static async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const cacheKey = this.getKey(key);
    const serializedValue = JSON.stringify(value);
    await redisManager.set(cacheKey, serializedValue, ttlSeconds || this.DEFAULT_TTL);
  }

  static async get<T>(key: string): Promise<T | null> {
    const cacheKey = this.getKey(key);
    const value = await redisManager.get(cacheKey);
    
    if (!value) return null;
    
    try {
      return JSON.parse(value) as T;
    } catch (error) {
      console.error(`Error parsing cached value for key ${key}:`, error);
      await this.delete(key); // Remove corrupted cache entry
      return null;
    }
  }

  static async delete(key: string): Promise<boolean> {
    const cacheKey = this.getKey(key);
    const result = await redisManager.del(cacheKey);
    return result > 0;
  }

  static async exists(key: string): Promise<boolean> {
    const cacheKey = this.getKey(key);
    const result = await redisManager.exists(cacheKey);
    return result > 0;
  }

  // Video-specific cache operations
  static async cacheVideoMetadata(videoId: string, metadata: any, ttlSeconds = 7200): Promise<void> {
    await this.set(`video:${videoId}:metadata`, metadata, ttlSeconds);
  }

  static async getVideoMetadata(videoId: string): Promise<any | null> {
    return await this.get(`video:${videoId}:metadata`);
  }

  static async deleteVideoCache(videoId: string): Promise<void> {
    const pattern = `video:${videoId}:*`;
    const keys = await redisManager.keys(this.getKey(pattern));
    
    for (const key of keys) {
      await redisManager.del(key);
    }
  }

  // Analysis-specific cache operations
  static async cacheAnalysisProgress(analysisId: string, progress: number, ttlSeconds = 3600): Promise<void> {
    await this.set(`analysis:${analysisId}:progress`, { progress, timestamp: Date.now() }, ttlSeconds);
  }

  static async getAnalysisProgress(analysisId: string): Promise<{ progress: number; timestamp: number } | null> {
    return await this.get(`analysis:${analysisId}:progress`);
  }

  static async cacheAnalysisResult(analysisId: string, result: any, ttlSeconds = 86400): Promise<void> {
    await this.set(`analysis:${analysisId}:result`, result, ttlSeconds);
  }

  static async getAnalysisResult(analysisId: string): Promise<any | null> {
    return await this.get(`analysis:${analysisId}:result`);
  }

  static async deleteAnalysisCache(analysisId: string): Promise<void> {
    const pattern = `analysis:${analysisId}:*`;
    const keys = await redisManager.keys(this.getKey(pattern));
    
    for (const key of keys) {
      await redisManager.del(key);
    }
  }

  // Session management
  static async setSession(sessionId: string, sessionData: any, ttlSeconds = 86400): Promise<void> {
    await this.set(`session:${sessionId}`, sessionData, ttlSeconds);
  }

  static async getSession(sessionId: string): Promise<any | null> {
    return await this.get(`session:${sessionId}`);
  }

  static async deleteSession(sessionId: string): Promise<boolean> {
    return await this.delete(`session:${sessionId}`);
  }

  static async refreshSession(sessionId: string, ttlSeconds = 86400): Promise<boolean> {
    const cacheKey = this.getKey(`session:${sessionId}`);
    return await redisManager.expire(cacheKey, ttlSeconds);
  }

  // Rate limiting
  static async incrementRateLimit(identifier: string, windowSeconds = 900): Promise<number> {
    const key = `rate_limit:${identifier}`;
    const cacheKey = this.getKey(key);
    
    const current = await redisManager.get(cacheKey);
    const count = current ? parseInt(current, 10) + 1 : 1;
    
    await redisManager.set(cacheKey, count.toString(), windowSeconds);
    return count;
  }

  static async getRateLimit(identifier: string): Promise<number> {
    const key = `rate_limit:${identifier}`;
    const cacheKey = this.getKey(key);
    const value = await redisManager.get(cacheKey);
    return value ? parseInt(value, 10) : 0;
  }

  static async resetRateLimit(identifier: string): Promise<boolean> {
    return await this.delete(`rate_limit:${identifier}`);
  }

  // System statistics
  static async incrementCounter(counterName: string, ttlSeconds?: number): Promise<number> {
    const key = `counter:${counterName}`;
    const cacheKey = this.getKey(key);
    
    const current = await redisManager.get(cacheKey);
    const count = current ? parseInt(current, 10) + 1 : 1;
    
    await redisManager.set(cacheKey, count.toString(), ttlSeconds);
    return count;
  }

  static async getCounter(counterName: string): Promise<number> {
    const key = `counter:${counterName}`;
    const value = await this.get(key);
    return typeof value === 'number' ? value : 0;
  }

  // Bulk operations
  static async deletePattern(pattern: string): Promise<number> {
    const keys = await redisManager.keys(this.getKey(pattern));
    let deletedCount = 0;
    
    for (const key of keys) {
      const result = await redisManager.del(key);
      deletedCount += result;
    }
    
    return deletedCount;
  }

  // Health check
  static async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; latency?: number }> {
    try {
      const start = Date.now();
      await redisManager.set(this.getKey('health_check'), 'ok', 10);
      const latency = Date.now() - start;
      
      return { status: 'healthy', latency };
    } catch (error) {
      console.error('Redis health check failed:', error);
      return { status: 'unhealthy' };
    }
  }
}