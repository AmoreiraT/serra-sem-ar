import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { useEffect } from 'react';
import { useCovidStore } from '../stores/covidStore';
import { MountainPoint, ProcessedCovidData } from '../types/covid';

const DISEASE_SH_API =
  'https://disease.sh/v3/covid-19/historical/brazil?lastdays=all';

const START_DATE_UTC = Date.UTC(2020, 9, 21); // 21/10/2020

const parseTimelineDate = (key: string): Date | null => {
  const parts = key.split('/');
  if (parts.length !== 3) return null;
  const [monthStr, dayStr, yearStr] = parts;
  const month = parseInt(monthStr, 10) - 1;
  const day = parseInt(dayStr, 10);
  const year = parseInt(yearStr, 10);
  if (Number.isNaN(month) || Number.isNaN(day) || Number.isNaN(year)) return null;
  const fullYear = year < 100 ? 2000 + year : year;
  const date = new Date(Date.UTC(fullYear, month, day, 10)); // noon UTC avoids TZ shift
  return Number.isNaN(date.getTime()) ? null : date;
};

const fetchApiData = async (): Promise<ProcessedCovidData[]> => {
  try {
    const response = await axios.get(DISEASE_SH_API, {
      headers: { Accept: 'application/json' },
    });

    const timeline = response.data?.timeline;
    if (!timeline || !timeline.cases || !timeline.deaths) {
      throw new Error('Formato de dados inesperado da API');
    }

    const entries = Object.keys(timeline.cases).map((key) => {
      const date = parseTimelineDate(key);
      const casesTotal = Number(timeline.cases[key]) || 0;
      const deathsTotal = Number(timeline.deaths[key]) || 0;
      return { key, date, casesTotal, deathsTotal };
    });

    const validEntries = entries
      .filter((entry) => entry.date !== null)
      .sort(
        (a, b) =>
          (a.date as Date).getTime() - (b.date as Date).getTime()
      );

    const processed: ProcessedCovidData[] = [];
    let previousCases = 0;
    let previousDeaths = 0;

    validEntries.forEach((entry, index) => {
      const date = entry.date as Date;
      const dailyCases =
        index === 0
          ? entry.casesTotal
          : Math.max(0, entry.casesTotal - previousCases);
      const dailyDeaths =
        index === 0
          ? entry.deathsTotal
          : Math.max(0, entry.deathsTotal - previousDeaths);

      processed.push({
        date,
        cases: dailyCases,
        deaths: dailyDeaths,
        dayIndex: index,
      });

      previousCases = entry.casesTotal;
      previousDeaths = entry.deathsTotal;
    });

    const filtered = processed
      .filter((entry) => entry.date.getTime() >= START_DATE_UTC)
      .map((entry, index) => ({
        date: entry.date,
        cases: entry.cases,
        deaths: entry.deaths,
        dayIndex: index,
      }));

    return filtered;
  } catch (error) {
    console.error('Erro ao buscar dados da API:', error);
    throw new Error('Não foi possível carregar os dados da COVID-19');
  }
};

const generateMountainPoints = (data: ProcessedCovidData[]): MountainPoint[] => {
  const points: MountainPoint[] = [];
  const maxCases = Math.max(...data.map(d => d.cases));
  const maxDeaths = Math.max(...data.map(d => d.deaths));

  data.forEach((item, index) => {
    // Normalize the data for 3D positioning
    const x = (index / Math.max(1, data.length - 1)) * 260 - 130; // Stretch timeline path
    const z = 0; // Keep Z at 0 for now, can be used for other dimensions

    // Height based on cases (width of mountain base)
    const caseHeight = (item.cases / maxCases) * 20; // Scale to max height of 20

    // Deaths determine the peak height
    const deathHeight = (item.deaths / maxDeaths) * 30; // Scale to max height of 30

    // Combine both for total height
    const y = caseHeight + deathHeight;

    points.push({
      x,
      y,
      z,
      cases: item.cases,
      deaths: item.deaths,
      date: item.date
    });
  });

  return points;
};

export const useCovidData = () => {
  const setData = useCovidStore((state) => state.setData);
  const setMountainPoints = useCovidStore((state) => state.setMountainPoints);
  const setLoading = useCovidStore((state) => state.setLoading);
  const setError = useCovidStore((state) => state.setError);
  const setRevealedX = useCovidStore((state) => state.setRevealedX);

  const query = useQuery({
    queryKey: ['covid-data', 'disease-sh'],
    queryFn: fetchApiData,
    staleTime: Infinity, // Dados históricos não mudam com frequência
    retry: 3,
  });

  useEffect(() => {
    setLoading(query.isLoading);
    setError(query.error?.message || null);

    if (query.data) {
      setData(query.data);
      const mountainPoints = generateMountainPoints(query.data);
      setMountainPoints(mountainPoints);
      if (mountainPoints.length > 0) {
        setRevealedX(mountainPoints[0].x);
      }
    }
  }, [query.data, query.isLoading, query.error, setData, setMountainPoints, setLoading, setError, setRevealedX]);

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
};
