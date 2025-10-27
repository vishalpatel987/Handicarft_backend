const Razorpay = require('razorpay');
require('dotenv').config();

async function checkRazorpayLimits() {
  try {
    console.log('\n=== Checking Razorpay Configuration and Limits ===\n');

    // Check environment variables
    console.log('1. Environment Variables:');
    console.log(`   RAZORPAY_KEY_ID: ${process.env.RAZORPAY_KEY_ID ? 'SET' : 'NOT SET'}`);
    console.log(`   RAZORPAY_KEY_SECRET: ${process.env.RAZORPAY_KEY_SECRET ? 'SET' : 'NOT SET'}`);
    
    if (process.env.RAZORPAY_KEY_ID) {
      console.log(`   Key ID: ${process.env.RAZORPAY_KEY_ID}`);
    }

    // Initialize Razorpay
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });

    console.log('\n2. Razorpay Account Information:');
    try {
      // Get account details
      const account = await razorpay.accounts.fetch();
      console.log(`   Account ID: ${account.id}`);
      console.log(`   Account Name: ${account.name}`);
      console.log(`   Account Type: ${account.type}`);
      console.log(`   Account Status: ${account.status}`);
    } catch (error) {
      console.log(`   ❌ Error fetching account: ${error.message}`);
    }

    console.log('\n3. Testing Different Amounts:');
    
    // Test amounts
    const testAmounts = [
      { amount: 100000, description: '₹1,000' },
      { amount: 500000, description: '₹5,000' },
      { amount: 1000000, description: '₹10,000' },
      { amount: 2000000, description: '₹20,000' },
      { amount: 2600000, description: '₹26,000 (Failing Amount)' },
      { amount: 5000000, description: '₹50,000' }
    ];

    for (const test of testAmounts) {
      try {
        console.log(`\n   Testing ${test.description} (${test.amount} paise):`);
        
        const orderData = {
          amount: test.amount,
          currency: 'INR',
          receipt: `test_${Date.now()}_${test.amount}`,
          payment_capture: 1,
          notes: {
            test: 'true',
            amount: test.description
          }
        };

        const order = await razorpay.orders.create(orderData);
        console.log(`     ✅ Success: Order ID ${order.id}`);
        
        // Clean up test order
        try {
          await razorpay.orders.cancel(order.id);
          console.log(`     🗑️  Test order cancelled`);
        } catch (cancelError) {
          console.log(`     ⚠️  Could not cancel test order: ${cancelError.message}`);
        }
        
      } catch (error) {
        console.log(`     ❌ Failed: ${error.message}`);
        if (error.response && error.response.data) {
          console.log(`     Error Details:`, error.response.data);
        }
      }
    }

    console.log('\n4. Razorpay Documentation Limits:');
    console.log('   📋 Standard Limits (Test Mode):');
    console.log('     - Minimum Amount: ₹1 (100 paise)');
    console.log('     - Maximum Amount: ₹2,00,000 (2,00,00,000 paise)');
    console.log('     - Currency: INR only');
    console.log('     - Payment Methods: Cards, Net Banking, UPI, Wallets');

    console.log('\n5. Possible Issues:');
    console.log('   🔍 Check these potential problems:');
    console.log('     - Account verification status');
    console.log('     - Payment method restrictions');
    console.log('     - Daily/monthly transaction limits');
    console.log('     - KYC completion status');
    console.log('     - Business category restrictions');

    console.log('\n6. Recommendations:');
    console.log('   💡 Try these solutions:');
    console.log('     - Test with smaller amounts first');
    console.log('     - Check Razorpay dashboard for account status');
    console.log('     - Verify KYC documents are complete');
    console.log('     - Contact Razorpay support for limit increase');
    console.log('     - Consider splitting large payments');

  } catch (error) {
    console.error('Error checking Razorpay limits:', error);
  }
}

checkRazorpayLimits();
