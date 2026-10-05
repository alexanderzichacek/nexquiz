import { Redis } from "ioredis";

export interface RedisHandle {
  redis: Redis;
  /** Pings Redis; resolves to false instead of throwing. */
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

export function createRedis(url: string): RedisHandle {
  const redis = new Redis(url, { maxRetriesPerRequest: 3, lazyConnect: false });
  return {
    redis,
    async ping() {
      try {
        return (await redis.ping()) === "PONG";
      } catch {
        return false;
      }
    },
    async close() {
      await redis.quit();
    },
  };
}
