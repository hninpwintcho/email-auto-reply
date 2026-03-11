// mailer.js — Producer (unchanged logic, sends to queue instead of SMTP directly)
require('dotenv').config();
const imaps = require('imap-simple');
const { Queue } = require('bullmq');
const { client: redis, bullConnection } = require('./redis');
const dayjs = require('dayjs');

// BullMQ queue
const emailQueue = new Queue('email-replies', { connection: bullConnection });

const config = {
  imap: {
    user: process.env.IMAP_USER,
    password: process.env.IMAP_PASSWORD,
    host: process.env.IMAP_HOST,
    port: parseInt(process.env.IMAP_PORT),
    tls: true,
    tlsOptions: {
      rejectUnauthorized: false  // ← FIX: Accept self-signed certs
    },
    authTimeout: 3000,
  }
};

// Unchanged from original
function isValidEmail(email) {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email);
}

// Unchanged from original
function isCommonInvalidEmail(email) {
  const invalidPatterns = [
    /^noreply@/i, /^no-reply@/i, /^donotreply@/i,
    /^do-not-reply@/i, /^postmaster@/i, /^mailer-daemon@/i,
    /^daemon@/i, /^bounce@/i, /^abuse@/i, /^spam@/i,
  ];
  return invalidPatterns.some(pattern => pattern.test(email));
}

async function processUnreadEmails() {
  const connection = await imaps.connect(config);
  await connection.openBox('INBOX');

  try {
    const searchResult = await connection.search(['UNSEEN'], {
      bodies: ['HEADER.FIELDS (FROM SUBJECT DATE)', 'TEXT'],
      markSeen: false,
      struct: true
    });

    const messages = searchResult.messages || searchResult;

    if (!messages || !Array.isArray(messages)) {
      console.log('No valid messages found');
      await connection.end();
      return;
    }

    const totalUnreadCount = messages.length;
    console.log(`Found unread messages: ${totalUnreadCount}`);

    if (totalUnreadCount === 0) {
      await connection.end();
      return;
    }

    const processedEmails = new Set();
    const allProcessedUIDs = [];
    let queuedCount = 0;
    let skippedCount = 0;

    for (let index = 0; index < messages.length; index++) {
      const msg = messages[index];
      const messageUID = msg.attributes && msg.attributes.uid;
      if (messageUID) allProcessedUIDs.push(messageUID);

      try {
        if (!msg.parts?.[0]?.body?.from) {
          console.log(`Message ${index + 1}: missing from field, skipping`);
          continue;
        }

        const from = msg.parts[0].body.from;
        if (!Array.isArray(from) || from.length === 0) continue;

        const fromAddress = from[0];
        const email = fromAddress.match(/<(.+)>/)?.[1] || fromAddress;
        const subject = msg.parts[0].body.subject?.[0] || '(no subject)';

        console.log(`📧 Detected sender: ${email}`);

        // All original validation checks — unchanged
        if (!isValidEmail(email)) {
          console.log(`❌ Invalid email format, skipping: ${email}`);
          skippedCount++; continue;
        }
        if (isCommonInvalidEmail(email)) {
          console.log(`🚫 System/no-reply email, skipping: ${email}`);
          skippedCount++; continue;
        }

        const blacklistKey = `blacklist:${email}`;
        const isBlacklisted = await redis.get(blacklistKey);
        if (isBlacklisted) {
          console.log(`🚫 Blacklisted, skipping: ${email}`);
          skippedCount++; continue;
        }

        if (processedEmails.has(email)) {
          console.log(`🔄 Duplicate email, skipping: ${email}`);
          skippedCount++; continue;
        }
        processedEmails.add(email);

        const key = `replied:${email}`;
        const already = await redis.get(key);
        if (already) {
          console.log(`⏰ Already replied to ${email} within interval, skipping`);
          skippedCount++; continue;
        }

        // ✅ NEW: Push to BullMQ queue instead of sending directly
        await emailQueue.add(
          'send-reply',
          { email, subject },
          {
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
            removeOnComplete: 100,
            removeOnFail: 50,
          }
        );
        console.log(`📥 Queued reply job for: ${email}`);
        queuedCount++;

      } catch (error) {
        console.error(`✗ Failed to process message ${index + 1}:`, error.message);
      }
    }

    // Mark all processed emails as read — unchanged behavior
    if (allProcessedUIDs.length > 0) {
      try {
        await connection.addFlags(allProcessedUIDs, '\\Seen');
        console.log(`✓ Marked ${allProcessedUIDs.length} messages as read`);
      } catch (error) {
        console.error('✗ Failed to mark messages as read:', error.message);
      }
    }

    console.log(`\n📊 Fetch cycle done — Queued: ${queuedCount}, Skipped: ${skippedCount}`);

  } catch (error) {
    console.error('Error processing unread emails:', error.message);
  } finally {
    await connection.end();
  }
}

module.exports = { processUnreadEmails };
