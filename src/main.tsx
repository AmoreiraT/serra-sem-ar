import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

if (typeof window !== 'undefined') {
  const hook = (window as typeof window & {
    __REACT_DEVTOOLS_GLOBAL_HOOK__?: {
      registerRenderer?: (...args: any[]) => any;
      __patchedVersionGuard?: boolean;
    };
  }).__REACT_DEVTOOLS_GLOBAL_HOOK__;

  if (hook && typeof hook.registerRenderer === 'function' && !hook.__patchedVersionGuard) {
    const originalRegister = hook.registerRenderer.bind(hook);
    hook.registerRenderer = (renderer: { version?: string }, ...rest: any[]) => {
      if (!renderer.version || renderer.version.trim() === '') {
        renderer = { ...renderer, version: React.version };
      }
      return originalRegister(renderer, ...rest);
    };
    hook.__patchedVersionGuard = true;
  }
}

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
} else {
  throw new Error("Root element not found");
}
