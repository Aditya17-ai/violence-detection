import { v4 as uuidv4 } from 'uuid';
import { CacheService } from './CacheService';

export interface SessionData {
  id: string;
  userId?: string;
  createdAt: number;
  lastAccessedAt: number;
  ipAddress?: string;
  userAgent?: string;
  data: Record<string, any>;
}

export class SessionService {
  private static readonly SESSION_TTL = 86400; // 24 hours
  private static readonly CLEANUP_INTERVAL = 3600000; // 1 hour

  static {
    // Start cleanup interval
    setInterval(() => {
      this.cleanupExpiredSessions().catch(console.error);
    }, this.CLEANUP_INTERVAL);
  }

  static async createSession(
    userId?: string,
    ipAddress?: string,
    userAgent?: string,
    initialData: Record<string, any> = {}
  ): Promise<string> {
    const sessionId = uuidv4();
    const now = Date.now();

    const sessionData: SessionData = {
      id: sessionId,
      userId,
      createdAt: now,
      lastAccessedAt: now,
      ipAddress,
      userAgent,
      data: initialData,
    };

    await CacheService.setSession(sessionId, sessionData, this.SESSION_TTL);
    return sessionId;
  }

  static async getSession(sessionId: string): Promise<SessionData | null> {
    if (!sessionId) return null;

    const sessionData = await CacheService.getSession(sessionId);
    if (!sessionData) return null;

    // Update last accessed time
    sessionData.lastAccessedAt = Date.now();
    await CacheService.setSession(sessionId, sessionData, this.SESSION_TTL);

    return sessionData;
  }

  static async updateSession(
    sessionId: string,
    updates: Partial<Pick<SessionData, 'userId' | 'data'>>
  ): Promise<boolean> {
    const sessionData = await CacheService.getSession(sessionId);
    if (!sessionData) return false;

    const updatedSession: SessionData = {
      ...sessionData,
      ...updates,
      lastAccessedAt: Date.now(),
      data: updates.data ? { ...sessionData.data, ...updates.data } : sessionData.data,
    };

    await CacheService.setSession(sessionId, updatedSession, this.SESSION_TTL);
    return true;
  }

  static async setSessionData(
    sessionId: string,
    key: string,
    value: any
  ): Promise<boolean> {
    const sessionData = await CacheService.getSession(sessionId);
    if (!sessionData) return false;

    sessionData.data[key] = value;
    sessionData.lastAccessedAt = Date.now();

    await CacheService.setSession(sessionId, sessionData, this.SESSION_TTL);
    return true;
  }

  static async getSessionData(sessionId: string, key: string): Promise<any> {
    const sessionData = await this.getSession(sessionId);
    return sessionData?.data[key] || null;
  }

  static async removeSessionData(sessionId: string, key: string): Promise<boolean> {
    const sessionData = await CacheService.getSession(sessionId);
    if (!sessionData) return false;

    delete sessionData.data[key];
    sessionData.lastAccessedAt = Date.now();

    await CacheService.setSession(sessionId, sessionData, this.SESSION_TTL);
    return true;
  }

  static async destroySession(sessionId: string): Promise<boolean> {
    return await CacheService.deleteSession(sessionId);
  }

  static async refreshSession(sessionId: string): Promise<boolean> {
    const sessionData = await CacheService.getSession(sessionId);
    if (!sessionData) return false;

    sessionData.lastAccessedAt = Date.now();
    await CacheService.setSession(sessionId, sessionData, this.SESSION_TTL);
    return true;
  }

  static async getUserSessions(userId: string): Promise<SessionData[]> {
    // This is a simplified implementation
    // In production, you might want to maintain a separate index of user sessions
    return [];
  }

  static async destroyUserSessions(userId: string): Promise<number> {
    const userSessions = await this.getUserSessions(userId);
    let destroyedCount = 0;

    for (const session of userSessions) {
      const success = await this.destroySession(session.id);
      if (success) destroyedCount++;
    }

    return destroyedCount;
  }

  static async isSessionValid(sessionId: string): Promise<boolean> {
    const sessionData = await CacheService.getSession(sessionId);
    if (!sessionData) return false;

    const now = Date.now();
    const sessionAge = now - sessionData.createdAt;
    const maxAge = this.SESSION_TTL * 1000; // Convert to milliseconds

    return sessionAge < maxAge;
  }

  static async getSessionStats(): Promise<{
    totalSessions: number;
    activeSessions: number;
    averageSessionAge: number;
  }> {
    // Simplified implementation
    return {
      totalSessions: 0,
      activeSessions: 0,
      averageSessionAge: 0,
    };
  }

  private static async cleanupExpiredSessions(): Promise<number> {
    // Simplified implementation
    return 0;
  }
}