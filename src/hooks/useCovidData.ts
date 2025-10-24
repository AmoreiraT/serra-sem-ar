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

const generateMountainPoints = (data: ProcessedCovidData[]): MountainPoint[] => {
  if (data.length === 0) return [];

  const maxCases = Math.max(...data.map((d) => d.cases), 1);
  const maxDeaths = Math.max(...data.map((d) => d.deaths), 1);

  return data.map((item, index) => {
    // Normalize the data for 3D positioning
    const x = (index / Math.max(1, data.length - 1)) * 260 - 130; // Stretch timeline path
    const z = 0; // Keep Z at 0 for now, can be used for other dimensions

    // Height based on cases (width of mountain base)
    const caseHeight = (item.cases / maxCases) * 20; // Scale to max height of 20

    // Deaths determine the peak height
    const deathHeight = (item.deaths / maxDeaths) * 30; // Scale to max height of 30

    // Combine both for total height
    const y = caseHeight + deathHeight;

    return {
      x,
      y,
      z,
      cases: item.cases,
      deaths: item.deaths,
      date: item.date
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
