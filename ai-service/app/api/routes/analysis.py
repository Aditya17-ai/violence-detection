"""
Analysis endpoints for video violence detection
"""

import logging
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel, Field

from app.services.model_service import ModelService
from app.services.video_service import VideoService
from app.core.exceptions import (
    VideoProcessingException,
    AnalysisNotFoundException,
    InvalidVideoFormatException
)
from main import get_model_service

logger = logging.getLogger(__name__)
router = APIRouter()


class AnalysisRequest(BaseModel):
    """Request model for starting analysis"""
    video_url: Optional[str] = Field(None, description="URL to video file")
    confidence_threshold: Optional[float] = Field(0.7, ge=0.0, le=1.0)
    frame_interval: Optional[int] = Field(1, ge=1, description="Frame extraction interval in seconds")


class ViolenceDetection(BaseModel):
    """Violence detection result"""
    timestamp_seconds: float
    confidence_score: float
    frame_number: int
    bounding_boxes: Optional[List[dict]] = None


class AnalysisResult(BaseModel):
    """Analysis result model"""
    analysis_id: str
    status: str
    progress: int
    total_frames: Optional[int] = None
    violent_frames: int = 0
    detections: List[ViolenceDetection] = []
    started_at: datetime
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None


class AnalysisResponse(BaseModel):
    """Analysis response model"""
    success: bool
    analysis_id: str
    message: str


@router.post("/start", response_model=AnalysisResponse)
async def start_analysis(
    request: AnalysisRequest,
    video_file: Optional[UploadFile] = File(None),
    model_service: ModelService = Depends(get_model_service)
):
    """Start video analysis for violence detection"""
    
    if not video_file and not request.video_url:
        raise HTTPException(
            status_code=400,
            detail="Either video file or video URL must be provided"
        )
    
    try:
        # Initialize video service
        video_service = VideoService()
        
        # Start analysis
        if video_file:
            analysis_id = await video_service.analyze_uploaded_file(
                video_file,
                model_service,
                confidence_threshold=request.confidence_threshold,
                frame_interval=request.frame_interval
            )
        else:
            analysis_id = await video_service.analyze_video_url(
                request.video_url,
                model_service,
                confidence_threshold=request.confidence_threshold,
                frame_interval=request.frame_interval
            )
        
        return AnalysisResponse(
            success=True,
            analysis_id=analysis_id,
            message="Analysis started successfully"
        )
        
    except InvalidVideoFormatException as e:
        raise HTTPException(status_code=400, detail=str(e))
    except VideoProcessingException as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to start analysis: {e}")
        raise HTTPException(status_code=500, detail="Failed to start analysis")


@router.get("/{analysis_id}", response_model=AnalysisResult)
async def get_analysis_status(analysis_id: str):
    """Get analysis status and results"""
    
    try:
        video_service = VideoService()
        result = await video_service.get_analysis_result(analysis_id)
        
        if not result:
            raise AnalysisNotFoundException(analysis_id)
        
        return result
        
    except AnalysisNotFoundException:
        raise HTTPException(status_code=404, detail=f"Analysis {analysis_id} not found")
    except Exception as e:
        logger.error(f"Failed to get analysis status: {e}")
        raise HTTPException(status_code=500, detail="Failed to get analysis status")


@router.post("/{analysis_id}/stop")
async def stop_analysis(analysis_id: str):
    """Stop ongoing analysis"""
    
    try:
        video_service = VideoService()
        success = await video_service.stop_analysis(analysis_id)
        
        if not success:
            raise AnalysisNotFoundException(analysis_id)
        
        return {
            "success": True,
            "message": f"Analysis {analysis_id} stopped successfully"
        }
        
    except AnalysisNotFoundException:
        raise HTTPException(status_code=404, detail=f"Analysis {analysis_id} not found")
    except Exception as e:
        logger.error(f"Failed to stop analysis: {e}")
        raise HTTPException(status_code=500, detail="Failed to stop analysis")


@router.get("/")
async def list_analyses(
    status: Optional[str] = None,
    limit: int = 10,
    offset: int = 0
):
    """List analyses with optional filtering"""
    
    try:
        video_service = VideoService()
        analyses = await video_service.list_analyses(
            status=status,
            limit=limit,
            offset=offset
        )
        
        return {
            "success": True,
            "data": analyses,
            "pagination": {
                "limit": limit,
                "offset": offset,
                "total": len(analyses)
            }
        }
        
    except Exception as e:
        logger.error(f"Failed to list analyses: {e}")
        raise HTTPException(status_code=500, detail="Failed to list analyses")


@router.delete("/{analysis_id}")
async def delete_analysis(analysis_id: str):
    """Delete analysis and its results"""
    
    try:
        video_service = VideoService()
        success = await video_service.delete_analysis(analysis_id)
        
        if not success:
            raise AnalysisNotFoundException(analysis_id)
        
        return {
            "success": True,
            "message": f"Analysis {analysis_id} deleted successfully"
        }
        
    except AnalysisNotFoundException:
        raise HTTPException(status_code=404, detail=f"Analysis {analysis_id} not found")
    except Exception as e:
        logger.error(f"Failed to delete analysis: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete analysis")