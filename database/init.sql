-- Initialize database for AI Violence Detection System

-- Create database if it doesn't exist
CREATE DATABASE IF NOT EXISTS violence_detection;

-- Use the database
\c violence_detection;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create users table (for future authentication)
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
    bounding_boxes JSONB, -- for object detection if needed
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_videos_user_id ON videos(user_id);
CREATE INDEX IF NOT EXISTS idx_videos_uploaded_at ON videos(uploaded_at);
CREATE INDEX IF NOT EXISTS idx_analyses_video_id ON analyses(video_id);
CREATE INDEX IF NOT EXISTS idx_analyses_status ON analyses(status);
CREATE INDEX IF NOT EXISTS idx_violence_detections_analysis_id ON violence_detections(analysis_id);
CREATE INDEX IF NOT EXISTS idx_violence_detections_timestamp ON violence_detections(timestamp_seconds);
CREATE INDEX IF NOT EXISTS idx_violence_detections_confidence ON violence_detections(confidence_score);

-- Insert sample user for development
INSERT INTO users (email, password_hash, first_name, last_name, role) 
VALUES ('admin@example.com', '$2b$10$example.hash.here', 'Admin', 'User', 'admin')
ON CONFLICT (email) DO NOTHING;