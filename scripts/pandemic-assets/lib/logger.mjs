import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const serialize = (value) => JSON.stringify(value, null, 0);

export const writeJsonl = async (filePath, record) => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await appendFile(filePath, `${serialize(record)}\n`, 'utf8');
};

export const logEvent = async (filePath, event, payload = {}) => {
  await writeJsonl(filePath, {
    ts: new Date().toISOString(),
    event,
    ...payload,
  });
};
