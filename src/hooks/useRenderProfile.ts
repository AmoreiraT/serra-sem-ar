import { useEffect, useState } from 'react';

export type RenderMode = '2d' | '3d';

export type RenderProfile = {
  mode: RenderMode;
  isMobile: boolean;
  isSafari: boolean;
  isConstrained: boolean;
  reason: string;
};

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

export const detectRenderProfile = (): RenderProfile => {
  if (typeof window === 'undefined') {
    return {
      mode: '3d',
      isMobile: false,
      isSafari: false,
      isConstrained: false,
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
      reason: `forced-${forced}`,
    };
  }

  // Safari movel costuma matar paginas WebGL quando a memoria cresce.
  // O modo 2D fica reservado a mobile/tablet; desktop usa WebGL com texturas baked mais leves.
  if (isMobile) {
    return { mode: '2d', isMobile, isSafari, isConstrained: true, reason: isSafari ? 'safari-mobile' : 'mobile' };
  }

  return { mode: '3d', isMobile, isSafari, isConstrained, reason: isConstrained ? 'desktop-webgl-light' : 'full-webgl' };
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
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  return profile;
};
