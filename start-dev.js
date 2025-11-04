const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting AI Violence Detection System in Development Mode...\n');

// Start frontend development server
console.log('📱 Starting Frontend (React + Vite)...');
const frontend = spawn('npm', ['run', 'dev'], {
  cwd: path.join(__dirname, 'frontend'),
  stdio: 'inherit',
  shell: true
});

// Start backend development server
console.log('🔧 Starting Backend (Node.js + Express)...');
const backend = spawn('npm', ['run', 'dev'], {
  cwd: path.join(__dirname, 'backend'),
  stdio: 'inherit',
  shell: true
});

// Start AI service development server
console.log('🤖 Starting AI Service (Python + FastAPI)...');
const aiService = spawn('python', ['-m', 'uvicorn', 'main:app', '--reload', '--port', '8001'], {
  cwd: path.join(__dirname, 'ai-service'),
  stdio: 'inherit',
  shell: true
});

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down development servers...');
  
  frontend.kill('SIGINT');
  backend.kill('SIGINT');
  aiService.kill('SIGINT');
  
  process.exit(0);
});

// Handle individual process exits
frontend.on('exit', (code) => {
  console.log(`Frontend process exited with code ${code}`);
});

backend.on('exit', (code) => {
  console.log(`Backend process exited with code ${code}`);
});

aiService.on('exit', (code) => {
  console.log(`AI Service process exited with code ${code}`);
});

console.log('\n✅ All development servers started!');
console.log('📱 Frontend: http://localhost:5173');
console.log('🔧 Backend: http://localhost:3000');
console.log('🤖 AI Service: http://localhost:8001');
console.log('\nPress Ctrl+C to stop all servers.\n');