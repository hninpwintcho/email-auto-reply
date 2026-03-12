Email Auto-Reply System with BullMQ Redis Queue
[

Production-ready email auto-responder with Redis BullMQ queue, rate limiting, and high availability.

🎯 Features
BullMQ Redis Queue - Reliable job processing with retries & dead letter queue

Rate Limiting - 10 emails/minute prevents reply storms

High Availability - restart: always survives crashes

Producer/Consumer - Separate IMAP poller + queue worker

Original Features Preserved - Template API, validation, blacklist

Docker Compose - One-command deployment

🏗️ Architecture
text
IMAP → Producer (mailer.js) → Redis Queue (BullMQ) → Worker (queueWorker.js) → SMTP
                          ↓
                    Rate Limit (10/min)