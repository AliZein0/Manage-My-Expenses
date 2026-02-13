// Test script for natural language expense processing
const testNaturalLanguageExpenses = () => {
  console.log('🧪 Testing Natural Language Expense Processing\n');

  // Test messages that should trigger natural language expense detection
  const testMessages = [
    'I spent $25 on lunch today',
    'I bought groceries for $45 at the supermarket',
    'I refueled my car with $60 worth of gas',
    'I paid $120 for my electricity bill',
    'I got coffee for $5 and a sandwich for $12',
    'I spent $30 on dinner with friends',
    'I bought movie tickets for $25',
    'I paid $80 for my phone bill',
    'I spent $15 on parking',
    'I bought office supplies for $35'
  ];

  // Simulate the checkForNaturalLanguageExpense function
  function checkForNaturalLanguageExpense(message) {
    const lowerMessage = message.toLowerCase();

    // Patterns that indicate natural language expense creation
    const expensePatterns = [
      /\b(i|we)\s+(spent|bought|paid|purchased|got)\s+.*?\$\s*[\d,]+/i,  // "I spent $25", "I bought $45"
      /\b(refueled?|refuelled?)\s+(the\s+)?car\s+with\s+.*?\$\s*[\d,]+/i,  // "refueled car with $60"
      /\b[\d,]+\s*(dollars?|euros?|usd|eur|£|\$|€)\s+(for|on|at)\s+\w+/i,  // "45 dollars for groceries"
      /\b(cost|costs|was|were)\s+.*?\$\s*[\d,]+/i,  // "cost $1500"
      /\b(added|lunch|dinner|coffee|gas|fuel|grocery|groceries|movie|ticket|bill|parking|supplies)\b.*?\$\s*[\d,]+/i,  // "lunch $25", "gas $60"
      /\b(paid|spent|bought)\s+.*?\$\s*[\d,]+\s+(for|on|at)/i  // "paid $120 for electricity"
    ];

    // Check if message matches any expense pattern
    for (const pattern of expensePatterns) {
      if (pattern.test(lowerMessage)) {
        return true;
      }
    }

    // Additional check: contains spending verbs + currency symbols + numbers + context
    const hasSpendingVerb = /\b(spent|bought|paid|purchased|got|cost|costs|refueled?|refuelled?)\b/i.test(lowerMessage);
    const hasAmount = /\$[\d,]+(\.\d{2})?/i.test(lowerMessage);  // Look for $ followed by numbers
    const hasContext = /\b(car|gas|fuel|food|groceries|coffee|restaurant|lunch|dinner|movie|shopping|bill|electricity|utilities|parking|supplies|supermarket|tickets|phone|office)\b/i.test(lowerMessage);

    if (hasSpendingVerb && hasAmount && hasContext) {
      return true;
    }

    // Even more flexible check: any message with spending verbs and dollar amounts
    const simpleCheck = /\b(spent|bought|paid|purchased|got|cost|costs)\b/i.test(lowerMessage) && /\$[\d,]+/i.test(lowerMessage);
    if (simpleCheck) {
      return true;
    }

    return false;
  }

  // Test each message
  let passed = 0;
  let failed = 0;

  testMessages.forEach((message, index) => {
    const result = checkForNaturalLanguageExpense(message);
    const status = result ? '✅ PASS' : '❌ FAIL';

    console.log(`${index + 1}. ${status}: "${message}"`);
    console.log(`   Detected: ${result}`);

    if (result) {
      passed++;
    } else {
      failed++;
    }
    console.log('');
  });

  console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);

  if (failed === 0) {
    console.log('🎉 All natural language expense patterns detected correctly!');
  } else {
    console.log('⚠️  Some patterns were not detected. May need refinement.');
  }
};

// Test the extractMultipleExpenses function with sample data
const testExpenseExtraction = () => {
  console.log('\n🧪 Testing Expense Extraction from Messages\n');

  // Mock user context (simulating what would come from database)
  const mockUserContext = `
YOUR BOOKS:
- Book Name: Personal Finance, Book ID: book-123, Currency: USD

YOUR CATEGORIES:
- Category Name: Food & Dining, Category ID: cat-food, Book ID: book-123
- Category Name: Transportation, Category ID: cat-transport, Book ID: book-123
- Category Name: Bills & Utilities, Category ID: cat-bills, Book ID: book-123
- Category Name: Entertainment, Category ID: cat-entertainment, Book ID: book-123
- Category Name: Shopping, Category ID: cat-shopping, Book ID: book-123
`;

  // Simulate extractMultipleExpenses function (simplified version)
  function extractMultipleExpenses(message, userContext) {
    const lowerMessage = message.toLowerCase();
    const expenses = [];

    // Find all amount patterns
    const amountPattern = /(?:\$|£|€)\s*\d[\d,]*(?:\.\d{2})?|\d[\d,]*(?:\.\d{2})?\s*(?:dollars?|euros?|usd|eur|£|\$|€)/gi;
    const matches = [...message.matchAll(amountPattern)];

    if (matches.length === 0) return expenses;

    // Process each amount
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const amount = parseFloat(match[0].replace(/[^\d.]/g, ''));

      if (!amount || amount <= 0 || match.index === undefined) continue;

      // Get context for category determination
      const beforeAmount = message.substring(Math.max(0, match.index - 20), match.index).toLowerCase();
      const afterAmount = message.substring(match.index + match[0].length, Math.min(message.length, match.index + match[0].length + 20)).toLowerCase();
      const focusedContext = (beforeAmount + ' ' + afterAmount).trim();

      // Determine category based on keywords
      let category = 'Food & Dining'; // default
      if (/\b(gas|fuel|refuel|petrol|diesel|car|transport|vehicle|parking)\b/.test(focusedContext)) {
        category = 'Transportation';
      } else if (/\b(bill|electricity|utilities|water|internet|phone|rent|insurance)\b/.test(focusedContext)) {
        category = 'Bills & Utilities';
      } else if (/\b(movie|entertainment|ticket|cinema|theater|show|game|concert)\b/.test(focusedContext)) {
        category = 'Entertainment';
      } else if (/\b(shopping|clothes|store|buy|purchase|shop|item|product|gadget|supplies)\b/.test(focusedContext)) {
        category = 'Shopping';
      }

      // Create description from context
      const descStartPos = Math.max(0, match.index - 50);
      const descEndPos = Math.min(message.length, match.index + match[0].length + 50);
      let description = message.substring(descStartPos, descEndPos).trim();
      if (description.length > 100) {
        description = description.substring(0, 97) + '...';
      }

      expenses.push({
        amount,
        category,
        description
      });
    }

    return expenses;
  }

  // Test messages
  const testMessages = [
    'I spent $25 on lunch today',
    'I bought groceries for $45 at the supermarket',
    'I refueled my car with $60 worth of gas',
    'I paid $120 for my electricity bill',
    'I got coffee for $5 and a sandwich for $12',
    'I spent $30 on dinner with friends',
    'I bought movie tickets for $25',
    'I paid $80 for my phone bill'
  ];

  testMessages.forEach((message, index) => {
    console.log(`${index + 1}. Testing: "${message}"`);

    const expenses = extractMultipleExpenses(message, mockUserContext);

    if (expenses.length > 0) {
      expenses.forEach((expense, expIndex) => {
        console.log(`   ✅ Expense ${expIndex + 1}: $${expense.amount} - ${expense.category}`);
        console.log(`      Description: "${expense.description}"`);
      });
    } else {
      console.log('   ❌ No expenses extracted');
    }
    console.log('');
  });
};

// Run both tests
console.log('='.repeat(60));
testNaturalLanguageExpenses();
console.log('='.repeat(60));
testExpenseExtraction();
console.log('='.repeat(60));