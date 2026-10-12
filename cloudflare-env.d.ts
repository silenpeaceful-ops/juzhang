declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    SITES_SERVICE_ACCESS_TOKEN?: string;
    CONFIG_ENCRYPTION_SECRET?: string;
    OWNER_PRIVATE_SERVICE_ACCESS?: string;
  }
}
