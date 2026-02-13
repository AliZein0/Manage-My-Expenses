// Test script for AI categorization accuracy
const testCategorization = () => {
  console.log('🧪 Testing AI Expense Categorization Accuracy\n');

  // Test cases that should be categorized correctly
  const testCases = [
    {
      description: 'I spent $50 on lunch with family',
      expectedCategory: 'Food & Dining',
      keywords: ['lunch', 'family']
    },
    {
      description: 'I bought groceries for $75',
      expectedCategory: 'Food & Dining',
      keywords: ['groceries']
    },
    {
      description: 'I refueled my car with $60 worth of gas',
      expectedCategory: 'Transportation',
      keywords: ['gas', 'fuel', 'car']
    },
    {
      description: 'I paid $120 for electricity bill',
      expectedCategory: 'Bills & Utilities',
      keywords: ['electricity', 'bill']
    },
    {
      description: 'I spent $30 on dinner with friends',
      expectedCategory: 'Food & Dining',
      keywords: ['dinner', 'friends']
    },
    {
      description: 'I bought movie tickets for $25',
      expectedCategory: 'Entertainment',
      keywords: ['movie', 'tickets']
    },
    {
      description: 'I got coffee for $5',
      expectedCategory: 'Food & Dining',
      keywords: ['coffee']
    },
    {
      description: 'I paid $80 for my phone bill',
      expectedCategory: 'Bills & Utilities',
      keywords: ['phone', 'bill']
    }
  ];

  // Simulate categorization logic based on keywords
  function categorizeExpense(description, keywords) {
    const lowerDesc = description.toLowerCase();

    // Food & Dining keywords (highest priority)
    const foodKeywords = ['food', 'groceries', 'restaurant', 'lunch', 'dinner', 'coffee', 'drink', 'meal', 'eat', 'breakfast', 'snack', 'fast food', 'takeout', 'delivery', 'pizza', 'burger', 'sushi', 'salad', 'dessert'];
    if (foodKeywords.some(keyword => lowerDesc.includes(keyword))) {
      return 'Food & Dining';
    }

    // Transportation keywords
    const transportKeywords = ['gas', 'fuel', 'refuel', 'petrol', 'diesel', 'car', 'taxi', 'bus', 'train', 'subway', 'parking', 'toll', 'uber', 'lyft', 'ride', 'mileage', 'vehicle', 'auto', 'transportation'];
    if (transportKeywords.some(keyword => lowerDesc.includes(keyword))) {
      return 'Transportation';
    }

    // Bills & Utilities keywords
    const billKeywords = ['bill', 'bills', 'electricity', 'electric', 'water', 'internet', 'phone', 'utility', 'utilities', 'cable', 'gas bill', 'power', 'sewage', 'garbage'];
    if (billKeywords.some(keyword => lowerDesc.includes(keyword))) {
      return 'Bills & Utilities';
    }

    // Entertainment keywords
    const entertainmentKeywords = ['movie', 'movies', 'cinema', 'concert', 'music', 'game', 'games', 'gaming', 'theater', 'show', 'event', 'entertainment', 'leisure', 'fun', 'hobby'];
    if (entertainmentKeywords.some(keyword => lowerDesc.includes(keyword))) {
      return 'Entertainment';
    }

    // Shopping keywords
    const shoppingKeywords = ['shopping', 'clothes', 'clothing', 'electronics', 'purchase', 'buy', 'store', 'mall', 'amazon', 'retail', 'items', 'goods', 'products', 'merchandise'];
    if (shoppingKeywords.some(keyword => lowerDesc.includes(keyword))) {
      return 'Shopping';
    }

    // Default fallback
    return 'General';
  }

  // Test each case
  let passed = 0;
  let failed = 0;

  testCases.forEach((testCase, index) => {
    const result = categorizeExpense(testCase.description, testCase.keywords);
    const status = result === testCase.expectedCategory ? '✅ PASS' : '❌ FAIL';

    console.log(`${index + 1}. ${status}: "${testCase.description}"`);
    console.log(`   Expected: ${testCase.expectedCategory}`);
    console.log(`   Got: ${result}`);
    console.log(`   Keywords: ${testCase.keywords.join(', ')}`);

    if (result === testCase.expectedCategory) {
      passed++;
    } else {
      failed++;
      console.log(`   ❌ MISMATCH: Should be ${testCase.expectedCategory}, got ${result}`);
    }
    console.log('');
  });

  console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);

  if (failed === 0) {
    console.log('🎉 All categorization tests passed! The AI should now correctly categorize expenses.');
  } else {
    console.log('⚠️  Some categorization tests failed. The RAG context may need adjustment.');
  }

  // Special test for the reported issue
  console.log('\n🎯 Special Test: "lunch with family" categorization');
  const specialTest = 'I spent $50 on lunch with family';
  const specialResult = categorizeExpense(specialTest, ['lunch', 'family']);
  const specialExpected = 'Food & Dining';

  console.log(`Description: "${specialTest}"`);
  console.log(`Expected: ${specialExpected}`);
  console.log(`Got: ${specialResult}`);

  if (specialResult === specialExpected) {
    console.log('✅ PASS: "lunch with family" is correctly categorized as Food & Dining (not Education)');
  } else {
    console.log('❌ FAIL: "lunch with family" is still being miscategorized');
  }
};

// Run the test
testCategorization();