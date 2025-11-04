"""
Custom exceptions and exception handlers for the AI service
"""

import logging
from typing import Any, Dict
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)


class AIServiceException(Exception):
    """Base exception for AI service"""
    
    def __init__(self, message: str, status_code: int = 500, details: Dict[str, Any] = None):
        self.message = message
        self.status_code = status_code
        self.details = details or {}
        super().__init__(self.message)


class ModelNotLoadedException(AIServiceException):
    """Exception raised when model is not loaded"""
    
    def __init__(self, message: str = "AI model not loaded"):
        super().__init__(message, status_code=503)


class VideoProcessingException(AIServiceException):
    """Exception raised during video processing"""
    
    def __init__(self, message: str, details: Dict[str, Any] = None):
        super().__init__(message, status_code=422, details=details)


class AnalysisNotFoundException(AIServiceException):
    """Exception raised when analysis is not found"""
    
    def __init__(self, analysis_id: str):
        message = f"Analysis with ID {analysis_id} not found"
        super().__init__(message, status_code=404)


class InvalidVideoFormatException(AIServiceException):
    """Exception raised for invalid video format"""
    
    def __init__(self, format_name: str):
        message = f"Invalid video format: {format_name}"
        super().__init__(message, status_code=400)


class VideoTooLargeException(AIServiceException):
    """Exception raised when video file is too large"""
    
    def __init__(self, size_mb: float, max_size_mb: int):
        message = f"Video file too large: {size_mb}MB (max: {max_size_mb}MB)"
        super().__init__(message, status_code=413)


async def ai_service_exception_handler(request: Request, exc: AIServiceException) -> JSONResponse:
    """Handle custom AI service exceptions"""
    logger.error(f"AI Service Exception: {exc.message}", extra={"details": exc.details})
    
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "type": exc.__class__.__name__,
                "message": exc.message,
                "details": exc.details,
                "timestamp": request.state.timestamp if hasattr(request.state, 'timestamp') else None
            }
        }
    )


async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    """Handle HTTP exceptions"""
    logger.warning(f"HTTP Exception: {exc.status_code} - {exc.detail}")
    
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "type": "HTTPException",
                "message": exc.detail,
                "status_code": exc.status_code,
                "timestamp": request.state.timestamp if hasattr(request.state, 'timestamp') else None
            }
        }
    )


async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Handle request validation exceptions"""
    logger.warning(f"Validation Exception: {exc.errors()}")
    
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "type": "ValidationError",
                "message": "Request validation failed",
                "details": exc.errors(),
                "timestamp": request.state.timestamp if hasattr(request.state, 'timestamp') else None
            }
        }
    )


async def general_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Handle general exceptions"""
    logger.error(f"Unhandled Exception: {str(exc)}", exc_info=True)
    
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "type": "InternalServerError",
                "message": "An internal server error occurred",
                "timestamp": request.state.timestamp if hasattr(request.state, 'timestamp') else None
            }
        }
    )


def setup_exception_handlers(app: FastAPI) -> None:
    """Setup exception handlers for the FastAPI app"""
    
    app.add_exception_handler(AIServiceException, ai_service_exception_handler)
    app.add_exception_handler(HTTPException, http_exception_handler)
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(Exception, general_exception_handler)