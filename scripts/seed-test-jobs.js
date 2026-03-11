require('dotenv').config();
const { Queue } = require('bullmq');
const Redis = require('ioredis');

const connection = new Redis(process.env.REDIS_URL || 'redis://redis:6379');
const queue = new Queue('email-replies', { connection });

(async () => {
  await queue.add('send-reply', {
    email: 'hninpwintcho155@gmail.com',
    subject: 'Test Auto Reply from Queue'
  });
  console.log('✅ Test job queued to Redis!');
  process.exit(0);
})();
