export interface CovidDataPoint {
  date: string;
  new_cases: number;
  new_deaths: number;
}

export interface ProcessedCovidData {
  date: Date;
  cases: number;
  deaths: number;
  dayIndex: number;
}

export interface MountainPoint {
  x: number;
  y: number;
  z: number;
  cases: number;
  deaths: number;
  date: Date;
}

