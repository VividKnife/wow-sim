import {fileURLToPath} from 'node:url';
export default {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  outputFileTracingRoot: fileURLToPath(new URL('../..', import.meta.url)),
};
