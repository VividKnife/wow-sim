import stamp from '../../../game-version.json';

type GameVersion=typeof stamp&{commit:string};
declare const __GAME_VERSION__:GameVersion;

// Production uses the build's immutable stamp. Standalone component previews
// have no Vite deployment define and identify themselves as development builds.
export const gameVersion:GameVersion=typeof __GAME_VERSION__==='undefined'?{...stamp,commit:'local'}:__GAME_VERSION__;
