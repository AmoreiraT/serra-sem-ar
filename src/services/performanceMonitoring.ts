import { app } from './firebaseConfig';

type TraceAttributes = Record<string, string | number | boolean | null | undefined>;
type TraceMetrics = Record<string, number>;

type FirebasePerformanceModule = typeof import('firebase/performance');
type FirebasePerformance = ReturnType<FirebasePerformanceModule['getPerformance']>;
type FirebaseTrace = ReturnType<FirebasePerformanceModule['trace']>;

export type PerformanceTraceHandle = {
  putMetric: (name: string, value: number) => void;
  stop: (extraAttributes?: TraceAttributes) => void;
};

const firebasePerfEnabled = (): boolean => {
  const flag = import.meta.env.VITE_ENABLE_FIREBASE_PERF;
  if (flag === 'false') return false;
  if (flag === 'true') return true;
  return import.meta.env.PROD;
};

let performancePromise: Promise<FirebasePerformance | null> | null = null;

const normalizeAttributeValue = (value: string | number | boolean | null | undefined): string | null => {
  if (value === null || value === undefined) return null;
  const normalized = String(value);
  return normalized.length > 100 ? normalized.slice(0, 100) : normalized;
};

const loadFirebasePerformance = async (): Promise<FirebasePerformance | null> => {
  if (!firebasePerfEnabled() || typeof window === 'undefined') return null;

  try {
    const perfModule = await import('firebase/performance');
    const supported = await perfModule.isSupported();
    return supported ? perfModule.getPerformance(app) : null;
  } catch {
    return null;
  }
};

const getFirebasePerformance = (): Promise<FirebasePerformance | null> => {
  performancePromise ??= loadFirebasePerformance();
  return performancePromise;
};

const applyAttributes = (trace: FirebaseTrace, attributes: TraceAttributes) => {
  for (const [key, rawValue] of Object.entries(attributes)) {
    const value = normalizeAttributeValue(rawValue);
    if (value === null) continue;
    trace.putAttribute(key, value);
  }
};

const applyMetrics = (trace: FirebaseTrace, metrics: TraceMetrics) => {
  for (const [key, value] of Object.entries(metrics)) {
    if (!Number.isFinite(value)) continue;
    trace.putMetric(key, Math.max(0, Math.round(value)));
  }
};

export const startPerformanceTrace = (name: string, attributes: TraceAttributes = {}): PerformanceTraceHandle => {
  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const metrics: TraceMetrics = {};
  let stopped = false;

  const tracePromise = getFirebasePerformance().then(async (firebasePerformance) => {
    if (!firebasePerformance) return null;
    const perfModule = await import('firebase/performance');
    const trace = perfModule.trace(firebasePerformance, name);
    applyAttributes(trace, attributes);
    trace.start();
    return trace;
  });

  return {
    putMetric: (metricName, value) => {
      metrics[metricName] = value;
    },
    stop: (extraAttributes = {}) => {
      if (stopped) return;
      stopped = true;
      const stoppedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
      metrics.duration_ms = stoppedAt - startedAt;

      void tracePromise.then((trace) => {
        if (!trace) return;
        applyAttributes(trace, extraAttributes);
        applyMetrics(trace, metrics);
        trace.stop();
      });
    },
  };
};
