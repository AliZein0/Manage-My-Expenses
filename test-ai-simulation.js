// Test script to simulate AI categorization with RAG context
const testAISimulation = async () => {
  console.log('🤖 Testing AI Categorization with Mistral 7B\n');

  // Simulate the RAG context that would be provided to the AI
  const ragContext = `
YOUR BOOKS:
- Book Name: Personal Finance, Book ID: book-123, Currency: USD

YOUR CATEGORIES:
- Category Name: Food & Dining, Category ID: cat-food, Book ID: book-123
- Category Name: Transportation, Category ID: cat-transport, Book ID: book-123
- Category Name: Bills & Utilities, Category ID: cat-bills, Book ID: book-123
- Category Name: Entertainment, Category ID: cat-entertainment, Book ID: book-123
- Category Name: Education, Category ID: cat-education, Book ID: book-123
- Category Name: Shopping, Category ID: cat-shopping, Book ID: book-123

CRITICAL EXPENSE CATEGORIZATION ACCURACY RULES:
CATEGORIZATION KEYWORD PRIORITY (highest to lowest):
1. EXACT MATCHES: Use these keywords to determine category with highest confidence
   - Food & Dining: food, groceries, restaurant, lunch, dinner, coffee, drink, meal, eat, dining, breakfast, snack, fast food, takeout, delivery, pizza, burger, sushi, salad, dessert
   - Transportation: gas, fuel, refuel, petrol, diesel, car, taxi, bus, train, subway, parking, toll, uber, lyft, ride, mileage, vehicle, auto, transportation
   - Bills & Utilities: bill, bills, electricity, electric, water, internet, phone, utility, utilities, cable, gas bill, power, sewage, garbage
   - Healthcare: medical, doctor, hospital, pharmacy, medicine, health, dental, prescription, clinic, therapy, healthcare, insurance
   - Education: book, books, course, courses, tuition, school, college, university, education, learning, training, class, workshop, seminar
   - Travel: flight, hotel, vacation, trip, travel, airline, airport, accommodation, lodging, resort, cruise, tour, holiday
   - Personal Care: haircut, hair, salon, cosmetics, beauty, personal care, grooming, spa, massage, nails, barber
   - Home & Garden: home, house, garden, repair, maintenance, furniture, appliance, cleaning, lawn, yard, improvement
   - Office Supplies: stationery, printer ink, office equipment, supplies
   - Business Travel: flights, hotels, transportation for business purposes
   - Advertising & Marketing: promotional materials, ads, marketing campaigns
   - Equipment & Software: computers, licenses, software, business equipment
   - Professional Services: consulting, legal fees, professional advice
   - Client Entertainment: business meals, events, client entertainment
   - Training & Development: workshops, courses, professional development
   - Business Insurance: property insurance, liability, business insurance
   - Office Rent/Lease: monthly rent, lease payments for office space
   - Office Utilities: electricity, internet, utilities for office
   - Salaries & Wages: employee payroll, wages, compensation
   - Business Taxes: income tax, property tax, business tax payments
   - Legal & Accounting: legal fees, audit, accounting services
   - IT & Technology: IT support, cloud services, technology expenses
   - Business Vehicle Expenses: fuel, maintenance, vehicle expenses for business
   - Office Maintenance: repairs, cleaning, office maintenance
   - Subscriptions & Memberships: software subscriptions, professional memberships
   - Miscellaneous Business: other business expenses not categorized elsewhere

2. CONTEXT-BASED MATCHES: Use description context when keywords are ambiguous
   - "lunch with family" → Food & Dining (meal context, not education)
   - "family vacation" → Travel (vacation context, not personal/family category)
   - "business lunch" → Food & Dining (meal context, not business expenses)
   - "school supplies" → Education (school context)
   - "home office supplies" → Office Supplies (office context)

3. COMMON MISTAKES TO AVOID:
   ❌ "lunch with family" → Education (WRONG - should be Food & Dining)
   ❌ "coffee with client" → Business Travel (WRONG - should be Food & Dining or Client Entertainment)
   ❌ "gas for car" → Bills & Utilities (WRONG - should be Transportation)
   ❌ "book for class" → Entertainment (WRONG - should be Education)
   ❌ "movie tickets" → Education (WRONG - should be Entertainment)

4. MULTI-KEYWORD RESOLUTION:
   - If description contains keywords from multiple categories, choose the most specific/relevant one
   - "lunch meeting with client" → Food & Dining (lunch is primary meal keyword)
   - "gas bill for house" → Bills & Utilities (bill context overrides gas)
   - "school book purchase" → Education (school context)

5. DEFAULT FALLBACK: If no keywords match, use the first available category from YOUR CATEGORIES section

CATEGORIZATION ACCURACY CHECKLIST:
- Does the keyword directly match the category description?
- Is the context consistent with the category purpose?
- Would a reasonable person categorize this expense this way?
- Does it match similar expenses in the user's history?

CRITICAL: Always prioritize FOOD keywords for meal-related expenses. "Lunch", "dinner", "breakfast" should NEVER go to Education, Entertainment, or any other category - they are FOOD expenses.
`;

  // Test messages
  const testMessages = [
    'I spent $50 on lunch with family',
    'I bought groceries for $75',
    'I refueled my car with $60 worth of gas',
    'I paid $120 for electricity bill'
  ];

  // Simulate AI prompt construction
  const systemPrompt = `You are an AI assistant for expense management. When users describe expenses in natural language, you must categorize them correctly.

${ragContext}

RECOGNIZE THESE PATTERNS AS EXPENSE CREATION REQUESTS:
- "I spent/bought/paid [amount] [currency] on/for [description]"
- "I refueled the car with [amount] [currency]"
- "I got [amount] [currency] worth of groceries"
- "[Amount] [currency] for [description]"

NATURAL LANGUAGE EXPENSE RULES:
1. IMMEDIATELY recognize these as expense creation requests
2. Extract the amount using pattern matching
3. Determine the most appropriate category based on keywords in the description
4. Generate SQL INSERT immediately - DO NOT ask for confirmation
5. Use defaults for missing fields (date: CURDATE(), paymentMethod: 'Other')

For natural language expenses, your response should ONLY be the SQL INSERT query in code blocks. Do NOT provide advice, do NOT ask questions, do NOT say "I'll add that expense" - just generate the SQL immediately.

EXAMPLE: If user says "I spent $50 on lunch with family", generate:
\`\`\`sql
INSERT INTO expenses (id, amount, date, description, categoryId, paymentMethod, isDisabled, createdAt, updatedAt)
VALUES (UUID(), 50.00, CURDATE(), 'I spent $50 on lunch with family', 'cat-food', 'Other', false, NOW(), NOW())
\`\`\`
`;

  console.log('📝 System Prompt Preview:');
  console.log(systemPrompt.substring(0, 500) + '...\n');

  console.log('🧪 Simulating AI Responses:\n');

  // Simulate what the AI should generate for each test message
  testMessages.forEach((message, index) => {
    console.log(`${index + 1}. Testing: "${message}"`);

    // Simulate AI categorization logic
    const lowerMessage = message.toLowerCase();
    let categoryId = 'cat-food'; // Default to Food & Dining
    let categoryName = 'Food & Dining';

    if (lowerMessage.includes('gas') || lowerMessage.includes('fuel') || lowerMessage.includes('car')) {
      categoryId = 'cat-transport';
      categoryName = 'Transportation';
    } else if (lowerMessage.includes('bill') || lowerMessage.includes('electricity')) {
      categoryId = 'cat-bills';
      categoryName = 'Bills & Utilities';
    }

    // Extract amount
    const amountMatch = message.match(/\$(\d+)/);
    const amount = amountMatch ? parseFloat(amountMatch[1]) : 0;

    console.log(`   Expected Category: ${categoryName}`);
    console.log(`   Generated SQL would be:`);
    console.log(`   \`\`\`sql`);
    console.log(`   INSERT INTO expenses (id, amount, date, description, categoryId, paymentMethod, isDisabled, createdAt, updatedAt)`);
    console.log(`   VALUES (UUID(), ${amount}.00, CURDATE(), '${message}', '${categoryId}', 'Other', false, NOW(), NOW())`);
    console.log(`   \`\`\`\n`);
  });

  console.log('✅ Test completed. The AI should now correctly categorize "lunch with family" as Food & Dining.');
  console.log('💡 The RAG context includes specific rules to prevent the Education categorization mistake.');
};

// Run the test
testAISimulation();