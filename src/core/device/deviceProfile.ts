import { getPrefersReducedMotion } from '../performance/reducedMotion';

export type RenderMode = 'desktop-3d' | 'mobile-25d' | 'safe-static';

export interface DeviceProfile {
  readonly isTouch: boolean;
  readonly isTablet: boolean;
  readonly isSmallScreen: boolean;
  readonly isIOS: boolean;
  readonly isInstagramBrowser: boolean;
  readonly prefersReducedMotion: boolean;
  readonly devicePixelRatio: number;
  readonly renderMode: RenderMode;
}

const getNavigatorUserAgent = (): string => {
  if (typeof navigator === 'undefined') {
    return '';
  }

  return navigator.userAgent;
};

const getDevicePixelRatio = (): number => {
  if (typeof window === 'undefined') {
    return 1;
  }

  return Math.min(window.devicePixelRatio || 1, 2);
};

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
  if (typeof navigator === 'undefined') {
    return 0;
  }

  return navigator.maxTouchPoints || 0;
};

const getIsIOS = (userAgent: string): boolean => {
  if (/iPad|iPhone|iPod/.test(userAgent)) {
    return true;
  }

  if (typeof navigator === 'undefined') {
    return false;
  }

  return navigator.platform === 'MacIntel' && getMaxTouchPoints() > 1;
};

const getIsIPad = (userAgent: string): boolean => {
  if (/iPad/.test(userAgent)) {
    return true;
  }

  if (typeof navigator === 'undefined') {
    return false;
  }

  return navigator.platform === 'MacIntel' && getMaxTouchPoints() > 1;
};

const getIsIPhone = (userAgent: string): boolean => /iPhone|iPod/.test(userAgent);

const getIsAndroidPhone = (userAgent: string): boolean => /Android/i.test(userAgent) && /Mobile/i.test(userAgent);

const getIsAndroidTablet = (userAgent: string): boolean => /Android/i.test(userAgent) && !/Mobile/i.test(userAgent);

const getHasTabletUserAgent = (userAgent: string): boolean =>
  getIsIPad(userAgent) || getIsAndroidTablet(userAgent) || /Tablet|Silk|Kindle|KF[A-Z0-9]+|SM-T|Tab/i.test(userAgent);

const getIsTabletViewport = (isTouch: boolean, width: number, height: number): boolean => {
  const shortSide = Math.min(width, height);
  const longSide = Math.max(width, height);
  return isTouch && shortSide >= 560 && longSide >= 800;
};

export const getDeviceProfile = (): DeviceProfile => {
  const userAgent = getNavigatorUserAgent();
  const isIOS = getIsIOS(userAgent);
  const isInstagramBrowser = /Instagram/.test(userAgent);
  const { width, height } = getViewportSize();
  const shortSide = Math.min(width, height);
  const longSide = Math.max(width, height);

  const isTouch =
    typeof window !== 'undefined' &&
    ('ontouchstart' in window || getMaxTouchPoints() > 0);

  const isTablet =
    isTouch &&
    !isInstagramBrowser &&
    (getHasTabletUserAgent(userAgent) || getIsTabletViewport(isTouch, width, height));

  const isSmallScreen =
    typeof window !== 'undefined' &&
    window.matchMedia('(max-width: 768px), (pointer: coarse) and (max-width: 720px)').matches;

  const prefersReducedMotion = getPrefersReducedMotion();
  const isPhoneUserAgent = getIsIPhone(userAgent) || getIsAndroidPhone(userAgent);
  const isPhoneLike = !isTablet && (isPhoneUserAgent || shortSide < 560 || (isTouch && longSide < 800));
  const shouldUseMobile25D = !isTablet && (isPhoneLike || isSmallScreen || isIOS || isInstagramBrowser);
  const renderMode = isTablet
    ? 'desktop-3d'
    : prefersReducedMotion
      ? 'safe-static'
      : shouldUseMobile25D
        ? 'mobile-25d'
        : 'desktop-3d';

  return {
    isTouch,
    isTablet,
    isSmallScreen,
    isIOS,
    isInstagramBrowser,
    prefersReducedMotion,
    devicePixelRatio: getDevicePixelRatio(),
    renderMode,
  };
};
