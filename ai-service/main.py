"""
AI Violence Detection Service
FastAPI application for video analysis and violence detection
"""

import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
import uvicorn
from dotenv import load_dotenv

from app.core.config import get_settings
from app.core.logging import setup_logging
from app.api.routes import analysis, health
from app.services.model_service import ModelService
from app.core.exceptions import setup_exception_handlers

# Load environment variables
load_dotenv()

# Setup logging
setup_logging()
logger = logging.getLogger(__name__)

# Global model service instance
model_service = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events"""
    global model_service
    
    # Startup
    logger.info("🚀 Starting AI Violence Detection Service...")
    
    try:
        # Initialize model service
        model_service = ModelService()
        await model_service.initialize()
        
        # Store in app state for dependency injection
        app.state.model_service = model_service
        
        logger.info("✅ AI Service startup complete")
        yield
        
    except Exception as e:
        logger.error(f"❌ Failed to start AI service: {e}")
        raise
    
    # Shutdown
    logger.info("🛑 Shutting down AI Violence Detection Service...")
    
    if model_service:
        await model_service.cleanup()
    
    logger.info("✅ AI Service shutdown complete")

# Create FastAPI application
def create_app() -> FastAPI:
    settings = get_settings()
    
    app = FastAPI(
        title="AI Violence Detection Service",
        description="Machine learning service for detecting violent content in videos",
        version="1.0.0",
        docs_url="/docs" if settings.DEBUG else None,
        redoc_url="/redoc" if settings.DEBUG else None,
        lifespan=lifespan
    )
    
    # Add middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.ALLOWED_HOSTS,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["*"],
    )
    
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=settings.ALLOWED_HOSTS
    )
    
    # Setup exception handlers
    setup_exception_handlers(app)
    
    # Include routers
    app.include_router(health.router, prefix="/health", tags=["health"])
    app.include_router(analysis.router, prefix="/analysis", tags=["analysis"])
    
    return app

# Create app instance
app = create_app()

# Dependency to get model service
async def get_model_service() -> ModelService:
    """Dependency to get the model service instance"""
    if not hasattr(app.state, 'model_service') or app.state.model_service is None:
        raise HTTPException(
            status_code=503,
            detail="Model service not initialized"
        )
    return app.state.model_service

# Root endpoint
@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": "AI Violence Detection Service",
        "version": "1.0.0",
        "status": "running",
        "docs": "/docs",
        "health": "/health"
    }

if __name__ == "__main__":
    settings = get_settings()
    
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level=settings.LOG_LEVEL.lower(),
        access_log=True,
    )