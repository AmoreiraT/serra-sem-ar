import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { ProcessedCovidData, MountainPoint } from '../types/covid';
import { useCovidStore } from '../stores/covidStore';
import { useEffect } from 'react';

const parseCSVData = async (): Promise<ProcessedCovidData[]> => {
  try {
    // Import the CSV file from public folder
    const response = await axios.get('/brazil_daily_covid_data.csv', {
      responseType: 'text'
    });

    const csvText = response.data;

    const lines = csvText.trim().split('\n');
    
    const data: ProcessedCovidData[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',');
      
      if (values.length >= 3) {
        const dateStr = values[0];
        const casesStr = values[1];
        const deathsStr = values[2];
        
        // Skip rows with empty or invalid data
        if (!dateStr || casesStr === '' || deathsStr === '') {
          continue;
        }
        
        const date = new Date(dateStr);
        const cases = parseInt(casesStr) || 0;
        const deaths = parseInt(deathsStr) || 0;
        
        // Only include valid dates
        if (!isNaN(date.getTime())) {
          data.push({
            date,
            cases,
            deaths,
            dayIndex: i - 1
          });
        }
      }
    }
    
    return data.sort((a, b) => a.date.getTime() - b.date.getTime());
  } catch (error) {
    console.error('Error parsing CSV data:', error);
    throw new Error('Failed to load COVID-19 data');
  }
};

const generateMountainPoints = (data: ProcessedCovidData[]): MountainPoint[] => {
  const points: MountainPoint[] = [];
  const maxCases = Math.max(...data.map(d => d.cases));
  const maxDeaths = Math.max(...data.map(d => d.deaths));
  
  data.forEach((item, index) => {
    // Normalize the data for 3D positioning
    const x = (index / data.length) * 100 - 50; // Spread along X axis (-50 to 50)
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
    queryKey: ['covid-data'],
    queryFn: parseCSVData,
    staleTime: Infinity, // Data won't change, so cache indefinitely
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
