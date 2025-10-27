const nodemailer = require('nodemailer');

// Test with actual credentials (replace with your email)
const testCredentials = {
  user: 'your-email@gmail.com', // Replace with your Gmail
  pass: 'your-app-password'      // Replace with your app password
};

console.log('🧪 Testing Email with Credentials...');

// Create transporter with test credentials
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: testCredentials
});

// Test order status update email
const testOrder = {
  email: 'recipient@example.com', // Replace with recipient email
  customerName: 'Test User',
  orderStatus: 'confirmed',
  items: [
    {
      name: 'Test Product 1',
      quantity: 2,
      price: 1500
    }
  ],
  totalAmount: 3000,
  address: {
    street: '123 Test Street',
    city: 'Test City',
    state: 'Test State',
    pincode: '123456',
    country: 'India'
  }
};

// Email template
const sendTestEmail = async () => {
  try {
    const { email, customerName, orderStatus, items, totalAmount, address } = testOrder;
    
    const subject = `Rikocraft Order Status Update - ${orderStatus.charAt(0).toUpperCase() + orderStatus.slice(1)}`;
    
    const itemsHtml = items.map(item => 
      `<tr>
        <td style="padding: 8px; border: 1px solid #eee;">${item.name}</td>
        <td style="padding: 8px; border: 1px solid #eee;">${item.quantity}</td>
        <td style="padding: 8px; border: 1px solid #eee;">₹${item.price}</td>
      </tr>`
    ).join('');

    const addressHtml = `
      <div style="margin: 20px 0; padding: 15px; background: #f8f9fa; border-radius: 5px;">
        <strong>Delivery Address:</strong><br>
        ${address.street || ''}<br>
        ${address.city || ''}, ${address.state || ''} - ${address.pincode || ''}<br>
        ${address.country || ''}
      </div>
    `;

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
        <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #333; margin: 0; font-size: 24px;">Rikocraft</h1>
            <p style="color: #666; margin: 5px 0; font-size: 14px;">Where heritage meets craftsmanship</p>
          </div>
          <div style="margin-bottom: 25px;">
            <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0;">
              Dear <strong>${customerName}</strong>,
            </p>
            <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 15px 0;">
              We wanted to let you know that the status of your order has been updated to:
              <span style="color: #007bff; font-weight: bold;">${orderStatus.charAt(0).toUpperCase() + orderStatus.slice(1)}</span>
            </p>
          </div>
          ${addressHtml}
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <thead>
              <tr>
                <th style="padding: 8px; border: 1px solid #eee; background: #f8f9fa;">Item</th>
                <th style="padding: 8px; border: 1px solid #eee; background: #f8f9fa;">Qty</th>
                <th style="padding: 8px; border: 1px solid #eee; background: #f8f9fa;">Price</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>
          <div style="text-align: right; margin-bottom: 20px;">
            <strong>Total: ₹${totalAmount}</strong>
          </div>
          <div style="margin: 25px 0;">
            <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0;">
              Your order is currently <strong>${orderStatus}</strong>. We will keep you updated on the next steps.
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
    `;

    const result = await transporter.sendMail({
      from: testCredentials.user,
      to: email,
      subject: subject,
      html: htmlBody
    });

    console.log('✅ Test email sent successfully!');
    console.log('📧 Message ID:', result.messageId);
    console.log('📧 Response:', result.response);
    
  } catch (error) {
    console.error('❌ Error sending test email:', error.message);
    
    if (error.code === 'EAUTH') {
      console.log('\n🔧 Email Setup Required:');
      console.log('1. Replace "your-email@gmail.com" with your actual Gmail');
      console.log('2. Replace "your-app-password" with your Gmail App Password');
      console.log('3. Enable 2-Factor Authentication on Gmail');
      console.log('4. Generate App Password from Google Account Settings');
    }
  }
};

sendTestEmail();
