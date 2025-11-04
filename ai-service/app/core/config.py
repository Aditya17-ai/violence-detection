"""
Configuration settings for the AI service
"""

import os
from functools import lru_cache
from typing import List
from pydantic import BaseSettings, validator


class Settings(BaseSettings):
    """Application settings"""
    
    # Basic settings
    APP_NAME: str = "AI Violence Detection Service"
    VERSION: str = "1.0.0"
    DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"
    
    # Server settings
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8001"))
    
    # Logging
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    
    # Security
    ALLOWED_HOSTS: List[str] = ["*"]  # Configure properly in production
    
    # Redis settings
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379")
    
    # Model settings
    MODEL_PATH: str = os.getenv("MODEL_PATH", "./models")
    MODEL_NAME: str = os.getenv("MODEL_NAME", "violence_detection_model")
    CONFIDENCE_THRESHOLD: float = float(os.getenv("CONFIDENCE_THRESHOLD", "0.7"))
    FRAME_EXTRACTION_INTERVAL: int = int(os.getenv("FRAME_EXTRACTION_INTERVAL", "1"))
    
    # Processing settings
    MAX_VIDEO_SIZE_MB: int = int(os.getenv("MAX_VIDEO_SIZE_MB", "500"))
    MAX_CONCURRENT_ANALYSES: int = int(os.getenv("MAX_CONCURRENT_ANALYSES", "5"))
    BATCH_SIZE: int = int(os.getenv("BATCH_SIZE", "32"))
    
    # File paths
    TEMP_DIR: str = os.getenv("TEMP_DIR", "./temp")
    UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", "./uploads")
    
    @validator("ALLOWED_HOSTS", pre=True)
    def parse_allowed_hosts(cls, v):
        if isinstance(v, str):
            return [host.strip() for host in v.split(",")]
        return v
    
    @validator("CONFIDENCE_THRESHOLD")
    def validate_confidence_threshold(cls, v):
        if not 0 <= v <= 1:
            raise ValueError("Confidence threshold must be between 0 and 1")
        return v
    
    @validator("FRAME_EXTRACTION_INTERVAL")
    def validate_frame_interval(cls, v):
        if v < 1:
            raise ValueError("Frame extraction interval must be at least 1 second")
        return v
    
    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance"""
    return Settings()