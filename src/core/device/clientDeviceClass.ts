export type ClientDeviceClass = 'desktop' | 'tablet' | 'phone';

const getViewportSize = () => {
  if (typeof window === 'undefined') {
    return { width: 1024, height: 768 };
  }

  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
};

const getMaxTouchPoints = (): number => {
  if (typeof navigator === 'undefined') return 0;
  return navigator.maxTouchPoints || 0;
};

const getHasCoarsePointer = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(pointer: coarse)').matches;
};

const getUserAgent = (): string => {
  if (typeof navigator === 'undefined') return '';
  return navigator.userAgent;
};

export const getIsTabletViewport = (): boolean => {
  if (typeof window === 'undefined') return false;

  const { width, height } = getViewportSize();
  const shortSide = Math.min(width, height);
  const longSide = Math.max(width, height);
  const userAgent = getUserAgent();
  const maxTouchPoints = getMaxTouchPoints();
  const hasCoarsePointer = getHasCoarsePointer();
  const isIPad = /iPad/.test(userAgent) || (navigator.platform === 'MacIntel' && maxTouchPoints > 1);
  const isAndroidTablet = /Android/i.test(userAgent) && !/Mobile/i.test(userAgent);
  const hasTabletUserAgent = isIPad || isAndroidTablet || /Tablet|Silk|Kindle|KF[A-Z0-9]+|SM-T|Tab/i.test(userAgent);

  return hasCoarsePointer && (hasTabletUserAgent || (shortSide >= 560 && longSide >= 800));
};

export const detectClientDeviceClass = (): ClientDeviceClass => {
  if (typeof window === 'undefined') return 'desktop';

  const { width, height } = getViewportSize();
  const hasCoarsePointer = getHasCoarsePointer();

  if (getIsTabletViewport()) return 'tablet';
  if (width < 768 || (width <= 1100 && height <= 540) || hasCoarsePointer) return 'phone';
  return 'desktop';
};
