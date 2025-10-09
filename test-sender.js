const nodemailer = require('nodemailer');
const fs = require('fs');
const dayjs = require('dayjs');

// 检查环境变量
function checkEnvVariables() {
  const required = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM_NAME'];
  const missing = required.filter(env => !process.env[env]);
  
  if (missing.length > 0) {
    console.error('❌ 缺少必要的环境变量:', missing.join(', '));
    process.exit(1);
  }
  
  console.log('✅ 环境变量检查通过');
}

// 创建邮件传输器
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

// 测试邮件发送功能
async function testSendEmail(recipientEmail, customSubject = null, customContent = null) {
  console.log(`\n🧪 开始测试发送邮件到: ${recipientEmail}`);
  
  // 验证邮箱格式
  if (!isValidEmail(recipientEmail)) {
    console.error('❌ 邮箱格式无效');
    return false;
  }
  
  try {
    // 读取邮件模板
    let replyText;
    if (customSubject && customContent) {
      replyText = {
        subject: customSubject,
        content: customContent
      };
    } else {
      try {
        replyText = JSON.parse(fs.readFileSync('./template.json', 'utf-8'));
      } catch (err) {
        console.log('⚠️  template.json文件不存在或格式错误，使用默认模板');
        replyText = {
          subject: '🐱🐯 猫虎社区自动回复测试',
          content: `亲爱的用户，\n\n感谢您联系猫虎社区！\n\n这是一封测试邮件，发送时间：${dayjs().format('YYYY-MM-DD HH:mm:ss')}\n\n祝好！\n猫虎社区团队`
        };
      }
    }
    
    const mailOptions = {
      from: `"${process.env.SMTP_FROM_NAME}" <${process.env.SMTP_USER}>`,
      to: recipientEmail,
      subject: replyText.subject,
      text: replyText.content
    };
    
    console.log('📮 发送邮件配置:');
    console.log(`   发件人: ${mailOptions.from}`);
    console.log(`   收件人: ${mailOptions.to}`);
    console.log(`   主题: ${mailOptions.subject}`);
    console.log(`   内容预览: ${replyText.content.substring(0, 50)}...`);
    
    // 发送邮件
    const sendResult = await transporter.sendMail(mailOptions);
    
    console.log(`✅ 邮件发送成功！`);
    console.log(`   MessageId: ${sendResult.messageId}`);
    console.log(`   发送时间: ${dayjs().format('YYYY-MM-DD HH:mm:ss')}`);
    
    return true;
    
  } catch (error) {
    console.error('❌ 邮件发送失败:', error.message);
    
    // 详细错误分析
    if (error.message.includes('User does not exist') || 
        error.message.includes('5.1.1')) {
      console.log('💡 提示: 收件人邮箱可能不存在');
    } else if (error.message.includes('authentication')) {
      console.log('💡 提示: SMTP认证失败，请检查用户名和密码');
    } else if (error.message.includes('ECONNREFUSED')) {
      console.log('💡 提示: 无法连接到SMTP服务器，请检查主机和端口');
    }
    
    return false;
  }
}

// 批量测试发送
async function testBatchSend(emails) {
  console.log(`\n📨 开始批量测试发送，共${emails.length}个邮箱`);
  
  let successCount = 0;
  let failCount = 0;
  
  for (let i = 0; i < emails.length; i++) {
    const email = emails[i];
    console.log(`\n--- 测试 ${i + 1}/${emails.length} ---`);
    
    const success = await testSendEmail(email);
    if (success) {
      successCount++;
    } else {
      failCount++;
    }
    
    // 添加延迟，避免发送过快
    if (i < emails.length - 1) {
      console.log('⏳ 等待2秒...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  console.log(`\n📊 批量发送完成:`);
  console.log(`   ✅ 成功: ${successCount}封`);
  console.log(`   ❌ 失败: ${failCount}封`);
}

// 测试SMTP连接
async function testConnection() {
  console.log('\n🔗 测试SMTP连接...');
  
  try {
    await transporter.verify();
    console.log('✅ SMTP连接测试成功');
    return true;
  } catch (error) {
    console.error('❌ SMTP连接测试失败:', error.message);
    return false;
  }
}

// 主函数
async function main() {
  console.log('🧪 猫虎社区邮件发送测试工具');
  console.log('================================');
  
  // 检查环境变量
  checkEnvVariables();
  
  // 测试连接
  const connectionOk = await testConnection();
  if (!connectionOk) {
    console.log('💡 请检查SMTP配置后重试');
    process.exit(1);
  }
  
  // 从命令行参数获取测试邮箱
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('\n📝 使用方法:');
    console.log('   单个测试: node test-sender.js user@example.com');
    console.log('   批量测试: node test-sender.js user1@example.com user2@example.com');
    console.log('   自定义内容: node test-sender.js user@example.com "自定义主题" "自定义内容"');
    process.exit(0);
  }
  
  if (args.length === 1) {
    // 单个邮箱测试
    await testSendEmail(args[0]);
  } else if (args.length === 3) {
    // 自定义主题和内容
    await testSendEmail(args[0], args[1], args[2]);
  } else {
    // 批量测试
    await testBatchSend(args);
  }
  
  console.log('\n🎉 测试完成！');
}

// 导出函数，供其他文件使用
module.exports = {
  testSendEmail,
  testBatchSend,
  testConnection
};

// 如果直接运行此文件
if (require.main === module) {
  main().catch(error => {
    console.error('💥 程序运行出错:', error.message);
    process.exit(1);
  });
} 