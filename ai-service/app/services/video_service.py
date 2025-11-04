"""
Video processing service for frame extraction and analysis
"""

import os
import cv2
import numpy as np
import asyncio
import aiofiles
import tempfile
from typing import List, Tuple, Optional, AsyncGenerator
from uuid import uuid4
import logging
from pathlib import Path

import httpx
from app.core.config import get_settings
from app.core.exceptions import (
    VideoProcessingException,
    InvalidVideoFormatException,
    VideoTooLargeException
)

logger = logging.getLogger(__name__)


class VideoFrame:
    """Represents a single video frame"""
    
    def __init__(self, frame_data: np.ndarray, timestamp: float, frame_number: int):
        self.frame_data = frame_data
        self.timestamp = timestamp
        self.frame_number = frame_number
        self.height, self.width = frame_data.shape[:2]


class VideoInfo:
    """Video metadata information"""
    
    def __init__(self, width: int, height: int, fps: float, total_frames: int, duration: float):
        self.width = width
        self.height = height
        self.fps = fps
        self.total_frames = total_frames
        self.duration = duration


class VideoService:
    """Service for video processing and frame extraction"""
    
    def __init__(self):
        self.settings = get_settings()
        self.supported_formats = ['.mp4', '.avi', '.mov', '.mkv', '.webm']
        self.temp_dir = Path(self.settings.TEMP_DIR)
        self.temp_dir.mkdir(exist_ok=True)
    
    async def download_video(self, video_url: str) -> str:
        """Download video from URL to temporary file"""
        try:
            # Generate temporary filename
            temp_filename = f"{uuid4()}.mp4"
            temp_path = self.temp_dir / temp_filename
            
            # Download video
            async with httpx.AsyncClient(timeout=300.0) as client:
                async with client.stream('GET', video_url) as response:
                    response.raise_for_status()
                    
                    # Check content length
                    content_length = response.headers.get('content-length')
                    if content_length:
                        size_mb = int(content_length) / (1024 * 1024)
                        if size_mb > self.settings.MAX_VIDEO_SIZE_MB:
                            raise VideoTooLargeException(size_mb, self.settings.MAX_VIDEO_SIZE_MB)
                    
                    # Write to file
                    async with aiofiles.open(temp_path, 'wb') as f:
                        downloaded_size = 0
                        async for chunk in response.aiter_bytes(chunk_size=8192):
                            await f.write(chunk)
                            downloaded_size += len(chunk)
                            
                            # Check size during download
                            if downloaded_size > self.settings.MAX_VIDEO_SIZE_MB * 1024 * 1024:
                                await f.close()
                                temp_path.unlink(missing_ok=True)
                                raise VideoTooLargeException(
                                    downloaded_size / (1024 * 1024), 
                                    self.settings.MAX_VIDEO_SIZE_MB
                                )
            
            logger.info(f"Downloaded video to {temp_path}")
            return str(temp_path)
            
        except httpx.HTTPError as e:
            logger.error(f"Failed to download video: {e}")
            raise VideoProcessingException(f"Failed to download video: {str(e)}")
        except Exception as e:
            logger.error(f"Unexpected error downloading video: {e}")
            raise VideoProcessingException(f"Unexpected error: {str(e)}")
    
    async def save_uploaded_file(self, file_content: bytes, filename: str) -> str:
        """Save uploaded file content to temporary file"""
        try:
            # Validate file size
            size_mb = len(file_content) / (1024 * 1024)
            if size_mb > self.settings.MAX_VIDEO_SIZE_MB:
                raise VideoTooLargeException(size_mb, self.settings.MAX_VIDEO_SIZE_MB)
            
            # Validate file extension
            file_ext = Path(filename).suffix.lower()
            if file_ext not in self.supported_formats:
                raise InvalidVideoFormatException(file_ext)
            
            # Generate temporary filename
            temp_filename = f"{uuid4()}{file_ext}"
            temp_path = self.temp_dir / temp_filename
            
            # Write file
            async with aiofiles.open(temp_path, 'wb') as f:
                await f.write(file_content)
            
            logger.info(f"Saved uploaded file to {temp_path}")
            return str(temp_path)
            
        except Exception as e:
            logger.error(f"Failed to save uploaded file: {e}")
            raise VideoProcessingException(f"Failed to save file: {str(e)}")
    
    def get_video_info(self, video_path: str) -> VideoInfo:
        """Extract video metadata"""
        try:
            cap = cv2.VideoCapture(video_path)
            
            if not cap.isOpened():
                raise VideoProcessingException(f"Cannot open video file: {video_path}")
            
            # Get video properties
            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            fps = cap.get(cv2.CAP_PROP_FPS)
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            
            # Calculate duration
            duration = total_frames / fps if fps > 0 else 0
            
            cap.release()
            
            logger.info(f"Video info: {width}x{height}, {fps} FPS, {total_frames} frames, {duration:.2f}s")
            
            return VideoInfo(width, height, fps, total_frames, duration)
            
        except Exception as e:
            logger.error(f"Failed to get video info: {e}")
            raise VideoProcessingException(f"Failed to analyze video: {str(e)}")
    
    async def extract_frames(
        self, 
        video_path: str, 
        interval_seconds: float = 1.0,
        max_frames: Optional[int] = None
    ) -> AsyncGenerator[VideoFrame, None]:
        """Extract frames from video at specified intervals"""
        try:
            cap = cv2.VideoCapture(video_path)
            
            if not cap.isOpened():
                raise VideoProcessingException(f"Cannot open video file: {video_path}")
            
            fps = cap.get(cv2.CAP_PROP_FPS)
            if fps <= 0:
                raise VideoProcessingException("Invalid video FPS")
            
            frame_interval = int(fps * interval_seconds)
            frame_count = 0
            extracted_count = 0
            
            logger.info(f"Extracting frames every {interval_seconds}s (every {frame_interval} frames)")
            
            while True:
                ret, frame = cap.read()
                
                if not ret:
                    break
                
                # Extract frame at intervals
                if frame_count % frame_interval == 0:
                    timestamp = frame_count / fps
                    
                    # Convert BGR to RGB
                    frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                    
                    yield VideoFrame(frame_rgb, timestamp, frame_count)
                    
                    extracted_count += 1
                    
                    # Check max frames limit
                    if max_frames and extracted_count >= max_frames:
                        break
                    
                    # Yield control to event loop
                    if extracted_count % 10 == 0:
                        await asyncio.sleep(0)
                
                frame_count += 1
            
            cap.release()
            logger.info(f"Extracted {extracted_count} frames from {frame_count} total frames")
            
        except Exception as e:
            logger.error(f"Failed to extract frames: {e}")
            raise VideoProcessingException(f"Frame extraction failed: {str(e)}")
    
    async def extract_frame_at_timestamp(self, video_path: str, timestamp: float) -> VideoFrame:
        """Extract a single frame at specific timestamp"""
        try:
            cap = cv2.VideoCapture(video_path)
            
            if not cap.isOpened():
                raise VideoProcessingException(f"Cannot open video file: {video_path}")
            
            # Seek to timestamp
            cap.set(cv2.CAP_PROP_POS_MSEC, timestamp * 1000)
            
            ret, frame = cap.read()
            if not ret:
                raise VideoProcessingException(f"Cannot read frame at timestamp {timestamp}")
            
            # Get actual frame number and timestamp
            frame_number = int(cap.get(cv2.CAP_PROP_POS_FRAMES))
            actual_timestamp = cap.get(cv2.CAP_PROP_POS_MSEC) / 1000.0
            
            # Convert BGR to RGB
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            
            cap.release()
            
            return VideoFrame(frame_rgb, actual_timestamp, frame_number)
            
        except Exception as e:
            logger.error(f"Failed to extract frame at timestamp {timestamp}: {e}")
            raise VideoProcessingException(f"Frame extraction failed: {str(e)}")
    
    def preprocess_frame(self, frame: VideoFrame, target_size: Tuple[int, int] = (224, 224)) -> np.ndarray:
        """Preprocess frame for model input"""
        try:
            # Resize frame
            resized = cv2.resize(frame.frame_data, target_size)
            
            # Normalize to [0, 1]
            normalized = resized.astype(np.float32) / 255.0
            
            # Add batch dimension
            preprocessed = np.expand_dims(normalized, axis=0)
            
            return preprocessed
            
        except Exception as e:
            logger.error(f"Failed to preprocess frame: {e}")
            raise VideoProcessingException(f"Frame preprocessing failed: {str(e)}")
    
    def cleanup_temp_file(self, file_path: str) -> None:
        """Clean up temporary file"""
        try:
            if os.path.exists(file_path):
                os.unlink(file_path)
                logger.info(f"Cleaned up temporary file: {file_path}")
        except Exception as e:
            logger.warning(f"Failed to cleanup temp file {file_path}: {e}")
    
    async def cleanup_old_temp_files(self, max_age_hours: int = 24) -> int:
        """Clean up old temporary files"""
        try:
            import time
            current_time = time.time()
            max_age_seconds = max_age_hours * 3600
            cleaned_count = 0
            
            for file_path in self.temp_dir.iterdir():
                if file_path.is_file():
                    file_age = current_time - file_path.stat().st_mtime
                    if file_age > max_age_seconds:
                        try:
                            file_path.unlink()
                            cleaned_count += 1
                        except Exception as e:
                            logger.warning(f"Failed to delete old temp file {file_path}: {e}")
            
            if cleaned_count > 0:
                logger.info(f"Cleaned up {cleaned_count} old temporary files")
            
            return cleaned_count
            
        except Exception as e:
            logger.error(f"Failed to cleanup old temp files: {e}")
            return 0
    
    def validate_video_format(self, file_path: str) -> bool:
        """Validate video format using OpenCV"""
        try:
            cap = cv2.VideoCapture(file_path)
            is_valid = cap.isOpened()
            cap.release()
            return is_valid
        except Exception:
            return False
    
    async def get_video_thumbnail(self, video_path: str, timestamp: float = 1.0) -> np.ndarray:
        """Extract thumbnail from video at specified timestamp"""
        try:
            frame = await self.extract_frame_at_timestamp(video_path, timestamp)
            
            # Resize to thumbnail size
            thumbnail_size = (320, 240)
            thumbnail = cv2.resize(frame.frame_data, thumbnail_size)
            
            return thumbnail
            
        except Exception as e:
            logger.error(f"Failed to generate thumbnail: {e}")
            raise VideoProcessingException(f"Thumbnail generation failed: {str(e)}")
    
    def get_supported_formats(self) -> List[str]:
        """Get list of supported video formats"""
        return self.supported_formats.copy()
    
    async def analyze_uploaded_file(
        self, 
        file, 
        model_service, 
        confidence_threshold: float = 0.7,
        frame_interval: int = 1
    ) -> str:
        """Analyze uploaded video file"""
        # This is a placeholder - will be implemented when model service is ready
        analysis_id = str(uuid4())
        logger.info(f"Started analysis {analysis_id} for uploaded file")
        return analysis_id
    
    async def analyze_video_url(
        self, 
        video_url: str, 
        model_service, 
        confidence_threshold: float = 0.7,
        frame_interval: int = 1
    ) -> str:
        """Analyze video from URL"""
        # This is a placeholder - will be implemented when model service is ready
        analysis_id = str(uuid4())
        logger.info(f"Started analysis {analysis_id} for video URL: {video_url}")
        return analysis_id
    
    async def get_analysis_result(self, analysis_id: str):
        """Get analysis result"""
        # This is a placeholder - will be implemented with proper storage
        return None
    
    async def stop_analysis(self, analysis_id: str) -> bool:
        """Stop ongoing analysis"""
        # This is a placeholder - will be implemented with proper job management
        logger.info(f"Stopped analysis {analysis_id}")
        return True
    
    async def list_analyses(self, status: Optional[str] = None, limit: int = 10, offset: int = 0):
        """List analyses"""
        # This is a placeholder - will be implemented with proper storage
        return []
    
    async def delete_analysis(self, analysis_id: str) -> bool:
        """Delete analysis"""
        # This is a placeholder - will be implemented with proper storage
        logger.info(f"Deleted analysis {analysis_id}")
        return True