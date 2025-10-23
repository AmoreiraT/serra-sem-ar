import { useEffect, useCallback } from 'react';
import { useCovidStore } from '../stores/covidStore';

export const useTemporalNavigation = () => {
  const data = useCovidStore((state) => state.data);
  const currentDateIndex = useCovidStore((state) => state.currentDateIndex);
  const setCurrentDateIndex = useCovidStore((state) => state.setCurrentDateIndex);

  const onKeyDown = useCallback((e: KeyboardEvent) => {
    if (!data.length) return;
    // Previous: comma or '['
    if (e.key === ',' || e.key === '<' || e.key === '[') {
      e.preventDefault();
      setCurrentDateIndex(Math.max(0, currentDateIndex - 1));
    }
    // Next: period or ']'
    if (e.key === '.' || e.key === '>' || e.key === ']') {
      e.preventDefault();
      setCurrentDateIndex(Math.min(data.length - 1, currentDateIndex + 1));
    }
  }, [currentDateIndex, data.length, setCurrentDateIndex]);

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onKeyDown]);
};

export default useTemporalNavigation;
