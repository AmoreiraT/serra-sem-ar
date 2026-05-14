import { useEffect, useState } from 'react';

export type RenderMode = '2d' | '3d';
export type RenderDeviceClass = 'desktop' | 'desktop-light' | 'mobile-high' | 'mobile-low';

export type RenderProfile = {
  mode: RenderMode;
  isMobile: boolean;
  isSafari: boolean;
  isConstrained: boolean;
  deviceClass: RenderDeviceClass;
  reason: string;
};

export const WEBGL_FALLBACK_STORAGE_KEY = 'serra-sem-ar-webgl-fallback';
export const RENDER_PROFILE_CHANGE_EVENT = 'serra-sem-ar-render-profile-change';

let cachedWebGLSupport: boolean | null = null;

const getForcedRenderMode = (): RenderMode | 'auto' => {
  const value = import.meta.env.VITE_RENDER_MODE?.toLowerCase();
  if (value === '2d' || value === '3d') return value;
  return 'auto';
};

const detectSafari = (userAgent: string): boolean =>
  /safari/i.test(userAgent) && !/chrome|chromium|crios|fxios|edgios|opr\//i.test(userAgent);

const detectIOS = (userAgent: string): boolean => {
  if (/ipad|iphone|ipod/i.test(userAgent)) return true;
  if (typeof navigator === 'undefined') return false;
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
};

const getStoredFallbackMode = (): RenderMode | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(WEBGL_FALLBACK_STORAGE_KEY) === '2d' ? '2d' : null;
  } catch {
    return null;
  }
};

const detectWebGLSupport = (): boolean => {
  if (cachedWebGLSupport !== null) return cachedWebGLSupport;
  if (typeof document === 'undefined') {
    cachedWebGLSupport = false;
    return cachedWebGLSupport;
  }

  try {
    const canvas = document.createElement('canvas');
    const context = (canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl')) as WebGLRenderingContext | WebGL2RenderingContext | null;
    cachedWebGLSupport = Boolean(context);
    context?.getExtension('WEBGL_lose_context')?.loseContext();
    return cachedWebGLSupport;
  } catch {
    cachedWebGLSupport = false;
    return cachedWebGLSupport;
  }
};

export const detectRenderProfile = (): RenderProfile => {
  if (typeof window === 'undefined') {
    return {
      mode: '3d',
      isMobile: false,
      isSafari: false,
      isConstrained: false,
      deviceClass: 'desktop',
      reason: 'server',
    };
  }

  const forced = getForcedRenderMode();
  const userAgent = navigator.userAgent;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const pixelRatio = window.devicePixelRatio || 1;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  const cores = navigator.hardwareConcurrency ?? 4;
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isIOS = detectIOS(userAgent);
  const isSafari = detectSafari(userAgent) || isIOS;
  const isMobile = width < 768 || isIOS || (coarsePointer && width < 1180);
  const isConstrained =
    isMobile ||
    memory <= 4 ||
    cores <= 4 ||
    pixelRatio > 2.25 ||
    height < 700 ||
    reducedMotion;

  if (forced !== 'auto') {
    return {
      mode: forced,
      isMobile,
      isSafari,
      isConstrained,
      deviceClass: isMobile ? 'mobile-high' : isConstrained ? 'desktop-light' : 'desktop',
      reason: `forced-${forced}`,
    };
  }

  const storedFallback = getStoredFallbackMode();
  if (storedFallback) {
    return {
      mode: storedFallback,
      isMobile,
      isSafari,
      isConstrained: true,
      deviceClass: isMobile ? 'mobile-low' : 'desktop-light',
      reason: 'webgl-fallback',
    };
  }

  if (!detectWebGLSupport()) {
    return {
      mode: '2d',
      isMobile,
      isSafari,
      isConstrained: true,
      deviceClass: isMobile ? 'mobile-low' : 'desktop-light',
      reason: 'webgl-unavailable',
    };
  }

  const shortSide = Math.min(width, height);
  const longSide = Math.max(width, height);
  const hasRoomForMobile3D = shortSide >= 390 && longSide >= 700;
  const hasMobile3DSignals = cores >= 4 && memory >= 6 && pixelRatio <= 3.2;
  const canTryMobileHigh3D =
    isMobile &&
    isIOS &&
    isSafari &&
    hasRoomForMobile3D &&
    hasMobile3DSignals &&
    !reducedMotion;

  // Safari movel ainda fica em 2D por padrao; iPhones com sinais fortes entram em WebGL lean.
  if (isMobile) {
    if (canTryMobileHigh3D) {
      return {
        mode: '3d',
        isMobile,
        isSafari,
        isConstrained: true,
        deviceClass: 'mobile-high',
        reason: 'mobile-high-3d',
      };
    }

    return {
      mode: '2d',
      isMobile,
      isSafari,
      isConstrained: true,
      deviceClass: 'mobile-low',
      reason: isSafari ? 'safari-mobile' : 'mobile',
    };
  }

  return {
    mode: '3d',
    isMobile,
    isSafari,
    isConstrained,
    deviceClass: isConstrained ? 'desktop-light' : 'desktop',
    reason: isConstrained ? 'desktop-webgl-light' : 'full-webgl',
  };
};

export const useRenderProfile = (): RenderProfile => {
  const [profile, setProfile] = useState<RenderProfile>(() => detectRenderProfile());

  useEffect(() => {
    let frame = 0;
    const update = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        setProfile((current) => {
          const next = detectRenderProfile();
          if (
            current.mode === next.mode &&
            current.isMobile === next.isMobile &&
            current.isSafari === next.isSafari &&
            current.isConstrained === next.isConstrained &&
            current.deviceClass === next.deviceClass &&
            current.reason === next.reason
          ) {
            return current;
          }
          return next;
        });
      });
    };

    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    window.addEventListener(RENDER_PROFILE_CHANGE_EVENT, update);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      window.removeEventListener(RENDER_PROFILE_CHANGE_EVENT, update);
    };
  }, []);

  return profile;
};
