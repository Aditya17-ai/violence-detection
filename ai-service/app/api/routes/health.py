"""
Health check endpoints for the AI service
"""

import logging
import psutil
from datetime import datetime
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Dict, Any

from app.services.model_service import ModelService
from main import get_model_service

logger = logging.getLogger(__name__)
router = APIRouter()


class HealthResponse(BaseModel):
    """Health check response model"""
    status: str
    timestamp: datetime
    uptime_seconds: float
    version: str
    model_loaded: bool
    system_info: Dict[str, Any]


class PingResponse(BaseModel):
    """Ping response model"""
    message: str
    timestamp: datetime


@router.get("/", response_model=HealthResponse)
async def health_check(model_service: ModelService = Depends(get_model_service)):
    """Comprehensive health check"""
    
    try:
        # Get system information
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage('/')
        cpu_percent = psutil.cpu_percent(interval=1)
        
        system_info = {
            "cpu_usage_percent": cpu_percent,
            "memory_usage_percent": memory.percent,
            "memory_available_gb": round(memory.available / (1024**3), 2),
            "disk_usage_percent": disk.percent,
            "disk_free_gb": round(disk.free / (1024**3), 2),
        }
        
        # Check model status
        model_loaded = model_service.is_model_loaded() if model_service else False
        
        # Determine overall status
        status = "healthy"
        if cpu_percent > 90 or memory.percent > 90 or disk.percent > 90:
            status = "degraded"
        if not model_loaded:
            status = "unhealthy"
        
        return HealthResponse(
            status=status,
            timestamp=datetime.utcnow(),
            uptime_seconds=psutil.boot_time(),
            version="1.0.0",
            model_loaded=model_loaded,
            system_info=system_info
        )
        
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return HealthResponse(
            status="unhealthy",
            timestamp=datetime.utcnow(),
            uptime_seconds=0,
            version="1.0.0",
            model_loaded=False,
            system_info={}
        )


@router.get("/ping", response_model=PingResponse)
async def ping():
    """Simple ping endpoint"""
    return PingResponse(
        message="pong",
        timestamp=datetime.utcnow()
    )


@router.get("/model")
async def model_status(model_service: ModelService = Depends(get_model_service)):
    """Get model status information"""
    
    if not model_service:
        return {
            "loaded": False,
            "error": "Model service not initialized"
        }
    
    return {
        "loaded": model_service.is_model_loaded(),
        "model_info": model_service.get_model_info(),
        "supported_formats": model_service.get_supported_formats(),
        "confidence_threshold": model_service.confidence_threshold,
    }