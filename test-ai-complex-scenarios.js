// Test script for AI Assistant complex natural language scenarios
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testAILogic() {
  console.log('=== AI ASSISTANT COMPLEX SCENARIO TESTS ===\n');
  
  // Get a test user
  const user = await prisma.user.findFirst();
  if (!user) {
    console.log('❌ No user found in database');
    return;
  }
  
  console.log(`Testing with user: ${user.email}\n`);
  
  // Get user's books and categories
  const books = await prisma.book.findMany({
    where: { userId: user.id, isArchived: false },
    include: {
      categories: {
        where: { isDisabled: false }
      }
    }
  });
  
  console.log('USER CONTEXT:');
  console.log('=============');
  books.forEach(book => {
    console.log(`\n📚 Book: "${book.name}" (ID: ${book.id})`);
    console.log(`   Categories: ${book.categories.map(c => c.name).join(', ') || 'None'}`);
  });
  
  console.log('\n\n=== TEST SCENARIOS ===\n');
  
  const testCases = [
    {
      name: 'Test 1: Multiple expenses to same book',
      input: 'I spent 50$ on groceries and 30$ on gas for the House book',
      expected: 'Should create 2 expenses in House book - check if Food & Dining and Transportation categories exist'
    },
    {
      name: 'Test 2: Expenses to different books',
      input: 'Add 100$ for office supplies to Company book and 25$ for coffee to House book',
      expected: 'Should create expenses in 2 different books - need Office Supplies in Company and Food in House'
    },
    {
      name: 'Test 3: Missing category scenario',
      input: 'office desk for 40$ for the Company book',
      expected: 'Should ASK if user wants to create Office Supplies category in Company book (not auto-create or fallback)'
    },
    {
      name: 'Test 4: Natural language with dates',
      input: 'Yesterday I paid 150$ electricity bill for House',
      expected: 'Should use DATE_SUB(CURDATE(), INTERVAL 1 DAY) and Bills & Utilities category'
    },
    {
      name: 'Test 5: Typo follow-up (the bug we fixed)',
      input: 'add the bill know',
      expected: 'Should NOT create a book called "Bill Know" - should understand as "add the bill now" (pending expense)'
    },
    {
      name: 'Test 6: Multiple expenses with currency',
      input: 'I bought lunch for 15 euros and paid 200$ for car insurance for Company',
      expected: 'Should handle EUR conversion and create 2 expenses'
    },
    {
      name: 'Test 7: Ambiguous book reference',
      input: 'spent 75$ on utilities',
      expected: 'Should ASK which book to use (no book specified)'
    },
    {
      name: 'Test 8: Category that might not exist',
      input: 'Add 500$ for new laptop to Company book under Equipment category',
      expected: 'If Equipment category missing in Company, should ASK to create it'
    },
    {
      name: 'Test 9: Complex multi-expense',
      input: 'On my way to work I refueled for 60$, had lunch with client for 45$, and bought office supplies for 80$ - all for Company book',
      expected: 'Should create 3 expenses in Company - Transportation, Food/Client Entertainment, Office Supplies'
    },
    {
      name: 'Test 10: Mixed book contexts',
      input: 'Personal groceries 120$ and company dinner 200$',
      expected: 'Should detect "Personal" and "company" as book references and route accordingly'
    }
  ];
  
  // Analyze each test case
  for (const test of testCases) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📝 ${test.name}`);
    console.log(`${'='.repeat(60)}`);
    console.log(`\n💬 User Input: "${test.input}"`);
    console.log(`\n✅ Expected Behavior: ${test.expected}`);
    
    // Analyze the input
    const analysis = analyzeInput(test.input, books);
    console.log(`\n🔍 Analysis:`);
    console.log(`   - Books mentioned: ${analysis.booksFound.join(', ') || 'None (should ask)'}`);
    console.log(`   - Categories needed: ${analysis.categoriesNeeded.join(', ')}`);
    console.log(`   - Missing categories: ${analysis.missingCategories.join(', ') || 'None'}`);
    console.log(`   - Amounts detected: ${analysis.amounts.join(', ')}`);
    console.log(`   - Date reference: ${analysis.dateRef || 'Today'}`);
    console.log(`   - Is follow-up phrase: ${analysis.isFollowUp ? 'YES - should check pending context' : 'No'}`);
    
    if (analysis.missingCategories.length > 0) {
      console.log(`\n   ⚠️  SHOULD ASK USER: "The ${analysis.booksFound[0] || '[book]'} book doesn't have '${analysis.missingCategories[0]}' category. Would you like me to create it?"`);
    }
    if (analysis.booksFound.length === 0 && !analysis.isFollowUp) {
      console.log(`\n   ⚠️  SHOULD ASK USER: "Which book would you like to add this expense to?"`);
    }
    if (analysis.isFollowUp) {
      console.log(`\n   ⚠️  WARNING: This looks like a follow-up. Should NOT create new entities from "${test.input}"`);
    }
  }
  
  console.log('\n\n=== TEST COMPLETE ===\n');
  await prisma.$disconnect();
}

function analyzeInput(input, books) {
  const lowerInput = input.toLowerCase();
  
  // Detect books mentioned
  const booksFound = [];
  for (const book of books) {
    if (lowerInput.includes(book.name.toLowerCase())) {
      booksFound.push(book.name);
    }
  }
  // Also check common patterns
  if (lowerInput.includes('company') && !booksFound.some(b => b.toLowerCase().includes('company'))) {
    const companyBook = books.find(b => b.name.toLowerCase().includes('company'));
    if (companyBook) booksFound.push(companyBook.name);
  }
  if ((lowerInput.includes('house') || lowerInput.includes('home') || lowerInput.includes('personal')) && 
      !booksFound.some(b => b.toLowerCase().includes('house') || b.toLowerCase().includes('personal'))) {
    const houseBook = books.find(b => b.name.toLowerCase().includes('house') || b.name.toLowerCase().includes('personal'));
    if (houseBook) booksFound.push(houseBook.name);
  }
  
  // Detect amounts
  const amountMatches = input.match(/\$?\d+(?:\.\d{2})?\s*(?:\$|dollars?|euros?|€|USD|EUR)?/gi) || [];
  const amounts = amountMatches.map(a => a.trim());
  
  // Detect categories needed based on keywords
  const categoriesNeeded = [];
  const categoryKeywords = {
    'Food & Dining': ['groceries', 'lunch', 'dinner', 'coffee', 'food', 'meal', 'restaurant'],
    'Transportation': ['gas', 'fuel', 'refuel', 'car', 'taxi', 'uber'],
    'Bills & Utilities': ['electricity', 'bill', 'utilities', 'water', 'internet'],
    'Office Supplies': ['office', 'supplies', 'desk', 'stationery'],
    'Equipment & Software': ['laptop', 'computer', 'equipment', 'software'],
    'Shopping': ['shopping', 'clothes', 'electronics'],
    'Client Entertainment': ['client', 'business lunch', 'business dinner'],
    'Business Insurance': ['insurance']
  };
  
  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    if (keywords.some(kw => lowerInput.includes(kw))) {
      if (!categoriesNeeded.includes(category)) {
        categoriesNeeded.push(category);
      }
    }
  }
  
  // Find missing categories
  const missingCategories = [];
  for (const catNeeded of categoriesNeeded) {
    let found = false;
    for (const book of books) {
      if (booksFound.includes(book.name) || booksFound.length === 0) {
        if (book.categories.some(c => c.name.toLowerCase() === catNeeded.toLowerCase())) {
          found = true;
          break;
        }
      }
    }
    if (!found && booksFound.length > 0) {
      missingCategories.push(catNeeded);
    }
  }
  
  // Detect date references
  let dateRef = null;
  if (lowerInput.includes('yesterday')) dateRef = 'Yesterday';
  if (lowerInput.includes('last week')) dateRef = 'Last week';
  if (lowerInput.includes('last month')) dateRef = 'Last month';
  
  // Detect follow-up phrases (the bug we fixed)
  const followUpPatterns = [
    'add the bill', 'add it now', 'add it', 'create it', 'proceed', 
    'go ahead', 'yes', 'ok', 'do it', 'add the expense',
    'bill know', 'bill now' // typos
  ];
  const isFollowUp = followUpPatterns.some(pattern => lowerInput.includes(pattern)) && 
                     amounts.length === 0 && // No new amounts
                     input.length < 30; // Short message
  
  return {
    booksFound,
    categoriesNeeded,
    missingCategories,
    amounts,
    dateRef,
    isFollowUp
  };
}

testAILogic().catch(console.error);
