import axios from 'axios'

// Create axios instance with base configuration
const api = axios.create({
  baseURL: (import.meta as any).env?.VITE_API_URL || 'http://localhost:3000',
  timeout: 30000, // 30 seconds
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor
api.interceptors.request.use(
  (config) => {
    // Add auth token if available
    const token = localStorage.getItem('auth_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor
api.interceptors.response.use(
  (response) => {
    return response
  },
  (error) => {
    // Handle common errors
    if (error.response?.status === 401) {
      // Unauthorized - clear token and redirect to login
      localStorage.removeItem('auth_token')
      // You might want to redirect to login page here
    }
    
    return Promise.reject(error)
  }
)

// API Types
export interface VideoUploadResponse {
  success: boolean
  message: string
  data: {
    id: string
    filename: string
    original_name: string
    file_size: number
    sizeInMB: number
    format: string
    uploaded_at: string
  }
}

export interface VideoMetadata {
  id: string
  filename: string
  original_name: string
  file_size: number
  duration?: number
  format: string
  uploaded_at: string
  sizeInMB: number
  durationFormatted?: string
}

export interface ViolenceDetection {
  id: string
  timestampSeconds: number
  confidenceScore: number
  frameNumber: number
  boundingBoxes?: Array<{
    x: number
    y: number
    width: number
    height: number
    confidence?: number
  }>
  timestampFormatted: string
  confidencePercentage: number
  severityLevel: 'low' | 'medium' | 'high' | 'critical'
}

export interface AnalysisResult {
  id: string
  videoId: string
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'
  progress: number
  startedAt: string
  completedAt?: string
  totalFrames?: number
  violentFrames: number
  confidenceThreshold: number
  errorMessage?: string
  video?: VideoMetadata
  detections: ViolenceDetection[]
  summary?: {
    totalViolentScenes: number
    averageConfidence: number
    mostViolentTimestamp?: number
    maxConfidence: number
  }
  duration?: number
  violencePercentage: number
}

export interface PaginatedResponse<T> {
  success: boolean
  data: {
    items: T[]
    pagination: {
      page: number
      limit: number
      total: number
      totalPages: number
      hasNext: boolean
      hasPrev: boolean
    }
  }
}

// Video API
export const uploadVideo = async (formData: FormData): Promise<VideoUploadResponse> => {
  const response = await api.post('/api/videos/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })
  return response.data
}

export const getVideo = async (videoId: string): Promise<{ success: boolean; data: VideoMetadata }> => {
  const response = await api.get(`/api/videos/${videoId}`)
  return response.data
}

export const deleteVideo = async (videoId: string): Promise<{ success: boolean; message: string }> => {
  const response = await api.delete(`/api/videos/${videoId}`)
  return response.data
}

export const getVideos = async (params?: {
  page?: number
  limit?: number
  format?: string
  sortBy?: string
  sortOrder?: string
}): Promise<PaginatedResponse<VideoMetadata>> => {
  const response = await api.get('/api/videos', { params })
  return response.data
}

export const getVideoStats = async (): Promise<{
  success: boolean
  data: {
    totalVideos: number
    totalSizeGB: number
    recentUploads: number
    formatDistribution: Array<{
      format: string
      count: number
      totalSizeGB: number
    }>
  }
}> => {
  const response = await api.get('/api/videos/stats')
  return response.data
}

// Analysis API
export const startAnalysis = async (
  videoId: string,
  options?: {
    confidenceThreshold?: number
    frameInterval?: number
  }
): Promise<{
  success: boolean
  message: string
  data: {
    analysisId: string
    jobId: string
    status: string
    progress: number
    estimatedDuration?: number
  }
}> => {
  const response = await api.post(`/api/analysis/start/${videoId}`, options)
  return response.data
}

export const getAnalysis = async (analysisId: string): Promise<{
  success: boolean
  data: AnalysisResult
  cached?: boolean
}> => {
  const response = await api.get(`/api/analysis/${analysisId}`)
  return response.data
}

export const stopAnalysis = async (analysisId: string): Promise<{
  success: boolean
  message: string
}> => {
  const response = await api.post(`/api/analysis/${analysisId}/stop`)
  return response.data
}

export const deleteAnalysis = async (analysisId: string): Promise<{
  success: boolean
  message: string
}> => {
  const response = await api.delete(`/api/analysis/${analysisId}`)
  return response.data
}

export const getAnalysisHistory = async (params?: {
  page?: number
  limit?: number
  status?: string
  videoId?: string
  sortBy?: string
  sortOrder?: string
}): Promise<PaginatedResponse<AnalysisResult>> => {
  const response = await api.get('/api/analysis/history', { params })
  return response.data
}

export const getAnalysisStats = async (): Promise<{
  success: boolean
  data: {
    totalAnalyses: number
    completedAnalyses: number
    failedAnalyses: number
    processingAnalyses: number
    recentAnalyses: number
    averageProcessingTime: number
    successRate: number
    queue: {
      waiting: number
      active: number
      completed: number
      failed: number
      delayed: number
    }
  }
}> => {
  const response = await api.get('/api/analysis/stats')
  return response.data
}

export const getSystemStatus = async (): Promise<{
  success: boolean
  data: {
    status: 'healthy' | 'degraded'
    load: {
      processing: number
      pending: number
      queueHealth: string
      queueStats: any
    }
    timestamp: string
  }
}> => {
  const response = await api.get('/api/analysis/system-status')
  return response.data
}

// Health API
export const getHealthStatus = async (): Promise<{
  status: 'healthy' | 'unhealthy'
  timestamp: string
  uptime: number
  environment: string
  version: string
  services: {
    database: 'connected' | 'disconnected' | 'unknown'
    redis: 'connected' | 'disconnected' | 'unknown'
    aiService: 'connected' | 'disconnected' | 'unknown'
  }
}> => {
  const response = await api.get('/health')
  return response.data
}

export default api