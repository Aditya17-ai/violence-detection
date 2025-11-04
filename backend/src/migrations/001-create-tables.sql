-- Migration: Create initial tables for AI Violence Detection System
-- Version: 001
-- Created: 2024-01-01

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    role VARCHAR(50) DEFAULT 'user',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create videos table
CREATE TABLE IF NOT EXISTS videos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    filename VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    file_size BIGINT NOT NULL,
    duration INTEGER, -- in seconds
    format VARCHAR(10) NOT NULL,
    storage_path TEXT NOT NULL,
    uploaded_at TIMESTAMP DEFAULT NOW(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Create analyses table
CREATE TABLE IF NOT EXISTS analyses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    video_id UUID REFERENCES videos(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    progress INTEGER DEFAULT 0,
    started_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    total_frames INTEGER,
    violent_frames INTEGER DEFAULT 0,
    confidence_threshold DECIMAL(3,2) DEFAULT 0.70,
    error_message TEXT
);

-- Create violence_detections table
CREATE TABLE IF NOT EXISTS violence_detections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    analysis_id UUID REFERENCES analyses(id) ON DELETE CASCADE,
    timestamp_seconds DECIMAL(10,3) NOT NULL,
    confidence_score DECIMAL(5,4) NOT NULL,
    frame_number INTEGER NOT NULL,
    bounding_boxes JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_videos_user_id ON videos(user_id);
CREATE INDEX IF NOT EXISTS idx_videos_uploaded_at ON videos(uploaded_at);
CREATE INDEX IF NOT EXISTS idx_videos_format ON videos(format);
CREATE INDEX IF NOT EXISTS idx_analyses_video_id ON analyses(video_id);
CREATE INDEX IF NOT EXISTS idx_analyses_status ON analyses(status);
CREATE INDEX IF NOT EXISTS idx_analyses_started_at ON analyses(started_at);
CREATE INDEX IF NOT EXISTS idx_violence_detections_analysis_id ON violence_detections(analysis_id);
CREATE INDEX IF NOT EXISTS idx_violence_detections_timestamp ON violence_detections(timestamp_seconds);
CREATE INDEX IF NOT EXISTS idx_violence_detections_confidence ON violence_detections(confidence_score);
CREATE INDEX IF NOT EXISTS idx_violence_detections_frame_number ON violence_detections(frame_number);

-- Add constraints
ALTER TABLE analyses ADD CONSTRAINT chk_progress_range CHECK (progress >= 0 AND progress <= 100);
ALTER TABLE analyses ADD CONSTRAINT chk_confidence_range CHECK (confidence_threshold >= 0 AND confidence_threshold <= 1);
ALTER TABLE violence_detections ADD CONSTRAINT chk_confidence_score_range CHECK (confidence_score >= 0 AND confidence_score <= 1);
ALTER TABLE violence_detections ADD CONSTRAINT chk_timestamp_positive CHECK (timestamp_seconds >= 0);
ALTER TABLE violence_detections ADD CONSTRAINT chk_frame_number_positive CHECK (frame_number >= 0);

-- Insert default admin user (password: admin123)
INSERT INTO users (email, password_hash, first_name, last_name, role) 
VALUES (
    'admin@example.com', 
    '$2b$10$rOzJqQZQZQZQZQZQZQZQZOzJqQZQZQZQZQZQZQZQZOzJqQZQZQZQZQ', 
    'Admin', 
    'User', 
    'admin'
) ON CONFLICT (email) DO NOTHING;