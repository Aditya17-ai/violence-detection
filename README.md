# AI Violence Detection System

A comprehensive web-based application that uses artificial intelligence to detect violent content in videos and provide real-time warnings to users.

## Features

- **AI-Powered Detection**: Advanced machine learning models for accurate violence detection
- **Real-time Analysis**: Live progress updates and instant alerts during video processing
- **Responsive Web Interface**: Modern, mobile-friendly UI built with React and Tailwind CSS
- **Scalable Architecture**: Microservices design with Docker containerization
- **Comprehensive Reporting**: Detailed analysis results with timestamps and confidence scores

## Tech Stack

### Frontend
- React 18 with TypeScript
- Tailwind CSS for styling
- React Query for state management
- Socket.io for real-time updates
- Vite for build tooling

### Backend
- Node.js with Express.js
- TypeScript for type safety
- PostgreSQL database with Sequelize ORM
- Redis for caching and job queues
- Bull Queue for video processing
- Socket.io for WebSocket connections

### AI Service
- Python with FastAPI
- OpenCV for video processing
- TensorFlow/PyTorch for ML models
- Celery for distributed processing

### Infrastructure
- Docker & Docker Compose
- NGINX reverse proxy
- AWS S3 for video storage

## Quick Start

### Prerequisites
- Node.js 18+
- Python 3.11+
- Docker & Docker Compose
- PostgreSQL 15+
- Redis 7+

### Development Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd ai-violence-detection
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start development services**
   ```bash
   # Start databases
   docker-compose -f docker-compose.dev.yml up -d
   
   # Start all services
   npm run dev
   ```

5. **Access the application**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:3000
   - AI Service: http://localhost:8001

### Production Deployment

1. **Build and start with Docker**
   ```bash
   docker-compose up -d
   ```

2. **Access via NGINX**
   - Application: http://localhost:8080

## Project Structure

```
ai-violence-detection/
├── frontend/                 # React frontend application
│   ├── src/
│   ├── public/
│   └── package.json
├── backend/                  # Node.js backend API
│   ├── src/
│   └── package.json
├── ai-service/              # Python AI processing service
│   ├── main.py
│   └── requirements.txt
├── nginx/                   # NGINX configuration
├── docker-compose.yml       # Production Docker setup
├── docker-compose.dev.yml   # Development Docker setup
└── package.json            # Root package.json
```

## API Documentation

### Video Upload
- `POST /api/videos/upload` - Upload video file
- `GET /api/videos/:id` - Get video metadata
- `DELETE /api/videos/:id` - Delete video

### Analysis
- `POST /api/analysis/start/:videoId` - Start violence detection
- `GET /api/analysis/:analysisId` - Get analysis status
- `POST /api/analysis/:analysisId/stop` - Stop analysis

### WebSocket Events
- `progress_update` - Analysis progress updates
- `violence_detected` - Violence detection alerts
- `analysis_complete` - Analysis completion

## Development

### Running Tests
```bash
# All tests
npm test

# Frontend tests
npm run test:frontend

# Backend tests
npm run test:backend

# AI service tests
npm run test:ai
```

### Code Quality
```bash
# Lint all code
npm run lint

# Format code
npm run format
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support and questions, please open an issue in the GitHub repository.