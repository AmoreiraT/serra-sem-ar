import { useEffect, useCallback } from 'react';
import { useCovidStore } from '../stores/covidStore';

interface KeyboardControlsOptions {
  moveSpeed?: number;
  rotateSpeed?: number;
  enabled?: boolean;
}

export const useKeyboardControls = ({
  moveSpeed = 2,
  rotateSpeed = 0.05,
  enabled = true
}: KeyboardControlsOptions = {}) => {
  const { 
    cameraPosition, 
    cameraTarget, 
    setCameraPosition, 
    setCameraTarget,
    currentDateIndex,
    setCurrentDateIndex,
    data
  } = useCovidStore();
  
  const handleKeyPress = useCallback((event: KeyboardEvent) => {
    if (!enabled) return;
    
    const [x, y, z] = cameraPosition;
    const [tx, ty, tz] = cameraTarget;
    
    switch (event.key) {
      case 'ArrowUp':
      case 'w':
      case 'W':
        // Move forward
        event.preventDefault();
        setCameraPosition([x, y, z - moveSpeed]);
        setCameraTarget([tx, ty, tz - moveSpeed]);
        break;
        
      case 'ArrowDown':
      case 's':
      case 'S':
        // Move backward
        event.preventDefault();
        setCameraPosition([x, y, z + moveSpeed]);
        setCameraTarget([tx, ty, tz + moveSpeed]);
        break;
        
      case 'ArrowLeft':
      case 'a':
      case 'A':
        // Move left
        event.preventDefault();
        setCameraPosition([x - moveSpeed, y, z]);
        setCameraTarget([tx - moveSpeed, ty, tz]);
        break;
        
      case 'ArrowRight':
      case 'd':
      case 'D':
        // Move right
        event.preventDefault();
        setCameraPosition([x + moveSpeed, y, z]);
        setCameraTarget([tx + moveSpeed, ty, tz]);
        break;
        
      case ' ':
        // Move up
        event.preventDefault();
        setCameraPosition([x, y + moveSpeed, z]);
        setCameraTarget([tx, ty + moveSpeed, tz]);
        break;
        
      case 'Shift':
        // Move down
        event.preventDefault();
        setCameraPosition([x, y - moveSpeed, z]);
        setCameraTarget([tx, ty - moveSpeed, tz]);
        break;
        
      case 'q':
      case 'Q':
        // Rotate left
        event.preventDefault();
        const leftAngle = Math.atan2(tz - z, tx - x) + rotateSpeed;
        const leftDistance = Math.sqrt((tx - x) ** 2 + (tz - z) ** 2);
        setCameraTarget([
          x + Math.cos(leftAngle) * leftDistance,
          ty,
          z + Math.sin(leftAngle) * leftDistance
        ]);
        break;
        
      case 'e':
      case 'E':
        // Rotate right
        event.preventDefault();
        const rightAngle = Math.atan2(tz - z, tx - x) - rotateSpeed;
        const rightDistance = Math.sqrt((tx - x) ** 2 + (tz - z) ** 2);
        setCameraTarget([
          x + Math.cos(rightAngle) * rightDistance,
          ty,
          z + Math.sin(rightAngle) * rightDistance
        ]);
        break;
        
      case 'r':
      case 'R':
        // Reset camera position
        event.preventDefault();
        setCameraPosition([50, 30, 50]);
        setCameraTarget([0, 0, 0]);
        break;
        
      // Timeline navigation
      case ',':
      case '<':
        // Previous day
        event.preventDefault();
        if (currentDateIndex > 0) {
          setCurrentDateIndex(currentDateIndex - 1);
        }
        break;
        
      case '.':
      case '>':
        // Next day
        event.preventDefault();
        if (currentDateIndex < data.length - 1) {
          setCurrentDateIndex(currentDateIndex + 1);
        }
        break;
    }
  }, [
    enabled,
    cameraPosition,
    cameraTarget,
    setCameraPosition,
    setCameraTarget,
    moveSpeed,
    rotateSpeed,
    currentDateIndex,
    setCurrentDateIndex,
    data.length
  ]);
  
  const handleWheel = useCallback((event: WheelEvent) => {
    if (!enabled) return;
    
    event.preventDefault();
    const [x, y, z] = cameraPosition;
    const zoomSpeed = 0.1;
    const zoomDirection = event.deltaY > 0 ? 1 : -1;
    
    // Zoom in/out by moving camera closer/further from target
    const [tx, ty, tz] = cameraTarget;
    const direction = [tx - x, ty - y, tz - z];
    const length = Math.sqrt(direction[0] ** 2 + direction[1] ** 2 + direction[2] ** 2);
    
    if (length > 0) {
      const normalized = [direction[0] / length, direction[1] / length, direction[2] / length];
      const newPosition = [
        x + normalized[0] * zoomDirection * zoomSpeed * 5,
        y + normalized[1] * zoomDirection * zoomSpeed * 5,
        z + normalized[2] * zoomDirection * zoomSpeed * 5
      ];
      
      // Prevent getting too close or too far
      const newDistance = Math.sqrt(
        (newPosition[0] - tx) ** 2 + 
        (newPosition[1] - ty) ** 2 + 
        (newPosition[2] - tz) ** 2
      );
      
      if (newDistance > 5 && newDistance < 200) {
        setCameraPosition(newPosition as [number, number, number]);
      }
    }
  }, [enabled, cameraPosition, cameraTarget, setCameraPosition]);
  
  useEffect(() => {
    if (!enabled) return;
    
    window.addEventListener('keydown', handleKeyPress);
    window.addEventListener('wheel', handleWheel, { passive: false });
    
    return () => {
      window.removeEventListener('keydown', handleKeyPress);
      window.removeEventListener('wheel', handleWheel);
    };
  }, [handleKeyPress, handleWheel, enabled]);
  
  return {
    moveSpeed,
    rotateSpeed,
    enabled
  };
};

