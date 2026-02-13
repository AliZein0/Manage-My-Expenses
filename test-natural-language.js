const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testNaturalLanguage(userId, scenarios) {
  console.log('🧪 Testing AI Assistant with Natural Language (Multiple Expenses)\n');
  console.log('=' .repeat(80));

  const results = {
    successful: [],
    failed: [],
    partial: [],
    ambiguous: []
  };

  for (const scenario of scenarios) {
    console.log(`\n📝 Testing: "${scenario.input}"`);
    console.log(`Expected: ${scenario.expected.description}`);

    try {
      const fetch = (await import('node-fetch')).default;

      const response = await fetch('http://localhost:3002/api/ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: scenario.input,
          conversationHistory: [],
          testUserId: userId
        })
      });

      if (!response.ok) {
        console.log(`❌ API Error: ${response.status} ${response.statusText}`);
        results.failed.push({
          scenario,
          error: `API Error: ${response.status}`,
          response: null
        });
        continue;
      }

      const data = await response.json();
      const aiResponse = data.response || '';

      console.log(`🤖 AI Response: ${aiResponse.substring(0, 400)}${aiResponse.length > 400 ? '...' : ''}`);

      // Analyze the response
      const successIndicators = [
        'successfully added',
        'expense added',
        'expenses added',
        '✅ successfully'
      ];

      const hasSuccess = successIndicators.some(indicator =>
        aiResponse.toLowerCase().includes(indicator)
      );

      const errorIndicators = [
        'couldn\'t find',
        'not found',
        'available books',
        'error'
      ];

      const hasError = errorIndicators.some(indicator =>
        aiResponse.toLowerCase().includes(indicator)
      );

      if (hasSuccess) {
        // Count how many expenses were added
        const expenseCount = (aiResponse.match(/expense added/g) || []).length;
        if (expenseCount === scenario.expected.count) {
          results.successful.push({ scenario, response: aiResponse, count: expenseCount });
          console.log(`✅ SUCCESS: ${expenseCount} expenses created`);
        } else {
          results.partial.push({ scenario, response: aiResponse, expected: scenario.expected.count, actual: expenseCount });
          console.log(`⚠️ PARTIAL: Expected ${scenario.expected.count}, got ${expenseCount}`);
        }
      } else if (hasError) {
        results.failed.push({ scenario, error: 'Validation error', response: aiResponse });
        console.log('❌ FAILED: Validation error');
      } else {
        results.ambiguous.push({ scenario, response: aiResponse });
        console.log('⚠️ AMBIGUOUS: Unclear response');
      }

    } catch (error) {
      console.log(`❌ Network Error: ${error.message}`);
      results.failed.push({
        scenario,
        error: error.message,
        response: null
      });
    }

    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 1500));
  }

  // Print summary
  console.log('\n' + '=' .repeat(80));
  console.log('📊 NATURAL LANGUAGE TEST RESULTS SUMMARY');
  console.log('=' .repeat(80));
  console.log(`✅ Successful: ${results.successful.length}`);
  console.log(`❌ Failed: ${results.failed.length}`);
  console.log(`⚠️ Partial: ${results.partial.length}`);
  console.log(`🤔 Ambiguous: ${results.ambiguous.length}`);

  const total = results.successful.length + results.failed.length + results.partial.length + results.ambiguous.length;
  console.log(`\n🎯 SUCCESS RATE: ${((results.successful.length / total) * 100).toFixed(1)}%`);

  return results;
}

// Natural language scenarios with multiple expenses from different books
const scenarios = [
  {
    input: "Today I spent 50 dollars on office supplies for the company, then I bought groceries for 30 dollars at home, and finally I paid 100 dollars for my personal education course.",
    expected: {
      description: "Should create 3 expenses: Company/Office Supplies, House/Food & Dining, Personal/Education",
      count: 3
    }
  },
  {
    input: "This week I refueled my car for 40 dollars on the way to work, paid electricity bill of 80 dollars for the house, and bought some books for 25 dollars for my education.",
    expected: {
      description: "Should create 3 expenses: Company/Transportation, House/Bills & Utilities, Personal/Education",
      count: 3
    }
  },
  {
    input: "I had lunch with colleagues for 45 dollars at the office, then did some shopping for 60 dollars at home, and paid for business travel expenses of 200 dollars.",
    expected: {
      description: "Should create 3 expenses: Company/Food & Dining, House/Shopping, Company/Business Travel",
      count: 3
    }
  },
  {
    input: "Spent 75 dollars on utilities, 120 dollars on food, and 50 dollars on transportation this month.",
    expected: {
      description: "Ambiguous - should ask which books or use defaults",
      count: 3
    }
  },
  {
    input: "For the company: advertising cost 150 dollars and equipment purchase 300 dollars. For personal: bought clothes for 80 dollars and paid medical bill of 120 dollars.",
    expected: {
      description: "Should create 4 expenses: Company/Advertising, Company/Equipment, Personal/Shopping, Personal/Healthcare",
      count: 4
    }
  },
  {
    input: "I went to the supermarket and spent 65 dollars on groceries, then stopped by the office to buy printer ink for 25 dollars, and finally paid my internet bill of 55 dollars at home.",
    expected: {
      description: "Should create 3 expenses: House/Food & Dining, Company/Office Supplies, House/Bills & Utilities",
      count: 3
    }
  },
  {
    input: "Company expenses: 200 dollars for business travel and 150 dollars for advertising. House expenses: 90 dollars for electricity and 40 dollars for groceries.",
    expected: {
      description: "Should create 4 expenses: Company/Business Travel, Company/Advertising, House/Bills & Utilities, House/Food & Dining",
      count: 4
    }
  },
  {
    input: "This morning I bought coffee for 5 dollars, then at work I spent 100 dollars on office maintenance, and in the evening I paid 50 dollars for my personal subscription.",
    expected: {
      description: "Should create 3 expenses: House/Food & Dining, Company/Office Maintenance, Personal/Subscriptions",
      count: 3
    }
  }
];

async function main() {
  try {
    const userId = 'cmkz8m4g10000806t6niikbxx'; // ali@gmail.com user

    console.log(`👤 Testing with user ID: ${userId}`);

    // Get user's books and categories
    const books = await prisma.book.findMany({
      where: { userId: userId, isArchived: false }
    });

    const categories = await prisma.category.findMany({
      where: {
        bookId: { in: books.map(b => b.id) },
        isDisabled: false
      }
    });

    console.log(`📚 User has ${books.length} books and ${categories.length} categories`);
    console.log('Books:', books.map(b => b.name));
    console.log('Sample categories:', categories.slice(0, 8).map(c => `${c.name} (${books.find(b => b.id === c.bookId)?.name})`));

    // Run the tests
    const results = await testNaturalLanguage(userId, scenarios);

    // Print detailed results
    if (results.failed.length > 0) {
      console.log('\n❌ FAILED SCENARIOS:');
      results.failed.forEach((item, index) => {
        console.log(`${index + 1}. "${item.scenario.input.substring(0, 60)}..."`);
        console.log(`   Expected: ${item.scenario.expected.count} expenses`);
        console.log(`   Error: ${item.error}`);
        if (item.response) {
          console.log(`   Response: ${item.response.substring(0, 100)}...`);
        }
        console.log('');
      });
    }

    if (results.partial.length > 0) {
      console.log('\n⚠️ PARTIAL SUCCESS SCENARIOS:');
      results.partial.forEach((item, index) => {
        console.log(`${index + 1}. "${item.scenario.input.substring(0, 60)}..."`);
        console.log(`   Expected: ${item.expected} expenses, Got: ${item.actual}`);
        console.log('');
      });
    }

    if (results.ambiguous.length > 0) {
      console.log('\n🤔 AMBIGUOUS SCENARIOS:');
      results.ambiguous.forEach((item, index) => {
        console.log(`${index + 1}. "${item.scenario.input.substring(0, 60)}..."`);
        console.log(`   Expected: ${item.scenario.expected.count} expenses`);
        console.log(`   Response: ${item.response.substring(0, 100)}...`);
        console.log('');
      });
    }

  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();