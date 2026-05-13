import * as React from 'react';

const MOBILE_BREAKPOINT = 768;
const MOBILE_LANDSCAPE_MAX_WIDTH = 1100;
const MOBILE_LANDSCAPE_MAX_HEIGHT = 540;

const getIsMobileViewport = () => {
  if (typeof window === 'undefined') return false;

  const width = window.innerWidth;
  const height = window.innerHeight;
  const shortSide = Math.min(width, height);
  const longSide = Math.max(width, height);
  const hasMobilePointer = window.matchMedia('(pointer: coarse)').matches;
  const userAgent = navigator.userAgent;
  const maxTouchPoints = navigator.maxTouchPoints || 0;
  const isIPad =
    /iPad/.test(userAgent) ||
    (navigator.platform === 'MacIntel' && maxTouchPoints > 1);
  const isAndroidTablet = /Android/i.test(userAgent) && !/Mobile/i.test(userAgent);
  const hasTabletUserAgent =
    isIPad ||
    isAndroidTablet ||
    /Tablet|Silk|Kindle|KF[A-Z0-9]+|SM-T|Tab/i.test(userAgent);
  const isNarrow = width < MOBILE_BREAKPOINT;
  const isPhoneLandscape =
    width <= MOBILE_LANDSCAPE_MAX_WIDTH &&
    height <= MOBILE_LANDSCAPE_MAX_HEIGHT;
  const isTouchTablet =
    hasMobilePointer &&
    (hasTabletUserAgent || (shortSide >= 560 && longSide >= 800));
  const isCompactTouch = hasMobilePointer && width < 1180;

  return isNarrow || isPhoneLandscape || isCompactTouch || isTouchTablet;
};

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(
      `(max-width: ${MOBILE_BREAKPOINT - 1}px), (pointer: coarse)`,
    );
    let frame = 0;

    const syncViewportFlag = () => {
      const next = getIsMobileViewport();
      setIsMobile((current) => (current === next ? current : next));
    };

    const onChange = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(syncViewportFlag);
    };

    mql.addEventListener('change', onChange);
    window.addEventListener('resize', onChange);
    window.addEventListener('orientationchange', onChange);
    syncViewportFlag();

    return () => {
      window.cancelAnimationFrame(frame);
      mql.removeEventListener('change', onChange);
      window.removeEventListener('resize', onChange);
      window.removeEventListener('orientationchange', onChange);
    };
  }, []);

  return !!isMobile;
}
