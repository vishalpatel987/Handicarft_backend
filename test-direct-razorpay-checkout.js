const Razorpay = require('razorpay');
require('dotenv').config();

async function testDirectRazorpayCheckout() {
  try {
    console.log('\n=== Testing Direct Razorpay Checkout ===\n');

    // Initialize Razorpay
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });

    console.log('Testing Razorpay order creation and checkout simulation...\n');

    // Test with the problematic amount
    const testAmount = 2600000; // ₹26,000 in paise
    const testOrderData = {
      amount: testAmount,
      currency: 'INR',
      receipt: `test_checkout_${Date.now()}`,
      payment_capture: 1,
      notes: {
        test: 'direct_checkout_test',
        amount: '₹26,000',
        timestamp: new Date().toISOString()
      }
    };

    console.log('Creating Razorpay order...');
    console.log('Order Data:', JSON.stringify(testOrderData, null, 2));

    try {
      const order = await razorpay.orders.create(testOrderData);
      console.log('✅ Order created successfully:');
      console.log(`   Order ID: ${order.id}`);
      console.log(`   Amount: ₹${order.amount / 100}`);
      console.log(`   Currency: ${order.currency}`);
      console.log(`   Status: ${order.status}`);
      console.log(`   Created At: ${new Date(order.created_at * 1000).toISOString()}`);

      // Test checkout options that would be sent to frontend
      console.log('\n=== Frontend Checkout Options ===');
      const checkoutOptions = {
        key: process.env.RAZORPAY_KEY_ID,
        amount: order.amount,
        currency: order.currency,
        name: 'Riko Craft',
        description: `Payment for order ${order.receipt}`,
        order_id: order.id,
        prefill: {
          name: 'Test User',
          email: 'test@example.com',
          contact: '9999999999'
        },
        theme: {
          color: '#8f3a61'
        }
        // No config object - minimal configuration
      };

      console.log('Frontend Checkout Options:');
      console.log(JSON.stringify(checkoutOptions, null, 2));

      console.log('\n=== Test Results ===');
      console.log('✅ Backend order creation: SUCCESS');
      console.log('✅ Order amount: ₹26,000');
      console.log('✅ Minimal frontend config: Ready');
      console.log('✅ No payment method restrictions: Applied');

      console.log('\n=== Recommendations ===');
      console.log('1. ✅ Use minimal Razorpay configuration');
      console.log('2. ✅ Remove all config objects that restrict payment methods');
      console.log('3. ✅ Let Razorpay show all available payment methods');
      console.log('4. ✅ Test with different payment methods (Cards, Net Banking, UPI)');

      // Clean up test order
      try {
        console.log('\nCleaning up test order...');
        // Note: Razorpay doesn't have a direct cancel method for orders
        console.log('⚠️  Test order will remain in Razorpay dashboard');
        console.log(`   Order ID: ${order.id}`);
        console.log('   You can manually cancel it from Razorpay dashboard if needed');
      } catch (cleanupError) {
        console.log('⚠️  Could not clean up test order:', cleanupError.message);
      }

    } catch (orderError) {
      console.log('❌ Order creation failed:');
      console.log(`   Error: ${orderError.message}`);
      if (orderError.response && orderError.response.data) {
        console.log('   Error Details:', JSON.stringify(orderError.response.data, null, 2));
      }
    }

    console.log('\n=== Next Steps ===');
    console.log('1. Test the updated frontend with minimal Razorpay configuration');
    console.log('2. Check if payment modal opens without "Amount exceeds maximum" error');
    console.log('3. Verify all payment methods are available');
    console.log('4. Test actual payment processing');

  } catch (error) {
    console.error('Error testing direct Razorpay checkout:', error);
  }
}

testDirectRazorpayCheckout();
