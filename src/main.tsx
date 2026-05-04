import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

const patchReactDevToolsRendererVersion = () => {
  if (typeof window === 'undefined') return;

  type DevToolsHook = {
    inject?: (renderer: unknown) => unknown;
  };

  const hook = (window as Window & { __REACT_DEVTOOLS_GLOBAL_HOOK__?: DevToolsHook }).__REACT_DEVTOOLS_GLOBAL_HOOK__;
  if (!hook?.inject || typeof hook.inject !== 'function') return;

  const originalInject = hook.inject.bind(hook);
  hook.inject = (renderer: unknown) => {
    if (renderer && typeof renderer === 'object') {
      const candidate = renderer as { version?: unknown; rendererPackageName?: unknown };
      if (
        candidate.rendererPackageName === '@react-three/fiber' &&
        (typeof candidate.version !== 'string' || candidate.version.trim().length === 0)
      ) {
        candidate.version = '0.0.0';
      }
    }

    return originalInject(renderer);
  };
};

patchReactDevToolsRendererVersion();

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <App />
  );
} else {
  throw new Error("Root element not found");
}
