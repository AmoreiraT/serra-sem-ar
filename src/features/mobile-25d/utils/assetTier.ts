export type Mobile25DAssetTier = 'mobile-low' | 'standard';

const getNavigatorAny = (): any => {
    if (typeof navigator === 'undefined') {
        return {};
    }

    return navigator as any;
};

export const getMobile25DAssetTier = (): Mobile25DAssetTier => {
    if (typeof window === 'undefined') {
        return 'mobile-low';
    }

    const nav = getNavigatorAny();
    const deviceMemory = typeof nav.deviceMemory === 'number' ? nav.deviceMemory : 0;
    const hardwareConcurrency = typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : 0;
    const saveData = Boolean(nav.connection?.saveData);
    const dpr = window.devicePixelRatio || 1;

    if (saveData) return 'mobile-low';
    if (deviceMemory > 0 && deviceMemory <= 4) return 'mobile-low';
    if (hardwareConcurrency > 0 && hardwareConcurrency <= 4) return 'mobile-low';
    if (dpr >= 3 && (deviceMemory === 0 || deviceMemory <= 6)) return 'mobile-low';

    return 'standard';
};
