#!/usr/bin/env node

const parseNumberArg = (name, fallback = 0) => {
  const flag = `--${name}=`;
  const raw = process.argv.find((entry) => entry.startsWith(flag));
  if (!raw) return fallback;
  const value = Number(raw.slice(flag.length));
  return Number.isFinite(value) ? Math.max(0, value) : fallback;
};

const reads = parseNumberArg('reads');
const writes = parseNumberArg('writes');
const downloadsGb = parseNumberArg('downloadsGb');
const functionsExecutions = parseNumberArg('functionsExecutions');
const budgetUsd = parseNumberArg('budgetUsd', 4);

const readsUsd = (reads / 100_000) * 0.06;
const writesUsd = (writes / 100_000) * 0.18;
const downloadsUsd = Math.max(0, downloadsGb - 1) * 1.0;
const functionsUsd =
  (Math.max(0, functionsExecutions - 2_000_000) / 1_000_000) * 0.4;

const estimatedUsd = readsUsd + writesUsd + downloadsUsd + functionsUsd;

const pickMode = () => {
  if (estimatedUsd >= budgetUsd) {
    return {
      enabled: false,
      writeIntervalMs: 60_000,
      reason: 'budget_limit_reached',
    };
  }
  if (estimatedUsd >= budgetUsd * 0.8) {
    return {
      enabled: true,
      writeIntervalMs: 12_000,
      reason: 'economic_mode_80_percent',
    };
  }
  if (estimatedUsd >= budgetUsd * 0.5) {
    return {
      enabled: true,
      writeIntervalMs: 6_000,
      reason: 'economic_mode_50_percent',
    };
  }
  return { enabled: true, writeIntervalMs: 2_500, reason: 'normal_mode' };
};

const result = {
  usage: {
    reads,
    writes,
    downloadsGb,
    functionsExecutions,
  },
  costsUsd: {
    readsUsd,
    writesUsd,
    downloadsUsd,
    functionsUsd,
    estimatedUsd,
  },
  budgetUsd,
  recommendedPresenceSettings: pickMode(),
};

console.log(JSON.stringify(result, null, 2));
