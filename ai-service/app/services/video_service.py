"""
Video processing service for frame extraction and analysis
"""

import os
import cv2
import numpy as np
import logging
from typing import List, Tuple, Optional, Generator
from pathlib import Path
import tempfile
import asyncio
from concurrent.futures import ThreadPoolExecutor

from app.core.config import get_settings
from app.core.exceptions import (
    VideoProcessingException,
    InvalidVideoFormatException,
    VideoTooLargeException
)

logger = logging.getLogger(__name__)


class VideoService:
    """Service for video processing and frame extraction"""
    
    def __init__(self):
        self.settings = get_settings()
        self.executor = ThreadPoolExecutor(max_workers=4)
        
        # Supported video formats
        self.supported_formats = ['.mp4', '.avi', '.mov', '.mkv', '.webm', '.flv', '.wmv']
        
    async def validate_video_file(self, video_path: str) -> dict:
        """Validate video file and return metadata"""
        try:
            if not os.path.exists(video_path):
                raise VideoProcessingException(f"Video file not found: {video_path}")
            
            # Check file size
            file_size = os.path.getsize(video_path)
            file_size_mb = file_size / (1024 * 1024)
            
            if file_size_mb > self.settings.MAX_VIDEO_SIZE_MB:
                raise VideoTooLargeException(file_size_mb, self.settings.MAX_VIDEO_SIZE_MB)
            
            # Check file extension
            file_ext = Path(video_path).suffix.lower()
            if file_ext not in self.supported_formats:
                raise InvalidVideoFormatException(file_ext)
            
            # Get video metadata using OpenCV
            metadata = await self._get_video_metadata(video_path)
            
            return {
                "path": video_path,
                "size_bytes": file_size,
                "size_mb": round(file_size_mb, 2),
                "format": file_ext,
                "valid": True,
                **metadata
            }
            
        except Exception as e:
            logger.error(f"Video validation failed: {e}")
            if isinstance(e, (VideoProcessingException, InvalidVideoFormatException, VideoTooLargeException)):
                raise
            raise VideoProcessingException(f"Video validation failed: {str(e)}")
    
    async def _get_video_metadata(self, video_path: str) -> dict:
        """Extract video metadata using OpenCV"""
        def _extract_metadata():
            cap = cv2.VideoCapture(video_path)
            
            if not cap.isOpened():
                raise VideoProcessingException("Could not open video file")
            
            try:
                # Get video properties
                fps = cap.get(cv2.CAP_PROP_FPS)
                frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
                width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                
                # Calculate duration
                duration = frame_count / fps if fps > 0 else 0
                
                return {
                    "fps": fps,
                    "frame_count": frame_count,
                    "width": width,
                    "height": height,
                    "duration_seconds": round(duration, 2),
                    "duration_formatted": self._format_duration(duration)
                }
                
            finally:
                cap.release()
        
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(self.executor, _extract_metadata)
    
    def _format_duration(self, seconds: float) -> str:
        """Format duration in HH:MM:SS format"""
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = int(seconds % 60)
        
        if hours > 0:
            return f"{hours:02d}:{minutes:02d}:{secs:02d}"
        else:
            return f"{minutes:02d}:{secs:02d}"
    
    async def extract_frames(
        self, 
        video_path: str, 
        interval_seconds: int = 1,
        max_frames: Optional[int] = None
    ) -> List[Tuple[np.ndarray, float, int]]:
        """
        Extract frames from video at specified intervals
        
        Returns:
            List of tuples: (frame_array, timestamp_seconds, frame_number)
        """
        try:
            # Validate video first
            metadata = await self.validate_video_file(video_path)
            
            def _extract():
                cap = cv2.VideoCapture(video_path)
                
                if not cap.isOpened():
                    raise VideoProcessingException("Could not open video file for frame extraction")
                
                frames = []
                fps = cap.get(cv2.CAP_PROP_FPS)
                frame_interval = int(fps * interval_seconds)  # Convert seconds to frame count
                
                try:
                    frame_number = 0
                    extracted_count = 0
                    
                    while True:
                        ret, frame = cap.read()
                        
                        if not ret:
                            break
                        
                        # Extract frame at specified interval
                        if frame_number % frame_interval == 0:
                            timestamp = frame_number / fps
                            frames.append((frame.copy(), timestamp, frame_number))
                            extracted_count += 1
                            
                            # Check max frames limit
                            if max_frames and extracted_count >= max_frames:
                                break
                        
                        frame_number += 1
                    
                    logger.info(f"Extracted {len(frames)} frames from video {video_path}")
                    return frames
                    
                finally:
                    cap.release()
            
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(self.executor, _extract)
            
        except Exception as e:
            logger.error(f"Frame extraction failed: {e}")
            if isinstance(e, (VideoProcessingException, InvalidVideoFormatException)):
                raise
            raise VideoProcessingException(f"Frame extraction failed: {str(e)}")
    
    async def extract_frames_generator(
        self, 
        video_path: str, 
        interval_seconds: int = 1
    ) -> Generator[Tuple[np.ndarray, float, int], None, None]:
        """
        Generator version of frame extraction for memory efficiency
        
        Yields:
            Tuples: (frame_array, timestamp_seconds, frame_number)
        """
        try:
            # Validate video first
            await self.validate_video_file(video_path)
            
            cap = cv2.VideoCapture(video_path)
            
            if not cap.isOpened():
                raise VideoProcessingException("Could not open video file for frame extraction")
            
            fps = cap.get(cv2.CAP_PROP_FPS)
            frame_interval = int(fps * interval_seconds)
            
            try:
                frame_number = 0
                
                while True:
                    ret, frame = cap.read()
                    
                    if not ret:
                        break
                    
                    # Yield frame at specified interval
                    if frame_number % frame_interval == 0:
                        timestamp = frame_number / fps
                        yield (frame.copy(), timestamp, frame_number)
                    
                    frame_number += 1
                    
            finally:
                cap.release()
                
        except Exception as e:
            logger.error(f"Frame extraction generator failed: {e}")
            if isinstance(e, (VideoProcessingException, InvalidVideoFormatException)):
                raise
            raise VideoProcessingException(f"Frame extraction failed: {str(e)}")
    
    async def extract_frame_at_timestamp(
        self, 
        video_path: str, 
        timestamp_seconds: float
    ) -> Optional[np.ndarray]:
        """Extract a single frame at specific timestamp"""
        try:
            def _extract_single_frame():
                cap = cv2.VideoCapture(video_path)
                
                if not cap.isOpened():
                    raise VideoProcessingException("Could not open video file")
                
                try:
                    fps = cap.get(cv2.CAP_PROP_FPS)
                    frame_number = int(timestamp_seconds * fps)
                    
                    # Seek to specific frame
                    cap.set(cv2.CAP_PROP_POS_FRAMES, frame_number)
                    
                    ret, frame = cap.read()
                    
                    if ret:
                        return frame.copy()
                    else:
                        return None
                        
                finally:
                    cap.release()
            
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(self.executor, _extract_single_frame)
            
        except Exception as e:
            logger.error(f"Single frame extraction failed: {e}")
            raise VideoProcessingException(f"Frame extraction at timestamp {timestamp_seconds} failed: {str(e)}")
    
    async def preprocess_frame(self, frame: np.ndarray, target_size: Tuple[int, int] = (224, 224)) -> np.ndarray:
        """Preprocess frame for model input"""
        try:
            def _preprocess():
                # Resize frame
                resized = cv2.resize(frame, target_size)
                
                # Convert BGR to RGB
                rgb_frame = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)
                
                # Normalize pixel values to [0, 1]
                normalized = rgb_frame.astype(np.float32) / 255.0
                
                return normalized
            
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(self.executor, _preprocess)
            
        except Exception as e:
            logger.error(f"Frame preprocessing failed: {e}")
            raise VideoProcessingException(f"Frame preprocessing failed: {str(e)}")
    
    async def create_video_thumbnail(
        self, 
        video_path: str, 
        timestamp_seconds: float = None,
        output_path: str = None
    ) -> str:
        """Create thumbnail image from video"""
        try:
            # Use middle of video if no timestamp specified
            if timestamp_seconds is None:
                metadata = await self._get_video_metadata(video_path)
                timestamp_seconds = metadata['duration_seconds'] / 2
            
            # Extract frame at timestamp
            frame = await self.extract_frame_at_timestamp(video_path, timestamp_seconds)
            
            if frame is None:
                raise VideoProcessingException("Could not extract frame for thumbnail")
            
            # Generate output path if not provided
            if output_path is None:
                temp_dir = tempfile.gettempdir()
                video_name = Path(video_path).stem
                output_path = os.path.join(temp_dir, f"{video_name}_thumbnail.jpg")
            
            def _save_thumbnail():
                # Resize to thumbnail size
                thumbnail = cv2.resize(frame, (320, 240))
                
                # Save as JPEG
                cv2.imwrite(output_path, thumbnail, [cv2.IMWRITE_JPEG_QUALITY, 85])
                
                return output_path
            
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(self.executor, _save_thumbnail)
            
        except Exception as e:
            logger.error(f"Thumbnail creation failed: {e}")
            raise VideoProcessingException(f"Thumbnail creation failed: {str(e)}")
    
    async def get_video_info(self, video_path: str) -> dict:
        """Get comprehensive video information"""
        try:
            validation_result = await self.validate_video_file(video_path)
            
            return {
                "file_info": {
                    "path": validation_result["path"],
                    "size_bytes": validation_result["size_bytes"],
                    "size_mb": validation_result["size_mb"],
                    "format": validation_result["format"],
                },
                "video_info": {
                    "fps": validation_result["fps"],
                    "frame_count": validation_result["frame_count"],
                    "width": validation_result["width"],
                    "height": validation_result["height"],
                    "duration_seconds": validation_result["duration_seconds"],
                    "duration_formatted": validation_result["duration_formatted"],
                    "aspect_ratio": round(validation_result["width"] / validation_result["height"], 2),
                    "resolution": f"{validation_result['width']}x{validation_result['height']}",
                },
                "processing_info": {
                    "supported": True,
                    "estimated_frames_per_second": validation_result["fps"],
                    "estimated_processing_time": self._estimate_processing_time(validation_result["duration_seconds"]),
                }
            }
            
        except Exception as e:
            logger.error(f"Get video info failed: {e}")
            raise VideoProcessingException(f"Could not get video info: {str(e)}")
    
    def _estimate_processing_time(self, duration_seconds: float) -> dict:
        """Estimate processing time based on video duration"""
        # Rough estimates - adjust based on actual performance
        base_time = duration_seconds * 0.1  # 10% of video duration as base
        frame_analysis_time = duration_seconds * 0.5  # Additional time for AI analysis
        
        total_estimated = base_time + frame_analysis_time
        
        return {
            "estimated_seconds": round(total_estimated, 1),
            "estimated_formatted": self._format_duration(total_estimated),
            "note": "Estimate may vary based on system performance and video complexity"
        }
    
    def get_supported_formats(self) -> List[str]:
        """Get list of supported video formats"""
        return self.supported_formats.copy()
    
    async def cleanup_temp_files(self, file_paths: List[str]) -> int:
        """Clean up temporary files"""
        cleaned_count = 0
        
        for file_path in file_paths:
            try:
                if os.path.exists(file_path):
                    os.remove(file_path)
                    cleaned_count += 1
            except Exception as e:
                logger.warning(f"Could not remove temp file {file_path}: {e}")
        
        return cleaned_count