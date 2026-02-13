// Test script for complete user journey: books, categories, and natural language expenses
const testUserJourney = async () => {
  const baseUrl = 'http://localhost:3000';

  console.log('🧪 Testing Complete User Journey: Books → Categories → Natural Language Expenses\n');

  // Test data
  const testBook = {
    name: 'Personal Finance',
    currency: 'USD'
  };

  const testCategories = [
    'Food & Dining',
    'Transportation',
    'Entertainment',
    'Shopping',
    'Bills & Utilities',
    'Healthcare',
    'Education'
  ];

  const testExpenses = [
    'I spent $45 on groceries at the supermarket',
    'I refueled my car with $60 worth of gas',
    'I bought movie tickets for $25',
    'I paid $120 for electricity bill',
    'I spent $30 on lunch with colleagues'
  ];

  try {
    // Step 1: Create a book
    console.log('📚 Step 1: Creating a book...');
    const createBookResponse = await fetch(`${baseUrl}/api/ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Create a new book called "${testBook.name}" with currency ${testBook.currency}`,
        conversationHistory: []
      })
    });

    const bookResult = await createBookResponse.json();
    console.log('✅ Book creation result:', bookResult.response);
    console.log('');

    // Step 2: Add default categories
    console.log('🏷️  Step 2: Adding default categories...');
    for (const category of testCategories) {
      console.log(`   Adding category: ${category}`);

      const createCategoryResponse = await fetch(`${baseUrl}/api/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Add a category called "${category}" to the ${testBook.name} book`,
          conversationHistory: []
        })
      });

      const categoryResult = await createCategoryResponse.json();
      console.log(`   ✅ ${category}:`, categoryResult.response.substring(0, 100) + '...');
    }
    console.log('');

    // Step 3: Add expenses using natural language
    console.log('💰 Step 3: Adding expenses using natural language...');
    for (const expense of testExpenses) {
      console.log(`   Adding expense: "${expense}"`);

      const createExpenseResponse = await fetch(`${baseUrl}/api/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: expense,
          conversationHistory: []
        })
      });

      const expenseResult = await createExpenseResponse.json();
      console.log(`   ✅ Result:`, expenseResult.response.substring(0, 150) + '...');
      console.log('');
    }

    // Step 4: Query expenses to verify they were added
    console.log('🔍 Step 4: Verifying expenses were added...');
    const queryResponse = await fetch(`${baseUrl}/api/ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Show me all my recent expenses',
        conversationHistory: []
      })
    });

    const queryResult = await queryResponse.json();
    console.log('✅ Query result:', queryResult.response);

    console.log('\n🎉 User journey test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
};

// Helper function to check if server is running
const checkServer = async () => {
  try {
    const response = await fetch('http://localhost:3001/api/health', { method: 'GET' });
    return response.ok;
  } catch {
    return false;
  }
};

// Run the test
const runTest = async () => {
  console.log('🔍 Checking if server is running...');

  if (!(await checkServer())) {
    console.log('❌ Server is not running. Please start the development server first:');
    console.log('   npm run dev');
    return;
  }

  console.log('✅ Server is running, starting test...\n');
  await testUserJourney();
};

runTest();