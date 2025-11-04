"""
Model service for violence detection using pre-trained models
"""

import os
import logging
import numpy as np
import asyncio
from typing import List, Dict, Optional, Tuple, Any
from pathlib import Path
import pickle
import json
from concurrent.futures import ThreadPoolExecutor

# ML Framework imports (will be available when packages are installed)
try:
    import tensorflow as tf
    TENSORFLOW_AVAILABLE = True
except ImportError:
    TENSORFLOW_AVAILABLE = False
    tf = None

try:
    import torch
    import torchvision.transforms as transforms
    PYTORCH_AVAILABLE = True
except ImportError:
    PYTORCH_AVAILABLE = False
    torch = None
    transforms = None

from app.core.config import get_settings
from app.core.exceptions import ModelNotLoadedException, VideoProcessingException

logger = logging.getLogger(__name__)


class ModelService:
    """Service for loading and running violence detection models"""
    
    def __init__(self):
        self.settings = get_settings()
        self.model = None
        self.model_type = None
        self.model_info = {}
        self.is_loaded = False
        self.executor = ThreadPoolExecutor(max_workers=2)
        
        # Model configuration
        self.confidence_threshold = self.settings.CONFIDENCE_THRESHOLD
        self.batch_size = self.settings.BATCH_SIZE
        
        # Preprocessing parameters
        self.input_size = (224, 224)  # Standard input size for most models
        self.mean = [0.485, 0.456, 0.406]  # ImageNet means
        self.std = [0.229, 0.224, 0.225]   # ImageNet stds
        
    async def initialize(self) -> None:
        """Initialize the model service"""
        try:
            logger.info("Initializing Model Service...")
            
            # Check if ML frameworks are available
            if not TENSORFLOW_AVAILABLE and not PYTORCH_AVAILABLE:
                logger.warning("No ML frameworks available. Using mock model for development.")
                await self._load_mock_model()
                return
            
            # Try to load a real model
            model_loaded = await self._try_load_model()
            
            if not model_loaded:
                logger.warning("No pre-trained model found. Using mock model for development.")
                await self._load_mock_model()
            
            logger.info(f"Model Service initialized successfully. Model type: {self.model_type}")
            
        except Exception as e:
            logger.error(f"Failed to initialize Model Service: {e}")
            # Fall back to mock model
            await self._load_mock_model()
    
    async def _try_load_model(self) -> bool:
        """Try to load a pre-trained model"""
        model_path = Path(self.settings.MODEL_PATH)
        
        if not model_path.exists():
            logger.info(f"Model directory {model_path} does not exist")
            return False
        
        # Look for TensorFlow models
        if TENSORFLOW_AVAILABLE:
            tf_model_path = model_path / "violence_detection.h5"
            if tf_model_path.exists():
                return await self._load_tensorflow_model(str(tf_model_path))
            
            # Look for SavedModel format
            saved_model_path = model_path / "saved_model"
            if saved_model_path.exists():
                return await self._load_tensorflow_saved_model(str(saved_model_path))
        
        # Look for PyTorch models
        if PYTORCH_AVAILABLE:
            torch_model_path = model_path / "violence_detection.pth"
            if torch_model_path.exists():
                return await self._load_pytorch_model(str(torch_model_path))
        
        return False
    
    async def _load_tensorflow_model(self, model_path: str) -> bool:
        """Load TensorFlow/Keras model"""
        try:
            def _load():
                model = tf.keras.models.load_model(model_path)
                return model
            
            loop = asyncio.get_event_loop()
            self.model = await loop.run_in_executor(self.executor, _load)
            
            self.model_type = "tensorflow"
            self.is_loaded = True
            self.model_info = {
                "type": "tensorflow",
                "path": model_path,
                "input_shape": self.model.input_shape,
                "output_shape": self.model.output_shape,
            }
            
            logger.info(f"TensorFlow model loaded from {model_path}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to load TensorFlow model: {e}")
            return False
    
    async def _load_tensorflow_saved_model(self, model_path: str) -> bool:
        """Load TensorFlow SavedModel"""
        try:
            def _load():
                model = tf.saved_model.load(model_path)
                return model
            
            loop = asyncio.get_event_loop()
            self.model = await loop.run_in_executor(self.executor, _load)
            
            self.model_type = "tensorflow_saved"
            self.is_loaded = True
            self.model_info = {
                "type": "tensorflow_saved",
                "path": model_path,
            }
            
            logger.info(f"TensorFlow SavedModel loaded from {model_path}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to load TensorFlow SavedModel: {e}")
            return False
    
    async def _load_pytorch_model(self, model_path: str) -> bool:
        """Load PyTorch model"""
        try:
            def _load():
                # Load model state dict
                checkpoint = torch.load(model_path, map_location='cpu')
                
                # You would need to define your model architecture here
                # For now, we'll create a simple placeholder
                model = self._create_pytorch_model_architecture()
                model.load_state_dict(checkpoint)
                model.eval()
                
                return model
            
            loop = asyncio.get_event_loop()
            self.model = await loop.run_in_executor(self.executor, _load)
            
            self.model_type = "pytorch"
            self.is_loaded = True
            self.model_info = {
                "type": "pytorch",
                "path": model_path,
            }
            
            logger.info(f"PyTorch model loaded from {model_path}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to load PyTorch model: {e}")
            return False
    
    def _create_pytorch_model_architecture(self):
        """Create PyTorch model architecture (placeholder)"""
        # This is a placeholder - you would implement your actual model architecture
        import torch.nn as nn
        
        class ViolenceDetectionModel(nn.Module):
            def __init__(self):
                super().__init__()
                self.features = nn.Sequential(
                    nn.Conv2d(3, 64, 3, padding=1),
                    nn.ReLU(),
                    nn.AdaptiveAvgPool2d((1, 1)),
                    nn.Flatten(),
                    nn.Linear(64, 1),
                    nn.Sigmoid()
                )
            
            def forward(self, x):
                return self.features(x)
        
        return ViolenceDetectionModel()
    
    async def _load_mock_model(self) -> None:
        """Load a mock model for development/testing"""
        self.model = "mock_model"
        self.model_type = "mock"
        self.is_loaded = True
        self.model_info = {
            "type": "mock",
            "description": "Mock model for development and testing",
            "note": "This model generates random predictions for demonstration purposes"
        }
        
        logger.info("Mock model loaded for development")
    
    async def predict_violence(self, frame: np.ndarray) -> float:
        """
        Predict violence probability for a single frame
        
        Args:
            frame: Input frame as numpy array (H, W, C)
            
        Returns:
            Violence probability score (0.0 to 1.0)
        """
        if not self.is_loaded:
            raise ModelNotLoadedException()
        
        try:
            # Preprocess frame
            processed_frame = await self._preprocess_frame(frame)
            
            # Run inference based on model type
            if self.model_type == "tensorflow":
                return await self._predict_tensorflow(processed_frame)
            elif self.model_type == "tensorflow_saved":
                return await self._predict_tensorflow_saved(processed_frame)
            elif self.model_type == "pytorch":
                return await self._predict_pytorch(processed_frame)
            elif self.model_type == "mock":
                return await self._predict_mock(processed_frame)
            else:
                raise ModelNotLoadedException("Unknown model type")
                
        except Exception as e:
            logger.error(f"Prediction failed: {e}")
            raise VideoProcessingException(f"Violence prediction failed: {str(e)}")
    
    async def predict_batch(self, frames: List[np.ndarray]) -> List[float]:
        """
        Predict violence probability for a batch of frames
        
        Args:
            frames: List of input frames as numpy arrays
            
        Returns:
            List of violence probability scores
        """
        if not self.is_loaded:
            raise ModelNotLoadedException()
        
        try:
            # Process frames in batches
            predictions = []
            
            for i in range(0, len(frames), self.batch_size):
                batch = frames[i:i + self.batch_size]
                
                # Preprocess batch
                processed_batch = []
                for frame in batch:
                    processed_frame = await self._preprocess_frame(frame)
                    processed_batch.append(processed_frame)
                
                # Stack into batch tensor
                if self.model_type in ["tensorflow", "tensorflow_saved"]:
                    batch_tensor = np.stack(processed_batch)
                elif self.model_type == "pytorch":
                    batch_tensor = torch.stack([torch.from_numpy(f) for f in processed_batch])
                else:  # mock
                    batch_tensor = processed_batch
                
                # Run batch inference
                batch_predictions = await self._predict_batch_internal(batch_tensor)
                predictions.extend(batch_predictions)
            
            return predictions
            
        except Exception as e:
            logger.error(f"Batch prediction failed: {e}")
            raise VideoProcessingException(f"Batch violence prediction failed: {str(e)}")
    
    async def _preprocess_frame(self, frame: np.ndarray) -> np.ndarray:
        """Preprocess frame for model input"""
        def _preprocess():
            # Resize to model input size
            import cv2
            resized = cv2.resize(frame, self.input_size)
            
            # Convert BGR to RGB if needed
            if len(resized.shape) == 3 and resized.shape[2] == 3:
                rgb_frame = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)
            else:
                rgb_frame = resized
            
            # Normalize to [0, 1]
            normalized = rgb_frame.astype(np.float32) / 255.0
            
            # Apply ImageNet normalization
            for i in range(3):
                normalized[:, :, i] = (normalized[:, :, i] - self.mean[i]) / self.std[i]
            
            # Add batch dimension and transpose for model input
            if self.model_type in ["tensorflow", "tensorflow_saved"]:
                # TensorFlow expects (batch, height, width, channels)
                return normalized
            elif self.model_type == "pytorch":
                # PyTorch expects (batch, channels, height, width)
                return np.transpose(normalized, (2, 0, 1))
            else:
                return normalized
        
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(self.executor, _preprocess)
    
    async def _predict_tensorflow(self, frame: np.ndarray) -> float:
        """Run TensorFlow model prediction"""
        def _predict():
            # Add batch dimension
            batch_frame = np.expand_dims(frame, axis=0)
            
            # Run prediction
            prediction = self.model.predict(batch_frame, verbose=0)
            
            # Extract probability (assuming binary classification)
            if prediction.shape[-1] == 1:
                return float(prediction[0, 0])
            else:
                # Multi-class - return probability of violence class (assuming index 1)
                return float(prediction[0, 1]) if prediction.shape[-1] > 1 else float(prediction[0, 0])
        
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(self.executor, _predict)
    
    async def _predict_tensorflow_saved(self, frame: np.ndarray) -> float:
        """Run TensorFlow SavedModel prediction"""
        def _predict():
            # Add batch dimension
            batch_frame = np.expand_dims(frame, axis=0)
            
            # Convert to tensor
            input_tensor = tf.constant(batch_frame)
            
            # Run prediction (assuming the model has a default signature)
            prediction = self.model(input_tensor)
            
            # Extract probability
            if isinstance(prediction, dict):
                # If model returns dict, look for common output names
                for key in ['output', 'predictions', 'logits']:
                    if key in prediction:
                        pred_value = prediction[key].numpy()
                        break
                else:
                    pred_value = list(prediction.values())[0].numpy()
            else:
                pred_value = prediction.numpy()
            
            return float(pred_value[0, 0]) if pred_value.shape[-1] == 1 else float(pred_value[0, 1])
        
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(self.executor, _predict)
    
    async def _predict_pytorch(self, frame: np.ndarray) -> float:
        """Run PyTorch model prediction"""
        def _predict():
            # Add batch dimension
            batch_frame = torch.from_numpy(frame).unsqueeze(0)
            
            # Run prediction
            with torch.no_grad():
                prediction = self.model(batch_frame)
            
            # Extract probability
            return float(prediction[0, 0])
        
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(self.executor, _predict)
    
    async def _predict_mock(self, frame: np.ndarray) -> float:
        """Generate mock prediction for development"""
        # Generate deterministic but varied predictions based on frame content
        frame_hash = hash(frame.tobytes()) % 1000
        
        # Create realistic distribution of scores
        if frame_hash < 50:  # 5% high violence
            return 0.8 + (frame_hash % 20) / 100.0
        elif frame_hash < 150:  # 10% medium violence
            return 0.5 + (frame_hash % 30) / 100.0
        else:  # 85% low/no violence
            return (frame_hash % 40) / 100.0
    
    async def _predict_batch_internal(self, batch_tensor) -> List[float]:
        """Internal batch prediction method"""
        if self.model_type == "tensorflow":
            def _predict():
                predictions = self.model.predict(batch_tensor, verbose=0)
                return [float(pred[0]) if pred.shape[-1] == 1 else float(pred[1]) for pred in predictions]
            
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(self.executor, _predict)
            
        elif self.model_type == "pytorch":
            def _predict():
                with torch.no_grad():
                    predictions = self.model(batch_tensor)
                return [float(pred[0]) for pred in predictions]
            
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(self.executor, _predict)
            
        else:  # mock
            return [await self._predict_mock(frame) for frame in batch_tensor]
    
    def is_model_loaded(self) -> bool:
        """Check if model is loaded"""
        return self.is_loaded
    
    def get_model_info(self) -> Dict[str, Any]:
        """Get model information"""
        return self.model_info.copy()
    
    def get_supported_formats(self) -> List[str]:
        """Get supported video formats"""
        return ['.mp4', '.avi', '.mov', '.mkv', '.webm']
    
    def set_confidence_threshold(self, threshold: float) -> None:
        """Set confidence threshold for violence detection"""
        if 0.0 <= threshold <= 1.0:
            self.confidence_threshold = threshold
        else:
            raise ValueError("Confidence threshold must be between 0.0 and 1.0")
    
    def get_confidence_threshold(self) -> float:
        """Get current confidence threshold"""
        return self.confidence_threshold
    
    async def cleanup(self) -> None:
        """Cleanup model resources"""
        try:
            if self.model and self.model_type in ["tensorflow", "tensorflow_saved"]:
                # Clear TensorFlow session
                if hasattr(tf, 'keras') and hasattr(tf.keras, 'backend'):
                    tf.keras.backend.clear_session()
            
            self.model = None
            self.is_loaded = False
            
            # Shutdown executor
            self.executor.shutdown(wait=True)
            
            logger.info("Model service cleaned up successfully")
            
        except Exception as e:
            logger.error(f"Error during model cleanup: {e}")
    
    async def health_check(self) -> Dict[str, Any]:
        """Perform health check on model service"""
        try:
            if not self.is_loaded:
                return {
                    "status": "unhealthy",
                    "error": "Model not loaded"
                }
            
            # Test prediction with dummy data
            dummy_frame = np.random.randint(0, 255, (224, 224, 3), dtype=np.uint8)
            
            start_time = asyncio.get_event_loop().time()
            prediction = await self.predict_violence(dummy_frame)
            end_time = asyncio.get_event_loop().time()
            
            inference_time = (end_time - start_time) * 1000  # Convert to milliseconds
            
            return {
                "status": "healthy",
                "model_type": self.model_type,
                "model_loaded": self.is_loaded,
                "inference_time_ms": round(inference_time, 2),
                "confidence_threshold": self.confidence_threshold,
                "test_prediction": round(prediction, 4)
            }
            
        except Exception as e:
            logger.error(f"Model health check failed: {e}")
            return {
                "status": "unhealthy",
                "error": str(e)
            }