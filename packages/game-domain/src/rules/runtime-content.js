import data from '../../../game-data/runtime/catalog.json' with {type:'json'};
import {openPackedContent} from '../../../sim-core/src/packed-content.js';
const content=openPackedContent(data);
export const runtime=content.root;
export const contentStats=content.stats;
export const clearContentCache=content.clear;
