const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testAIWithBooks(userId, scenarios) {
  console.log('🧪 Testing AI Assistant with Existing Books and Categories\n');
  console.log('=' .repeat(80));

  const results = {
    successful: [],
    failed: [],
    ambiguous: [],
    outsideScope: []
  };

  for (const scenario of scenarios) {
    console.log(`\n📝 Testing: "${scenario.input}"`);
    console.log(`Expected: ${scenario.expected.description}`);

    try {
      const fetch = (await import('node-fetch')).default;

      const response = await fetch('http://localhost:3002/api/ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `next-auth.session-token=test-session-${userId}`
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

      console.log(`🤖 AI Response: ${aiResponse.substring(0, 200)}${aiResponse.length > 200 ? '...' : ''}`);

      // Check if the response indicates successful expense creation
      if (aiResponse.toLowerCase().includes('expense added') ||
          aiResponse.toLowerCase().includes('expense created') ||
          aiResponse.toLowerCase().includes('added to') ||
          aiResponse.toLowerCase().includes('recorded in')) {
        results.successful.push({ scenario, response: aiResponse });
        console.log('✅ SUCCESS: Expense created');
      } else if (aiResponse.toLowerCase().includes('couldn\'t find') ||
                 aiResponse.toLowerCase().includes('not found') ||
                 aiResponse.toLowerCase().includes('available books')) {
        results.failed.push({ scenario, error: 'Book/Category not found', response: aiResponse });
        console.log('❌ FAILED: Book/Category issue');
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

// Test scenarios for existing books and categories
const scenarios = [
  // Company book scenarios
  {
    input: "Spent 100 on office maintenance for the company",
    expected: { description: "Should add to Company book, Office Maintenance category" }
  },
  {
    input: "Paid 200 for business travel in company expenses",
    expected: { description: "Should add to Company book, Business Travel category" }
  },
  {
    input: "Bought equipment for 500 dollars in the company book",
    expected: { description: "Should add to Company book, Equipment & Software category" }
  },
  {
    input: "Advertising cost 150 for the company",
    expected: { description: "Should add to Company book, Advertising & Marketing category" }
  },

  // House book scenarios
  {
    input: "Paid electricity bill of 80 for the house",
    expected: { description: "Should add to House book, Bills & Utilities category" }
  },
  {
    input: "Bought groceries for 60 in house expenses",
    expected: { description: "Should add to House book, Food & Dining category" }
  },
  {
    input: "Shopping expense of 120 for the house",
    expected: { description: "Should add to House book, Shopping category" }
  },

  // Personal book scenarios
  {
    input: "Spent 50 on food in personal expenses",
    expected: { description: "Should add to Personal book, Food & Dining category" }
  },
  {
    input: "Education cost 300 in personal book",
    expected: { description: "Should add to Personal book, Education category" }
  },
  {
    input: "Travel expense of 400 for personal",
    expected: { description: "Should add to Personal book, Travel category" }
  },
  {
    input: "Bought something for 100 in personal shopping",
    expected: { description: "Should add to Personal book, Shopping category" }
  },

  // Ambiguous book references
  {
    input: "Spent 75 on utilities",
    expected: { description: "Should ask which book or use default" }
  },
  {
    input: "Paid 25 for food",
    expected: { description: "Should ask which book or use default" }
  },

  // Non-existent books
  {
    input: "Spent 50 on maintenance for the office",
    expected: { description: "Should fail - no 'office' book" }
  },
  {
    input: "Bought books for 30 in school expenses",
    expected: { description: "Should fail - no 'school' book" }
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
    console.log('Categories:', categories.map(c => `${c.name} (${books.find(b => b.id === c.bookId)?.name})`));

    // Run the tests
    const results = await testAIWithBooks(userId, scenarios);

    // Print detailed results
    if (results.failed.length > 0) {
      console.log('\n❌ FAILED SCENARIOS:');
      results.failed.forEach((item, index) => {
        console.log(`${index + 1}. "${item.scenario.input}"`);
        console.log(`   Expected: ${item.scenario.expected.description}`);
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
        console.log(`   Expected: ${item.scenario.expected.description}`);
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