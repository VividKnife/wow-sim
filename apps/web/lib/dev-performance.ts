import {installReactPerformanceCleanup} from './react-performance-cleanup.js';

// Shared by the application entry and standalone battle previews. ESM installs
// this once per page; production builds neither install nor retain the wrapper.
if(import.meta.env.DEV){
 const restore=installReactPerformanceCleanup(performance);
 import.meta.hot?.dispose(restore);
}
