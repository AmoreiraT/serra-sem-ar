import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { useEffect } from 'react';
import { useCovidStore } from '../stores/covidStore';
import { MountainPoint, ProcessedCovidData } from '../types/covid';

const DATASET_PATH = '/data/brasil-covid-daily.json';
const START_DATE_UTC = Date.UTC(2020, 1, 25); // 21/10/2020

interface DatasetRecord {
  date: string;
  cases: number;
  deaths: number;
  casesAcc?: number;
  deathsAcc?: number;
}

const fetchOfficialDataset = async (): Promise<ProcessedCovidData[]> => {
  try {
    const response = await axios.get<{ records: DatasetRecord[] }>(DATASET_PATH, {
      responseType: 'json',
    });

    const records = response.data?.records;
    if (!Array.isArray(records)) {
      throw new Error('Formato de dados oficiais inválido');
    }

    const filtered = records
      .filter((record) => {
        if (!record?.date) return false;
        const timestamp = Date.parse(record.date);
        return !Number.isNaN(timestamp) && timestamp >= START_DATE_UTC;
      })
      .map((record) => ({
        date: new Date(record.date),
        cases: Number(record.cases ?? 0),
        deaths: Number(record.deaths ?? 0),
        casesAcc: record.casesAcc,
        deathsAcc: record.deathsAcc,
        dayIndex: 0,
      }));

    return filtered.map((item, index) => ({
      ...item,
      dayIndex: index,
    }));
  } catch (error) {
    console.error('Erro ao carregar a série oficial do Ministério da Saúde:', error);
    throw new Error('Não foi possível carregar os dados oficiais da COVID-19');
  }
};

const smoothSeries = (series: number[], radius = 6) => {
  if (series.length === 0) return [];
  const weights: number[] = [];
  let weightSum = 0;
  for (let k = -radius; k <= radius; k++) {
    const weight = Math.exp(-(k * k) / (2 * radius * radius));
    weights.push(weight);
    weightSum += weight;
  }

  return series.map((_, idx) => {
    let acc = 0;
    weights.forEach((weight, offset) => {
      const relative = offset - radius;
      const sampleIndex = Math.min(Math.max(idx + relative, 0), series.length - 1);
      acc += series[sampleIndex] * weight;
    });
    return acc / weightSum;
  });
};

const generateMountainPoints = (data: ProcessedCovidData[]): MountainPoint[] => {
  if (data.length === 0) return [];

  const rawCases = data.map((d) => d.cases);
  const rawDeaths = data.map((d) => d.deaths);
  const smoothedCases = smoothSeries(rawCases, 8);
  const smoothedDeaths = smoothSeries(rawDeaths, 8);

  const maxCases = Math.max(...smoothedCases, 1);
  const maxDeaths = Math.max(...smoothedDeaths, 1);

  const daySpacing = 0.7;
  const centerOffset = (data.length > 1 ? daySpacing * (data.length - 1) : 0) * 0.5;

  return data.map((item, index) => {
    const x = index * daySpacing - centerOffset;
    const z = 0;

    const caseHeight = Math.pow(smoothedCases[index] / maxCases, 0.58) * 22;
    const deathHeight = Math.pow(smoothedDeaths[index] / maxDeaths, 0.66) * 34;
    const y = caseHeight + deathHeight;

    return {
      x,
      y,
      z,
      cases: smoothedCases[index],
      deaths: smoothedDeaths[index],
      date: item.date,
    };
  });
};

export const useCovidData = () => {
  const setData = useCovidStore((state) => state.setData);
  const setMountainPoints = useCovidStore((state) => state.setMountainPoints);
  const setLoading = useCovidStore((state) => state.setLoading);
  const setError = useCovidStore((state) => state.setError);
  const setRevealedX = useCovidStore((state) => state.setRevealedX);

  const query = useQuery({
    queryKey: ['covid-data', 'official-ms'],
    queryFn: fetchOfficialDataset,
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
