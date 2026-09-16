declare namespace Cloudflare {
  interface Env {
    BUCKET?: R2Bucket;
    GAME_SERVER_URL?: string;
    GAME_SERVER_SECRET?: string;
  }
}
