import {fileURLToPath} from 'node:url';
export default {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  outputFileTracingRoot: fileURLToPath(new URL('../..', import.meta.url)),
  webpack(config,{isServer}) {
    if(!isServer)config.resolve.alias[fileURLToPath(new URL('../../packages/game-domain/src/rules/runtime-content.js',import.meta.url))]=fileURLToPath(new URL('../../packages/game-domain/src/rules/runtime-content.browser.js',import.meta.url));
    return config;
  },
};
