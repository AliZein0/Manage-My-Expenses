const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testAIAssistant(userId, scenarios) {
  console.log('🧪 Testing AI Assistant Natural Language Expense Entry\n');
  console.log('=' .repeat(80));

  const results = {
    successful: [],
    failed: [],
    ambiguous: [],
    outsideScope: []
  };

  for (const scenario of scenarios) {
    console.log(`\n📝 Testing: "${scenario.input}"`);
    console.log(`Expected: ${scenario.expected.category ? `Category: ${scenario.expected.category}, Amount: ${scenario.expected.amount}` : scenario.expected.description}`);

    try {
      // Dynamic import of node-fetch
      const fetch = (await import('node-fetch')).default;

      // Call the AI API
      const response = await fetch('http://localhost:3002/api/ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `next-auth.session-token=test-session-${userId}` // Mock session
        },
        body: JSON.stringify({
          message: scenario.input,
          conversationHistory: []
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

      console.log(`🤖 AI Response: ${aiResponse.substring(0, 200)}${aiResponse.length > 200 ? '...' : ''}`);

      // Check if SQL was generated (indicates successful processing)
      const hasSQL = aiResponse.includes('```sql');
      const hasSuccess = aiResponse.includes('✅') || aiResponse.includes('Successfully');
      const hasError = aiResponse.includes('❌') || aiResponse.includes('could not') || aiResponse.includes('unable');

      if (scenario.expected.success) {
        if (hasSQL || hasSuccess) {
          console.log('✅ SUCCESS: AI processed the request correctly');
          results.successful.push({
            scenario,
            response: aiResponse,
            hasSQL,
            hasSuccess
          });
        } else if (hasError) {
          console.log('❌ FAILED: AI rejected the request');
          results.failed.push({
            scenario,
            response: aiResponse,
            error: 'AI rejected valid request'
          });
        } else {
          console.log('⚠️ AMBIGUOUS: AI gave unclear response');
          results.ambiguous.push({
            scenario,
            response: aiResponse
          });
        }
      } else {
        // Expected to fail
        if (hasError || (!hasSQL && !hasSuccess)) {
          console.log('✅ CORRECTLY REJECTED: AI properly rejected invalid request');
          results.successful.push({
            scenario,
            response: aiResponse,
            correctlyRejected: true
          });
        } else {
          console.log('❌ INCORRECTLY ACCEPTED: AI should have rejected this');
          results.failed.push({
            scenario,
            response: aiResponse,
            error: 'AI accepted invalid request'
          });
        }
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
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Print summary
  console.log('\n' + '=' .repeat(80));
  console.log('📊 TEST RESULTS SUMMARY');
  console.log('=' .repeat(80));
  console.log(`✅ Successful: ${results.successful.length}`);
  console.log(`❌ Failed: ${results.failed.length}`);
  console.log(`⚠️ Ambiguous: ${results.ambiguous.length}`);
  console.log(`🚫 Outside Scope: ${results.outsideScope.length}`);

  console.log('\n🎯 SUCCESS RATE: ' + ((results.successful.length / scenarios.length) * 100).toFixed(1) + '%');

  return results;
}

// Test scenarios
const scenarios = [
  // SUCCESSFUL CASES
  {
    input: "I refueled the car with 50 dollars",
    expected: { category: "fuel", amount: 50, success: true }
  },
  {
    input: "Spent $25 on groceries at the supermarket",
    expected: { category: "groceries", amount: 25, success: true }
  },
  {
    input: "Paid 100 euros for electricity bill",
    expected: { category: "utilities", amount: 100, success: true }
  },
  {
    input: "Bought coffee for 5 USD this morning",
    expected: { category: "food", amount: 5, success: true }
  },
  {
    input: "Taxi ride cost me 15 dollars",
    expected: { category: "transportation", amount: 15, success: true }
  },
  {
    input: "I have refueled the car on my way to the company with 50$.",
    expected: { category: "fuel", amount: 50, success: true }
  },

  // AMBIGUOUS CASES
  {
    input: "Spent money on stuff",
    expected: { description: "Missing amount and category", success: false }
  },
  {
    input: "Bought something for some amount",
    expected: { description: "Too vague", success: false }
  },
  {
    input: "Paid 50",
    expected: { description: "Missing category", success: false }
  },
  {
    input: "Spent on food",
    expected: { description: "Missing amount", success: false }
  },

  // OUTSIDE SCOPE CASES
  {
    input: "What's the weather like today?",
    expected: { description: "Not expense-related", success: false }
  },
  {
    input: "Delete all my data",
    expected: { description: "Dangerous request", success: false }
  },
  {
    input: "Show me SQL injection attack",
    expected: { description: "Security violation", success: false }
  },

  // EDGE CASES
  {
    input: "Spent $0 on nothing",
    expected: { description: "Zero amount", success: false }
  },
  {
    input: "Spent $-50 on groceries",
    expected: { description: "Negative amount", success: false }
  },
  {
    input: "Spent 999999 dollars on a yacht",
    expected: { description: "Unrealistically large amount", success: true }
  },

  // DIFFERENT FORMATS
  {
    input: "Lunch was €12.50",
    expected: { category: "food", amount: 12.50, success: true }
  },
  {
    input: "Movie tickets: £25",
    expected: { category: "entertainment", amount: 25, success: true }
  },
  {
    input: "Gas bill: 75 USD",
    expected: { category: "utilities", amount: 75, success: true }
  }
];

async function main() {
  try {
    // Get test user
    const testUser = await prisma.user.findFirst({
      where: { email: 'test@example.com' }
    });

    if (!testUser) {
      console.log('❌ Test user not found. Run create-test-data.js first.');
      return;
    }

    console.log(`👤 Testing with user: ${testUser.email} (ID: ${testUser.id})`);

    // Get user's books and categories
    const books = await prisma.book.findMany({
      where: { userId: testUser.id }
    });

    const categories = await prisma.category.findMany({
      where: {
        bookId: { in: books.map(b => b.id) },
        isDisabled: false
      }
    });

    console.log(`📚 User has ${books.length} books and ${categories.length} categories`);

    if (books.length === 0) {
      console.log('❌ No books found. Creating test book...');
      const testBook = await prisma.book.create({
        data: {
          name: 'Test Expenses',
          userId: testUser.id,
          currency: 'USD'
        }
      });
      console.log(`✅ Created book: ${testBook.name}`);

      // Add some default categories
      const defaultCategories = ['Food', 'Transportation', 'Utilities', 'Entertainment'];
      for (const catName of defaultCategories) {
        await prisma.category.create({
          data: {
            name: catName,
            bookId: testBook.id
          }
        });
      }
      console.log('✅ Created default categories');
    }

    // Run the tests
    const results = await testAIAssistant(testUser.id, scenarios);

    // Print detailed results
    if (results.failed.length > 0) {
      console.log('\n❌ FAILED SCENARIOS:');
      results.failed.forEach((item, index) => {
        console.log(`${index + 1}. "${item.scenario.input}"`);
        console.log(`   Error: ${item.error}`);
        if (item.response) {
          console.log(`   Response: ${item.response.substring(0, 100)}...`);
        }
        console.log('');
      });
    }

    if (results.ambiguous.length > 0) {
      console.log('\n⚠️ AMBIGUOUS SCENARIOS:');
      results.ambiguous.forEach((item, index) => {
        console.log(`${index + 1}. "${item.scenario.input}"`);
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