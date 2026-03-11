// index.js
require('dotenv').config();
const { processUnreadEmails } = require('./mailer');
const startApi = require('./api');

// Start queue worker (consumer)
require('./queueWorker'); // ← NEW LINE

// Start API
startApi();

// Run once immediately
processUnreadEmails();

// Poll IMAP every N seconds
setInterval(() => {
  processUnreadEmails();
}, parseInt(process.env.PROCESS_INTERVAL_SECONDS) * 1000);

process.on('SIGINT', () => {
  console.log('Shutting down...');
  process.exit(0);
});
