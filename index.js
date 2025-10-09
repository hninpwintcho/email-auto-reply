const { processUnreadEmails } = require('./mailer');
const startApi = require('./api');

// 启动API服务
startApi();

// 执行一次
processUnreadEmails();

// 启动邮件处理服务，每n秒处理一次
setInterval(() => {
  processUnreadEmails();
}, parseInt(process.env.PROCESS_INTERVAL_SECONDS) * 1000);

// 监听退出信号
process.on('SIGINT', () => {
  console.log('Shutting down...');
  process.exit(0);
});