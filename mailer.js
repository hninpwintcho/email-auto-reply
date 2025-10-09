const imaps = require('imap-simple');
const nodemailer = require('nodemailer');
const redis = require('./redis');
const fs = require('fs');
const dayjs = require('dayjs');

const config = {
  imap: {
    user: process.env.IMAP_USER,
    password: process.env.IMAP_PASSWORD,
    host: process.env.IMAP_HOST,
    port: parseInt(process.env.IMAP_PORT),
    tls: true,
    authTimeout: 3000,
  }
};

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  }
});

// 邮箱地址验证函数
function isValidEmail(email) {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email);
}

// 检查是否为常见的无效邮箱
function isCommonInvalidEmail(email) {
  const invalidPatterns = [
    /^noreply@/i,
    /^no-reply@/i,
    /^donotreply@/i,
    /^do-not-reply@/i,
    /^postmaster@/i,
    /^mailer-daemon@/i,
    /^daemon@/i,
    /^bounce@/i,
    /^abuse@/i,
    /^spam@/i,
    // 添加其他常见的系统邮箱模式
  ];

  return invalidPatterns.some(pattern => pattern.test(email));
}

async function processUnreadEmails() {
  const connection = await imaps.connect(config);
  await connection.openBox('INBOX');

  try {
    // 获取所有未读消息
    const searchResult = await connection.search(['UNSEEN'], {
      bodies: ['HEADER.FIELDS (FROM SUBJECT DATE)', 'TEXT'],
      markSeen: false,
      struct: true
    });

    // 获取messages数组
    const messages = searchResult.messages || searchResult;

    if (!messages || !Array.isArray(messages)) {
      console.log('没有找到有效的消息数据');
      await connection.end();
      return;
    }

    const totalUnreadCount = messages.length;
    console.log(`发现未读消息总数: ${totalUnreadCount}条`);

    if (totalUnreadCount === 0) {
      console.log('没有未读消息需要处理');
      await connection.end();
      return;
    }

    // 处理所有消息
    const processedEmails = new Set(); // 用于去重
    const successfullyRepliedUIDs = []; // 记录成功回复的消息UID
    const allProcessedUIDs = []; // 记录所有处理过的消息UID（包括跳过的）
    let validEmailCount = 0;
    let invalidEmailCount = 0;
    let duplicateEmailCount = 0;
    let alreadyRepliedCount = 0;

    for (let index = 0; index < messages.length; index++) {
      const msg = messages[index];

      // 获取消息UID，用于后续标记已读
      const messageUID = msg.attributes && msg.attributes.uid;
      if (messageUID) {
        allProcessedUIDs.push(messageUID);
      }

      try {
        // 检查消息结构
        if (!msg.parts || !Array.isArray(msg.parts) || msg.parts.length === 0) {
          console.log(`第${index + 1}条消息：parts结构异常，跳过`);
          continue;
        }

        if (!msg.parts[0] || !msg.parts[0].body || !msg.parts[0].body.from) {
          console.log(`第${index + 1}条消息：from字段缺失，跳过`);
          continue;
        }

        const from = msg.parts[0].body.from;

        if (!Array.isArray(from) || from.length === 0) {
          console.log(`第${index + 1}条消息：from字段格式异常，跳过`);
          continue;
        }

        const fromAddress = from[0];
        const email = fromAddress.match(/<(.+)>/)?.[1] || fromAddress;

        console.log(`📧 检测到发件人: ${email}`);

        // 邮箱格式验证
        if (!isValidEmail(email)) {
          console.log(`❌ 邮箱格式无效，跳过: ${email}`);
          invalidEmailCount++;
          continue;
        }

        // 检查是否为常见的系统邮箱
        if (isCommonInvalidEmail(email)) {
          console.log(`🚫 系统邮箱或无回复邮箱，跳过: ${email}`);
          invalidEmailCount++;
          continue;
        }

        // 检查是否在黑名单中
        const blacklistKey = `blacklist:${email}`;
        const isBlacklisted = await redis.get(blacklistKey);
        if (isBlacklisted) {
          console.log(`🚫 邮箱在黑名单中，跳过: ${email}`);
          invalidEmailCount++;
          continue;
        }

        // 根据邮箱去重
        if (processedEmails.has(email)) {
          console.log(`🔄 跳过重复邮箱: ${email}`);
          duplicateEmailCount++;
          continue;
        }
        processedEmails.add(email);

        // 检查Redis中是否已经回复过
        const key = `replied:${email}`;
        const already = await redis.get(key);
        if (already) {
          console.log(`⏰ 邮箱 ${email} 在间隔时间内已回复过，跳过`);
          alreadyRepliedCount++;
          continue;
        }

        // 发送回复邮件
        console.log(`📤 准备发送回复邮件到: ${email}`);

        try {
          const replyText = JSON.parse(fs.readFileSync('./template.json', 'utf-8'));

          const mailOptions = {
            from: `"${process.env.SMTP_FROM_NAME}" <${process.env.SMTP_USER}>`,
            to: email,
            subject: replyText.subject,
            text: replyText.content
          };

          console.log(`📮 发送邮件配置:`, {
            from: mailOptions.from,
            to: mailOptions.to,
            subject: mailOptions.subject
          });

          const sendResult = await transporter.sendMail(mailOptions);
          console.log(`✅ 邮件发送成功到 ${email}, messageId: ${sendResult.messageId}`);

          // 记录到Redis
          await redis.setEx(key, parseInt(process.env.REPLY_INTERVAL_HOURS) * 3600, '1');

          // 记录成功回复的消息UID
          if (messageUID) {
            successfullyRepliedUIDs.push(messageUID);
          }

          validEmailCount++;
          console.log(`✓ 成功回复邮箱: ${email} (时间: ${dayjs().format()})`);

        } catch (sendError) {
          console.error(`❌ 发送邮件失败到 ${email}:`, sendError.message);

          // 详细错误分析
          if (sendError.message.includes('User does not exist') ||
            sendError.message.includes('5.1.1') ||
            sendError.message.includes('550') ||
            sendError.message.includes('recipient rejected')) {
            console.log(`🚫 邮箱 ${email} 不存在或被拒绝，将加入黑名单`);
            // 可以选择将无效邮箱加入黑名单，避免重复发送
            await redis.setEx(`blacklist:${email}`, 86400 * 7, '1'); // 7天黑名单
          }

          invalidEmailCount++;
          continue;
        }

      } catch (error) {
        console.error(`✗ 处理第${index + 1}条消息失败:`, error.message);
      }
    }

    // 标记所有处理过的消息为已读
    if (allProcessedUIDs.length > 0) {
      try {
        await connection.addFlags(allProcessedUIDs, '\\Seen');
        console.log(`✓ 已标记${allProcessedUIDs.length}条消息为已读（包括跳过的消息）`);
      } catch (error) {
        console.error('✗ 标记消息已读失败:', error.message);
      }
    }

    // 详细统计报告
    console.log(`\n📊 处理完成统计:`);
    console.log(`   📬 总未读消息: ${totalUnreadCount}条`);
    console.log(`   ✅ 成功发送: ${validEmailCount}封`);
    console.log(`   ❌ 无效邮箱: ${invalidEmailCount}个`);
    console.log(`   🔄 重复邮箱: ${duplicateEmailCount}个`);
    console.log(`   ⏰ 已回复过: ${alreadyRepliedCount}个`);
    console.log(`   📑 标记已读: ${allProcessedUIDs.length}条`);
    console.log(`   📧 成功回复: ${successfullyRepliedUIDs.length}条`);

  } catch (error) {
    console.error('处理未读邮件时发生错误:', error.message);
  } finally {
    await connection.end();
  }
}

module.exports = {
  processUnreadEmails
};
