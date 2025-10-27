require('dotenv').config();
const nodemailer = require('nodemailer');

console.log('📧 Testing Email Delivery with Detailed Logging...');

// Create transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  debug: true, // Enable debug logging
  logger: true // Enable logger
});

// Test email data
const testEmailData = {
  from: process.env.EMAIL_USER,
  to: 'vishalpatel581012@gmail.com',
  subject: 'TEST - Order Status Update Notification',
  html: `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
      <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #333; margin: 0; font-size: 24px;">Rikocraft</h1>
          <p style="color: #666; margin: 5px 0; font-size: 14px;">Where heritage meets craftsmanship</p>
        </div>
        <div style="margin-bottom: 25px;">
          <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0;">
            Dear <strong>Test User</strong>,
          </p>
          <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 15px 0;">
            We wanted to let you know that the status of your order has been updated to:
            <span style="color: #007bff; font-weight: bold;">Confirmed</span>
          </p>
        </div>
        <div style="margin: 20px 0; padding: 15px; background: #f8f9fa; border-radius: 5px;">
          <strong>Delivery Address:</strong><br>
          123 Test Street<br>
          Test City, Test State - 123456<br>
          India
        </div>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <thead>
            <tr>
              <th style="padding: 8px; border: 1px solid #eee; background: #f8f9fa;">Item</th>
              <th style="padding: 8px; border: 1px solid #eee; background: #f8f9fa;">Qty</th>
              <th style="padding: 8px; border: 1px solid #eee; background: #f8f9fa;">Price</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding: 8px; border: 1px solid #eee;">Test Product</td>
              <td style="padding: 8px; border: 1px solid #eee;">1</td>
              <td style="padding: 8px; border: 1px solid #eee;">₹1000</td>
            </tr>
          </tbody>
        </table>
        <div style="text-align: right; margin-bottom: 20px;">
          <strong>Total: ₹1000</strong>
        </div>
        <div style="margin: 25px 0;">
          <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0;">
            Your order is currently <strong>confirmed</strong>. We will keep you updated on the next steps.
          </p>
        </div>
        <div style="border-top: 1px solid #eee; padding-top: 20px; margin-top: 30px;">
          <p style="color: #666; font-size: 14px; margin: 0; line-height: 1.6;">
            <strong>Warm regards,</strong><br>
            Team Rikocraft
          </p>
        </div>
      </div>
    </div>
  `,
  text: `Dear Test User,

We wanted to let you know that the status of your order has been updated to: Confirmed

Order Summary:
- Test Product x1 (₹1000)
Total: ₹1000

Delivery Address:
123 Test Street
Test City, Test State - 123456
India

Your order is currently confirmed. We will keep you updated on the next steps.

Warm regards,
Team Rikocraft`
};

async function testEmailDelivery() {
  try {
    console.log('📤 Sending test email...');
    console.log('📧 From:', testEmailData.from);
    console.log('📧 To:', testEmailData.to);
    console.log('📧 Subject:', testEmailData.subject);
    
    // Verify connection first
    console.log('\n🔍 Verifying email connection...');
    await transporter.verify();
    console.log('✅ Email connection verified successfully');
    
    // Send email
    console.log('\n📤 Sending email...');
    const result = await transporter.sendMail(testEmailData);
    
    console.log('✅ Email sent successfully!');
    console.log('📧 Message ID:', result.messageId);
    console.log('📧 Response:', result.response);
    console.log('📧 Accepted:', result.accepted);
    console.log('📧 Rejected:', result.rejected);
    
    if (result.accepted && result.accepted.length > 0) {
      console.log('\n🎉 Email delivery confirmed!');
      console.log('📧 Email sent to:', result.accepted.join(', '));
      console.log('📧 Check your inbox and spam folder');
    }
    
    if (result.rejected && result.rejected.length > 0) {
      console.log('\n❌ Email delivery failed!');
      console.log('📧 Rejected recipients:', result.rejected.join(', '));
    }
    
  } catch (error) {
    console.error('❌ Email sending failed:', error.message);
    console.error('📧 Error code:', error.code);
    console.error('📧 Error command:', error.command);
    console.error('📧 Error response:', error.response);
    
    if (error.code === 'EAUTH') {
      console.log('\n🔧 Authentication Error:');
      console.log('1. Check Gmail credentials');
      console.log('2. Enable 2-Factor Authentication');
      console.log('3. Generate App Password');
      console.log('4. Update EMAIL_PASS in .env file');
    }
    
    if (error.code === 'ECONNECTION') {
      console.log('\n🔧 Connection Error:');
      console.log('1. Check internet connection');
      console.log('2. Check Gmail SMTP settings');
    }
  }
}

testEmailDelivery();
