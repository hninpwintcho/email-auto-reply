// redis.js
const redis = require('redis');
const { Redis } = require('ioredis'); // BullMQ needs ioredis

// Original redis client (used by mailer.js for get/set/setEx)
const client = redis.createClient({ url: process.env.REDIS_URL });
client.connect();

// BullMQ connection (separate ioredis instance)
const bullConnection = new Redis(process.env.REDIS_URL || 'redis://redis:6379', {
  maxRetriesPerRequest: null,
});

module.exports = { client, bullConnection };
