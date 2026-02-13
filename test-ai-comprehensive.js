/**
 * Comprehensive AI Assistant Test Suite
 * Run with: node test-ai-comprehensive.js
 * 
 * This script tests all major AI assistant functionality including:
 * - Book creation (single and multiple)
 * - Category creation (single, multiple, default categories)
 * - Expense creation (single, multiple, natural language)
 * - Currency conversion (symbols, codes, word forms)
 * - Clarification requests (missing category, missing book)
 * - Temporal references (this book, new book, etc.)
 * - Typo handling
 * - Error handling
 */

const testCases = [
  // =====================================================
  // SECTION 1: BOOK CREATION
  // =====================================================
  {
    category: "Book Creation",
    tests: [
      {
        name: "Create single book",
        input: "create a new book called Personal",
        expected: {
          shouldGenerateSQL: true,
          sqlPattern: /INSERT INTO books.*VALUES.*'Personal'/i,
          shouldAskClarification: false
        }
      },
      {
        name: "Create book with currency",
        input: "create a book Office with currency EUR",
        expected: {
          shouldGenerateSQL: true,
          sqlPattern: /INSERT INTO books.*'EUR'/i,
          shouldAskClarification: false
        }
      },
      {
        name: "Create multiple books",
        input: "create books Home and Work",
        expected: {
          shouldGenerateSQL: true,
          sqlPattern: /INSERT INTO books.*'Home'.*INSERT INTO books.*'Work'/is,
          shouldAskClarification: false
        }
      }
    ]
  },

  // =====================================================
  // SECTION 2: CATEGORY CREATION
  // =====================================================
  {
    category: "Category Creation",
    tests: [
      {
        name: "Create single category (with book context)",
        input: "add a category called Groceries to House book",
        expected: {
          shouldGenerateSQL: true,
          sqlPattern: /INSERT INTO categories.*'Groceries'/i,
          shouldAskClarification: false,
          shouldNotUsePlaceholder: true
        }
      },
      {
        name: "Create category using 'this book' reference",
        input: "add a category Utilities to this book",
        note: "Should use most recently created/mentioned book",
        expected: {
          shouldGenerateSQL: true,
          sqlPattern: /INSERT INTO categories.*'Utilities'/i,
          shouldAskClarification: false
        }
      },
      {
        name: "Add default categories to book",
        input: "add all default categories to Test book",
        expected: {
          shouldGenerateSQL: true,
          sqlPattern: /INSERT INTO categories.*VALUES/i,
          shouldNotUsePlaceholder: true,
          shouldNotTruncate: true
        }
      }
    ]
  },

  // =====================================================
  // SECTION 3: EXPENSE CREATION - Basic
  // =====================================================
  {
    category: "Expense Creation - Basic",
    tests: [
      {
        name: "Create expense with amount and category",
        input: "add an expense of $50 to Food & Dining in House",
        expected: {
          shouldGenerateSQL: true,
          sqlPattern: /INSERT INTO expenses.*50/i,
          shouldAskClarification: false
        }
      },
      {
        name: "Natural language - I spent",
        input: "I spent $30 on groceries",
        expected: {
          shouldGenerateSQL: true,
          sqlPattern: /INSERT INTO expenses.*30/i,
          shouldAskClarification: false
        }
      },
      {
        name: "Natural language - I bought",
        input: "I bought coffee for $5",
        expected: {
          shouldGenerateSQL: true,
          sqlPattern: /INSERT INTO expenses.*5/i,
          shouldAskClarification: false
        }
      },
      {
        name: "Natural language - I paid",
        input: "I paid $100 for electricity bill",
        expected: {
          shouldGenerateSQL: true,
          sqlPattern: /INSERT INTO expenses.*100/i,
          shouldAskClarification: false
        }
      }
    ]
  },

  // =====================================================
  // SECTION 4: CURRENCY CONVERSION
  // =====================================================
  {
    category: "Currency Conversion",
    tests: [
      {
        name: "Currency symbol before number - €",
        input: "I spent €25 on lunch",
        expected: {
          shouldDetectCurrency: "EUR",
          shouldDetectAmount: 25,
          shouldConvertIfBookDifferent: true
        }
      },
      {
        name: "Currency symbol after number - 50$",
        input: "I paid 50$ for gas",
        expected: {
          shouldDetectCurrency: "USD",
          shouldDetectAmount: 50
        }
      },
      {
        name: "Currency word - euros",
        input: "I bought lunch for 15 euros",
        expected: {
          shouldDetectCurrency: "EUR",
          shouldDetectAmount: 15,
          shouldConvertIfBookDifferent: true
        }
      },
      {
        name: "Currency word - dollars",
        input: "spent 100 dollars on shopping",
        expected: {
          shouldDetectCurrency: "USD",
          shouldDetectAmount: 100
        }
      },
      {
        name: "Currency code - EUR",
        input: "add expense 75 EUR for dinner",
        expected: {
          shouldDetectCurrency: "EUR",
          shouldDetectAmount: 75
        }
      },
      {
        name: "Multiple currencies in one message",
        input: "I bought lunch for 15 euros and paid 200$ for insurance",
        expected: {
          shouldDetectMultipleCurrencies: true,
          currencies: [
            { currency: "EUR", amount: 15 },
            { currency: "USD", amount: 200 }
          ]
        }
      }
    ]
  },

  // =====================================================
  // SECTION 5: CLARIFICATION REQUESTS
  // =====================================================
  {
    category: "Clarification Requests",
    tests: [
      {
        name: "Missing category in specified book",
        input: "add $50 expense for Pets in House book",
        note: "If House book doesn't have Pets category",
        expected: {
          shouldAskClarification: true,
          clarificationPattern: /doesn't have.*category|create.*category/i,
          shouldNotFallbackToOtherBook: true,
          shouldNotAutoCreate: true
        }
      },
      {
        name: "Missing amount",
        input: "I bought groceries",
        expected: {
          shouldAskClarification: true,
          clarificationPattern: /amount|how much/i
        }
      },
      {
        name: "Ambiguous book reference",
        input: "add $20 expense",
        note: "When user has multiple books and doesn't specify which",
        expected: {
          shouldAskClarification: true,
          clarificationPattern: /which book/i
        }
      }
    ]
  },

  // =====================================================
  // SECTION 6: TEMPORAL REFERENCES
  // =====================================================
  {
    category: "Temporal References",
    tests: [
      {
        name: "Reference to 'new book'",
        input: "add category Test to the new book",
        note: "After creating a book, 'new book' should refer to it",
        expected: {
          shouldUseMostRecentBook: true,
          shouldGenerateSQL: true
        }
      },
      {
        name: "Reference to 'this category'",
        input: "add $50 expense to this category",
        note: "After creating a category, 'this category' should refer to it",
        expected: {
          shouldUseMostRecentCategory: true,
          shouldGenerateSQL: true
        }
      },
      {
        name: "Reference to 'it'",
        input: "add default categories to it",
        note: "After creating a book, 'it' should refer to that book",
        expected: {
          shouldUseMostRecentBook: true,
          shouldGenerateSQL: true
        }
      }
    ]
  },

  // =====================================================
  // SECTION 7: TYPO HANDLING
  // =====================================================
  {
    category: "Typo Handling",
    tests: [
      {
        name: "Typo: 'know' instead of 'now'",
        input: "add the bill know",
        note: "After AI asks for category creation, 'add the bill know' should add pending expense",
        expected: {
          shouldNotCreateBook: true,
          shouldUsePendingExpense: true
        }
      },
      {
        name: "Common typos in commands",
        input: "crate a book Test",
        note: "'crate' should be understood as 'create'",
        expected: {
          shouldGenerateSQL: true,
          sqlPattern: /INSERT INTO books/i
        }
      }
    ]
  },

  // =====================================================
  // SECTION 8: ERROR SCENARIOS
  // =====================================================
  {
    category: "Error Scenarios",
    tests: [
      {
        name: "Duplicate book name",
        input: "create a book House",
        note: "When House book already exists",
        expected: {
          shouldReturnError: true,
          errorPattern: /already exists/i
        }
      },
      {
        name: "Invalid category reference",
        input: "add $50 to NonExistentCategory in House",
        expected: {
          shouldAskClarification: true,
          clarificationPattern: /doesn't have|does not exist|create/i
        }
      }
    ]
  },

  // =====================================================
  // SECTION 9: COMPLEX MULTI-EXPENSE SCENARIOS
  // =====================================================
  {
    category: "Complex Scenarios",
    tests: [
      {
        name: "Multiple expenses same book",
        input: "add $20 for lunch and $15 for coffee to House",
        expected: {
          shouldGenerateSQL: true,
          shouldGenerateMultipleInserts: true,
          expectedInsertCount: 2
        }
      },
      {
        name: "Multiple expenses different books",
        input: "add $50 for gas to House and $100 for supplies to Company",
        expected: {
          shouldGenerateSQL: true,
          shouldGenerateMultipleInserts: true,
          expectedInsertCount: 2
        }
      },
      {
        name: "Expense with date",
        input: "add $30 expense for groceries yesterday",
        expected: {
          shouldGenerateSQL: true,
          shouldHandleDate: true
        }
      }
    ]
  },

  // =====================================================
  // SECTION 10: QUERY/REPORT SCENARIOS
  // =====================================================
  {
    category: "Queries and Reports",
    tests: [
      {
        name: "Total expenses query",
        input: "how much did I spend this month?",
        expected: {
          shouldGenerateSelect: true,
          selectPattern: /SELECT.*SUM|total/i
        }
      },
      {
        name: "Category breakdown",
        input: "show me expenses by category",
        expected: {
          shouldGenerateSelect: true,
          selectPattern: /SELECT.*GROUP BY/i
        }
      },
      {
        name: "Recent expenses",
        input: "show my last 5 expenses",
        expected: {
          shouldGenerateSelect: true,
          selectPattern: /SELECT.*LIMIT 5/i
        }
      }
    ]
  }
];

// =====================================================
// CURRENCY EXTRACTION TEST (can run locally)
// =====================================================
function testCurrencyExtraction() {
  console.log("\n" + "=".repeat(60));
  console.log("CURRENCY EXTRACTION TESTS (Local)");
  console.log("=".repeat(60));

  const currencyWordMap = {
    'euro': 'EUR', 'euros': 'EUR',
    'dollar': 'USD', 'dollars': 'USD',
    'pound': 'GBP', 'pounds': 'GBP',
    'yen': 'JPY',
    'yuan': 'CNY',
    'rupee': 'INR', 'rupees': 'INR'
  };

  const currencySymbolMap = {
    '$': 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY', '₹': 'INR'
  };

  function extractAllAmountsAndCurrencies(message) {
    const results = [];
    
    // Pattern 1a: Symbol before number ($50, €25)
    const symbolBeforePattern = /([$€£¥₹])([\d,]+\.?\d*)/g;
    let match;
    while ((match = symbolBeforePattern.exec(message)) !== null) {
      const symbol = match[1];
      const amount = parseFloat(match[2].replace(/,/g, ''));
      const currency = currencySymbolMap[symbol];
      if (!isNaN(amount) && currency) {
        results.push({ amount, currency, originalText: match[0] });
      }
    }

    // Pattern 1b: Number before symbol (50$, 25€)
    const symbolAfterPattern = /([\d,]+\.?\d*)([$€£¥₹])/g;
    while ((match = symbolAfterPattern.exec(message)) !== null) {
      const amount = parseFloat(match[1].replace(/,/g, ''));
      const symbol = match[2];
      const currency = currencySymbolMap[symbol];
      if (!isNaN(amount) && currency && !results.some(r => r.amount === amount && r.currency === currency)) {
        results.push({ amount, currency, originalText: match[0] });
      }
    }

    // Pattern 2: Number + currency code (50 USD, 25 EUR)
    const codeAfterPattern = /(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(USD|EUR|GBP|JPY|INR)/gi;
    while ((match = codeAfterPattern.exec(message)) !== null) {
      const amount = parseFloat(match[1].replace(/,/g, ''));
      const currency = match[2].toUpperCase();
      if (!isNaN(amount) && !results.some(r => r.amount === amount && r.currency === currency)) {
        results.push({ amount, currency, originalText: match[0] });
      }
    }

    // Pattern 3: Number + currency word (15 euros, 50 dollars)
    const wordPattern = /(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(euros?|dollars?|pounds?|yen|yuan|rupees?)/gi;
    while ((match = wordPattern.exec(message)) !== null) {
      const amount = parseFloat(match[1].replace(/,/g, ''));
      const currencyWord = match[2].toLowerCase();
      const currency = currencyWordMap[currencyWord];
      if (!isNaN(amount) && currency && !results.some(r => r.amount === amount && r.currency === currency)) {
        results.push({ amount, currency, originalText: match[0] });
      }
    }

    return results;
  }

  const currencyTests = [
    { input: "I spent €25 on lunch", expected: [{ amount: 25, currency: "EUR" }] },
    { input: "paid 50$ for gas", expected: [{ amount: 50, currency: "USD" }] },
    { input: "$100 for groceries", expected: [{ amount: 100, currency: "USD" }] },
    { input: "15 euros for coffee", expected: [{ amount: 15, currency: "EUR" }] },
    { input: "100 dollars for shopping", expected: [{ amount: 100, currency: "USD" }] },
    { input: "75 EUR for dinner", expected: [{ amount: 75, currency: "EUR" }] },
    { input: "I bought lunch for 15 euros and paid 200$ for insurance", expected: [{ amount: 15, currency: "EUR" }, { amount: 200, currency: "USD" }] },
    { input: "£50 for books and 30 pounds for subscription", expected: [{ amount: 50, currency: "GBP" }, { amount: 30, currency: "GBP" }] },
  ];

  let passed = 0;
  let failed = 0;

  currencyTests.forEach((test, index) => {
    const result = extractAllAmountsAndCurrencies(test.input);
    
    let testPassed = true;
    if (result.length !== test.expected.length) {
      testPassed = false;
    } else {
      for (let i = 0; i < test.expected.length; i++) {
        const found = result.some(r => r.amount === test.expected[i].amount && r.currency === test.expected[i].currency);
        if (!found) {
          testPassed = false;
          break;
        }
      }
    }

    if (testPassed) {
      console.log(`✅ Test ${index + 1}: "${test.input}"`);
      console.log(`   Found: ${JSON.stringify(result.map(r => ({ amount: r.amount, currency: r.currency })))}`);
      passed++;
    } else {
      console.log(`❌ Test ${index + 1}: "${test.input}"`);
      console.log(`   Expected: ${JSON.stringify(test.expected)}`);
      console.log(`   Got: ${JSON.stringify(result.map(r => ({ amount: r.amount, currency: r.currency })))}`);
      failed++;
    }
  });

  console.log(`\nCurrency Tests: ${passed} passed, ${failed} failed`);
  return { passed, failed };
}

// =====================================================
// MAIN OUTPUT
// =====================================================
function printTestPlan() {
  console.log("=".repeat(60));
  console.log("AI ASSISTANT COMPREHENSIVE TEST PLAN");
  console.log("=".repeat(60));
  console.log(`Total Categories: ${testCases.length}`);
  console.log(`Total Test Cases: ${testCases.reduce((sum, cat) => sum + cat.tests.length, 0)}`);
  console.log("");

  testCases.forEach((category, catIndex) => {
    console.log(`\n${"─".repeat(50)}`);
    console.log(`${catIndex + 1}. ${category.category} (${category.tests.length} tests)`);
    console.log("─".repeat(50));

    category.tests.forEach((test, testIndex) => {
      console.log(`\n   ${catIndex + 1}.${testIndex + 1} ${test.name}`);
      console.log(`   Input: "${test.input}"`);
      if (test.note) {
        console.log(`   Note: ${test.note}`);
      }
      console.log(`   Expected:`);
      Object.entries(test.expected).forEach(([key, value]) => {
        if (typeof value === 'object' && value instanceof RegExp) {
          console.log(`     - ${key}: ${value.toString()}`);
        } else if (Array.isArray(value)) {
          console.log(`     - ${key}: ${JSON.stringify(value)}`);
        } else {
          console.log(`     - ${key}: ${value}`);
        }
      });
    });
  });

  console.log("\n" + "=".repeat(60));
  console.log("HOW TO TEST MANUALLY:");
  console.log("=".repeat(60));
  console.log(`
1. Start the dev server: npm run dev
2. Open the AI Assistant page
3. Run each test case by typing the input
4. Verify the response matches expected behavior

CRITICAL THINGS TO CHECK:
- SQL should use ACTUAL Book/Category IDs from context, NOT placeholders
- Currency conversion should show correct converted amounts
- Clarification should be asked when category is missing (not auto-create)
- Multiple expenses should each get correct currency conversion
- Response should not be truncated for bulk operations
`);
}

// Run tests
printTestPlan();
const currencyResults = testCurrencyExtraction();

console.log("\n" + "=".repeat(60));
console.log("SUMMARY");
console.log("=".repeat(60));
console.log(`Currency Extraction: ${currencyResults.passed}/${currencyResults.passed + currencyResults.failed} tests passed`);
console.log(`Manual Tests Required: ${testCases.reduce((sum, cat) => sum + cat.tests.length, 0)} test cases`);
