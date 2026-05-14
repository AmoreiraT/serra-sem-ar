import { useEffect } from 'react';
import { fetchPerformanceProfile } from '../services/presenceApi';
import { usePerformanceProfileStore } from '../stores/performanceProfileStore';
import type { PerformanceDeviceClass, PerformanceProfile } from '../types/performanceProfile';

type UsePerformanceProfileInput = {
  deviceClass: PerformanceDeviceClass;
  enabled?: boolean;
};

export const usePerformanceProfile = ({
  deviceClass,
  enabled = true,
}: UsePerformanceProfileInput): PerformanceProfile => {
  const profile = usePerformanceProfileStore((state) => state.profile);
  const setDeviceClass = usePerformanceProfileStore((state) => state.setDeviceClass);
  const setProfile = usePerformanceProfileStore((state) => state.setProfile);
  const markProfileError = usePerformanceProfileStore((state) => state.markProfileError);

  useEffect(() => {
    setDeviceClass(deviceClass);
  }, [deviceClass, setDeviceClass]);

  useEffect(() => {
    if (!enabled) return undefined;

    let cancelled = false;
    void fetchPerformanceProfile(deviceClass)
      .then((remoteProfile) => {
        if (!cancelled) setProfile(remoteProfile);
      })
      .catch(() => {
        if (!cancelled) markProfileError(deviceClass);
      });

    return () => {
      cancelled = true;
    };
  }, [deviceClass, enabled, markProfileError, setProfile]);

  return profile;
};
