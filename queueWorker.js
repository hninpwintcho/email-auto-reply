require('dotenv').config();
const { Worker } = require('bullmq');
const nodemailer = require('nodemailer');
const { Redis } = require('ioredis');
const fs = require('fs');

const connection = new Redis(process.env.REDIS_URL || 'redis://redis:6379', {
  maxRetriesPerRequest: null  // ← BULLMQ REQUIRED FIX
});

const transporter = nodemailer.createTransport ({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
  tls: {
    rejectUnauthorized: false
  }
});

const RATE_LIMIT = parseInt(process.env.RATE_LIMIT_PER_MINUTE) || 10;

const worker = new Worker('email-replies', async (job) => {
  const { email, subject } = job.data;
  console.log(`[worker] Processing job ${job.id} → ${email}`);

  try {
    const replyText = JSON.parse(fs.readFileSync('./template.json', 'utf-8'));

    const result = await transporter.sendMail({
      from: `"${process.env.SMTP_FROM_NAME}" <${process.env.SMTP_USER}>`,
      to: email,
      subject: replyText.subject,
      text: replyText.content,
    });

    console.log(`✅ Reply sent to ${email}, messageId: ${result.messageId}`);
    console.log(`📧 Check ${email} inbox!`);

  } catch (error) {
    console.error(`❌ SMTP Error for ${email}:`, error.message);
    throw error;
  }
}, {
  connection,
  limiter: { max: RATE_LIMIT, duration: 60000 },
});

worker.on('completed', (job) => console.log(`[worker] ✓ Job ${job.id} completed`));
worker.on('failed', (job, err) => console.error(`[worker] ✗ Job ${job.id} failed:`, err.message));

console.log(`[worker] Started — ${RATE_LIMIT} emails/min max`);