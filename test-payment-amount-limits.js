const Razorpay = require('razorpay');
require('dotenv').config();

async function testPaymentAmountLimits() {
  try {
    console.log('\n=== Testing Payment Amount Limits ===\n');

    // Initialize Razorpay
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });

    console.log('Testing different payment amounts to identify limits...\n');

    // Test amounts in ascending order
    const testAmounts = [
      { amount: 100000, description: '₹1,000' },
      { amount: 500000, description: '₹5,000' },
      { amount: 1000000, description: '₹10,000' },
      { amount: 1500000, description: '₹15,000' },
      { amount: 2000000, description: '₹20,000' },
      { amount: 2500000, description: '₹25,000' },
      { amount: 2600000, description: '₹26,000 (Problem Amount)' },
      { amount: 3000000, description: '₹30,000' },
      { amount: 5000000, description: '₹50,000' },
      { amount: 10000000, description: '₹1,00,000' }
    ];

    let lastSuccessfulAmount = null;
    let firstFailedAmount = null;

    for (const test of testAmounts) {
      try {
        console.log(`Testing ${test.description} (${test.amount} paise)...`);
        
        const orderData = {
          amount: test.amount,
          currency: 'INR',
          receipt: `test_limit_${Date.now()}_${test.amount}`,
          payment_capture: 1,
          notes: {
            test: 'amount_limit_test',
            amount: test.description,
            timestamp: new Date().toISOString()
          }
        };

        const order = await razorpay.orders.create(orderData);
        console.log(`  ✅ SUCCESS: Order created - ${order.id}`);
        lastSuccessfulAmount = test;
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.log(`  ❌ FAILED: ${error.message}`);
        
        if (!firstFailedAmount) {
          firstFailedAmount = test;
        }
        
        // Log detailed error information
        if (error.response && error.response.data) {
          console.log(`  Error Details:`, JSON.stringify(error.response.data, null, 2));
        }
        
        // If we hit a limit, we can stop testing higher amounts
        if (error.message.includes('Amount exceeds maximum amount allowed') || 
            error.message.includes('amount') && error.message.includes('limit')) {
          console.log(`  🚫 Amount limit reached at ${test.description}`);
          break;
        }
      }
    }

    console.log('\n=== Test Results Summary ===');
    if (lastSuccessfulAmount) {
      console.log(`✅ Last successful amount: ${lastSuccessfulAmount.description} (${lastSuccessfulAmount.amount} paise)`);
    }
    if (firstFailedAmount) {
      console.log(`❌ First failed amount: ${firstFailedAmount.description} (${firstFailedAmount.amount} paise)`);
    }

    console.log('\n=== Recommendations ===');
    if (lastSuccessfulAmount && firstFailedAmount) {
      const limitAmount = lastSuccessfulAmount.amount;
      const limitInRupees = limitAmount / 100;
      console.log(`💡 Recommended maximum amount: ₹${limitInRupees.toLocaleString()}`);
      console.log(`💡 For ₹26,000 orders: ${limitInRupees >= 26000 ? 'Should work' : 'Will fail - amount too high'}`);
    }

    console.log('\n=== Razorpay Account Status Check ===');
    try {
      // Try to get account information
      const account = await razorpay.accounts.fetch();
      console.log(`Account ID: ${account.id}`);
      console.log(`Account Name: ${account.name}`);
      console.log(`Account Type: ${account.type}`);
      console.log(`Account Status: ${account.status}`);
      
      if (account.status !== 'active') {
        console.log('⚠️  Account is not active - this may cause payment issues');
      }
    } catch (accountError) {
      console.log(`❌ Could not fetch account info: ${accountError.message}`);
    }

    console.log('\n=== Next Steps ===');
    console.log('1. If ₹26,000 is above the limit, consider:');
    console.log('   - Splitting the payment into smaller amounts');
    console.log('   - Using COD for high-value orders');
    console.log('   - Contacting Razorpay to increase limits');
    console.log('2. Check Razorpay dashboard for:');
    console.log('   - Account verification status');
    console.log('   - KYC completion');
    console.log('   - Business category restrictions');
    console.log('3. Test with different payment methods:');
    console.log('   - Cards vs UPI vs Net Banking');
    console.log('   - Different banks may have different limits');

  } catch (error) {
    console.error('Error testing payment amount limits:', error);
  }
}

testPaymentAmountLimits();
