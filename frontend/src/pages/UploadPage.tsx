import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from 'react-query'
import toast from 'react-hot-toast'
import VideoUpload from '@/components/VideoUpload'
import { uploadVideo } from '@/services/api'
import { 
  PlayIcon, 
  ClockIcon, 
  ExclamationTriangleIcon,
  InformationCircleIcon 
} from '@heroicons/react/24/outline'

interface VideoFile {
  file: File
  preview?: string
}

export default function UploadPage() {
  const navigate = useNavigate()
  const [selectedFile, setSelectedFile] = useState<VideoFile | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)

  const uploadMutation = useMutation(uploadVideo, {
    onSuccess: (data) => {
      toast.success('Video uploaded successfully!')
      // Navigate to analysis page
      navigate(`/analysis/${data.data.id}`)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error?.message || 'Upload failed')
      setUploadProgress(0)
    },
  })

  const handleFileSelect = (file: File) => {
    setSelectedFile({ file })
    setUploadProgress(0)
  }

  const handleFileRemove = () => {
    setSelectedFile(null)
    setUploadProgress(0)
  }

  const handleUpload = async () => {
    if (!selectedFile) return

    const formData = new FormData()
    formData.append('video', selectedFile.file)

    // Simulate upload progress (in real implementation, you'd track actual progress)
    const progressInterval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 90) {
          clearInterval(progressInterval)
          return 90
        }
        return prev + 10
      })
    }, 200)

    try {
      await uploadMutation.mutateAsync(formData)
      setUploadProgress(100)
    } catch (error) {
      clearInterval(progressInterval)
      setUploadProgress(0)
    }
  }

  const isUploading = uploadMutation.isLoading
  const canUpload = selectedFile && !isUploading

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          Upload Video for Analysis
        </h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          Upload your video file to analyze it for violent content using our AI-powered detection system.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Upload Section */}
        <div className="lg:col-span-2 space-y-6">
          <VideoUpload
            onFileSelect={handleFileSelect}
            onFileRemove={handleFileRemove}
            selectedFile={selectedFile}
            isUploading={isUploading}
            uploadProgress={uploadProgress}
          />

          {/* Upload Button */}
          {canUpload && (
            <div className="flex justify-center">
              <button
                onClick={handleUpload}
                disabled={!canUpload}
                className="inline-flex items-center px-8 py-3 text-lg font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                <PlayIcon className="w-5 h-5 mr-2" />
                Start Analysis
              </button>
            </div>
          )}

          {/* Upload Status */}
          {isUploading && (
            <div className="card p-6">
              <div className="flex items-center space-x-3">
                <div className="spinner w-5 h-5"></div>
                <div>
                  <p className="font-medium text-gray-900">Processing Upload...</p>
                  <p className="text-sm text-gray-600">
                    Your video is being uploaded and prepared for analysis
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Info Sidebar */}
        <div className="space-y-6">
          {/* Process Info */}
          <div className="card p-6">
            <div className="flex items-center space-x-2 mb-4">
              <InformationCircleIcon className="w-5 h-5 text-blue-600" />
              <h3 className="font-semibold text-gray-900">How it Works</h3>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-semibold text-blue-600">1</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Upload Video</p>
                  <p className="text-xs text-gray-600">Select and upload your video file</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-semibold text-blue-600">2</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">AI Analysis</p>
                  <p className="text-xs text-gray-600">Our AI analyzes each frame for violent content</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-semibold text-blue-600">3</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Get Results</p>
                  <p className="text-xs text-gray-600">Receive detailed analysis with timestamps</p>
                </div>
              </div>
            </div>
          </div>

          {/* Processing Time */}
          <div className="card p-6">
            <div className="flex items-center space-x-2 mb-4">
              <ClockIcon className="w-5 h-5 text-warning-600" />
              <h3 className="font-semibold text-gray-900">Processing Time</h3>
            </div>
            
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Short videos (&lt;5 min):</span>
                <span className="font-medium">1-2 minutes</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Medium videos (5-30 min):</span>
                <span className="font-medium">3-10 minutes</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Long videos (&gt;30 min):</span>
                <span className="font-medium">10+ minutes</span>
              </div>
            </div>
            
            <p className="text-xs text-gray-500 mt-3">
              Processing time depends on video length, quality, and current system load.
            </p>
          </div>

          {/* Security Notice */}
          <div className="card p-6 bg-success-50 border-success-200">
            <div className="flex items-center space-x-2 mb-3">
              <ExclamationTriangleIcon className="w-5 h-5 text-success-600" />
              <h3 className="font-semibold text-success-900">Privacy & Security</h3>
            </div>
            
            <ul className="text-sm text-success-800 space-y-2">
              <li>• Your videos are processed securely</li>
              <li>• Files are automatically deleted after analysis</li>
              <li>• No video content is stored permanently</li>
              <li>• All data transmission is encrypted</li>
            </ul>
          </div>

          {/* Supported Formats */}
          <div className="card p-6">
            <h3 className="font-semibold text-gray-900 mb-3">Supported Formats</h3>
            
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-success-500 rounded-full"></div>
                <span>MP4</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-success-500 rounded-full"></div>
                <span>AVI</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-success-500 rounded-full"></div>
                <span>MOV</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-success-500 rounded-full"></div>
                <span>MKV</span>
              </div>
            </div>
            
            <p className="text-xs text-gray-500 mt-3">
              Maximum file size: 500MB
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}