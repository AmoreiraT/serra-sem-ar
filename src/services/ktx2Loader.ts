import type { WebGLRenderer } from 'three';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

const BASIS_TRANSCODER_PATH = '/assets/basis/';
const WORKER_LIMIT = 2;

let sharedLoader: KTX2Loader | null = null;
let detectedRenderer: WebGLRenderer | null = null;

export const getSharedKtx2Loader = (renderer: WebGLRenderer): KTX2Loader => {
  if (!sharedLoader) {
    sharedLoader = new KTX2Loader();
    sharedLoader.setTranscoderPath(BASIS_TRANSCODER_PATH);
    sharedLoader.setWorkerLimit(WORKER_LIMIT);
  }

  if (detectedRenderer !== renderer) {
    sharedLoader.detectSupport(renderer);
    detectedRenderer = renderer;
  }

  return sharedLoader;
};
