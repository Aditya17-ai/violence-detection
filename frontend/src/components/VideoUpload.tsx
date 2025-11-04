import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { CloudArrowUpIcon, DocumentIcon, XMarkIcon } from '@heroicons/react/24/outline'
import clsx from 'clsx'

interface VideoFile {
  file: File
  preview?: string
}

interface VideoUploadProps {
  onFileSelect: (file: File) => void
  onFileRemove: () => void
  isUploading?: boolean
  uploadProgress?: number
  maxSize?: number // in MB
  acceptedFormats?: string[]
  selectedFile?: VideoFile | null
}

const defaultAcceptedFormats = ['mp4', 'avi', 'mov', 'mkv']
const defaultMaxSize = 500 // 500MB

export default function VideoUpload({
  onFileSelect,
  onFileRemove,
  isUploading = false,
  uploadProgress = 0,
  maxSize = defaultMaxSize,
  acceptedFormats = defaultAcceptedFormats,
  selectedFile = null,
}: VideoUploadProps) {
  const [dragActive, setDragActive] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const validateFile = useCallback((file: File): string | null => {
    // Check file size
    const fileSizeMB = file.size / (1024 * 1024)
    if (fileSizeMB > maxSize) {
      return `File size (${fileSizeMB.toFixed(1)}MB) exceeds maximum allowed size of ${maxSize}MB`
    }

    // Check file format
    const fileExtension = file.name.split('.').pop()?.toLowerCase()
    if (!fileExtension || !acceptedFormats.includes(fileExtension)) {
      return `File format not supported. Accepted formats: ${acceptedFormats.join(', ')}`
    }

    return null
  }, [maxSize, acceptedFormats])

  const onDrop = useCallback((acceptedFiles: File[], rejectedFiles: any[]) => {
    setError(null)
    setDragActive(false)

    if (rejectedFiles.length > 0) {
      const rejection = rejectedFiles[0]
      if (rejection.errors[0]?.code === 'file-too-large') {
        setError(`File too large. Maximum size: ${maxSize}MB`)
      } else if (rejection.errors[0]?.code === 'file-invalid-type') {
        setError(`Invalid file type. Accepted formats: ${acceptedFormats.join(', ')}`)
      } else {
        setError('File upload failed. Please try again.')
      }
      return
    }

    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0]
      const validationError = validateFile(file)
      
      if (validationError) {
        setError(validationError)
        return
      }

      onFileSelect(file)
    }
  }, [onFileSelect, validateFile, maxSize, acceptedFormats])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    onDragEnter: () => setDragActive(true),
    onDragLeave: () => setDragActive(false),
    accept: {
      'video/*': acceptedFormats.map(format => `.${format}`)
    },
    maxSize: maxSize * 1024 * 1024, // Convert MB to bytes
    multiple: false,
    disabled: isUploading,
  })

  const handleRemoveFile = () => {
    setError(null)
    onFileRemove()
  }

  const formatFileSize = (bytes: number): string => {
    const mb = bytes / (1024 * 1024)
    return `${mb.toFixed(1)} MB`
  }



  if (selectedFile && !isUploading) {
    return (
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">Selected Video</h3>
          <button
            onClick={handleRemoveFile}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
            disabled={isUploading}
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-start space-x-4">
          <div className="flex-shrink-0">
            <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center">
              <DocumentIcon className="w-8 h-8 text-gray-400" />
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {selectedFile.file.name}
            </p>
            <p className="text-sm text-gray-500">
              {formatFileSize(selectedFile.file.size)}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Format: {selectedFile.file.name.split('.').pop()?.toUpperCase()}
            </p>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-danger-50 border border-danger-200 rounded-md">
            <p className="text-sm text-danger-800">{error}</p>
          </div>
        )}
      </div>
    )
  }

  if (isUploading) {
    return (
      <div className="card p-6">
        <div className="text-center">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CloudArrowUpIcon className="w-8 h-8 text-blue-600 animate-bounce" />
          </div>
          
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Uploading Video...
          </h3>
          
          <div className="progress-bar mb-2">
            <div 
              className="progress-fill" 
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          
          <p className="text-sm text-gray-600">
            {uploadProgress}% complete
          </p>
          
          {selectedFile && (
            <p className="text-xs text-gray-500 mt-2">
              {selectedFile.file.name} ({formatFileSize(selectedFile.file.size)})
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={clsx(
          'dropzone cursor-pointer transition-all duration-200',
          {
            'active': isDragActive || dragActive,
            'border-gray-300 hover:border-gray-400': !isDragActive && !dragActive,
          }
        )}
      >
        <input {...getInputProps()} />
        
        <div className="text-center">
          <CloudArrowUpIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          
          <div className="space-y-2">
            <p className="text-lg font-medium text-gray-900">
              {isDragActive ? 'Drop your video here' : 'Upload a video file'}
            </p>
            
            <p className="text-sm text-gray-600">
              Drag and drop your video file here, or click to browse
            </p>
            
            <div className="text-xs text-gray-500 space-y-1">
              <p>Supported formats: {acceptedFormats.map(f => f.toUpperCase()).join(', ')}</p>
              <p>Maximum file size: {maxSize}MB</p>
            </div>
          </div>
          
          <button
            type="button"
            className="inline-flex items-center px-4 py-2 mt-4 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            disabled={isUploading}
          >
            Choose File
          </button>
        </div>
      </div>

      {error && (
        <div className="alert-danger">
          <p className="text-sm">{error}</p>
        </div>
      )}

      <div className="bg-gray-50 rounded-lg p-4">
        <h4 className="text-sm font-medium text-gray-900 mb-2">Upload Guidelines</h4>
        <ul className="text-xs text-gray-600 space-y-1">
          <li>• Ensure your video is in one of the supported formats</li>
          <li>• Keep file size under {maxSize}MB for optimal processing</li>
          <li>• Higher quality videos may take longer to analyze</li>
          <li>• Your video will be securely processed and automatically deleted after analysis</li>
        </ul>
      </div>
    </div>
  )
}