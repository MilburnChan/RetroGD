interface Bucket {
  hits: number[];
}

const buckets = new Map<string, Bucket>();

export const consumeRateLimit = (key: string, limit: number, windowMs: number): boolean => {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((time) => now - time < windowMs);

  if (bucket.hits.length >= limit) {
    buckets.set(key, bucket);
    return false;
  }

  bucket.hits.push(now);
  buckets.set(key, bucket);
  return true;
};
