import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

export const sha256Buffer = (buffer) => createHash('sha256').update(buffer).digest('hex');

export const sha256File = async (filePath) =>
  new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
