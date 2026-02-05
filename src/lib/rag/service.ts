import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export interface RAGContext {
  relevantDocs: Array<{ id: string; content: string; metadata: any }>
  userContext: any
  query: string
  validationRules?: {
    currencies: string[]
    paymentMethods: string[]
    requiredFields: Record<string, string[]>
  }
}

export class RAGService {
  // Validation rules that the AI learns through RAG
  private readonly validationRules = {
    currencies: [
      'USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'INR', 'MXN',
      'BRL', 'ZAR', 'RUB', 'KRW', 'SGD', 'HKD', 'NZD', 'SEK', 'NOK', 'DKK',
      'PLN', 'CZK', 'HUF', 'TRY', 'TWD', 'THB', 'IDR', 'MYR', 'PHP', 'VND',
      'ILS', 'AED', 'SAR', 'QAR', 'KWD', 'BHD', 'OMR', 'JOD', 'LBP', 'EGP',
      'NGN', 'CLP', 'COP', 'PEN', 'ARS', 'UYU'
    ],
    paymentMethods: [
      'Cash', 'Credit Card', 'Wire Transfer', 'PayPal', 'Other'
    ],
    requiredFields: {
      books: ['name', 'userId'],
      categories: ['name', 'bookId'],
      expenses: ['amount', 'categoryId']
    }
  }

  async getContext(userId: string, query: string): Promise<RAGContext> {
    try {
      // Get user's active books first
      const activeBooks = await prisma.book.findMany({
        where: { userId, isArchived: false }
      })

      // Also get archived books for restoration context
      const archivedBooks = await prisma.book.findMany({
        where: { userId, isArchived: true }
      })

      // Combine all books for context
      const allBooks = [...activeBooks, ...archivedBooks]
      const activeBookIds = activeBooks.map(book => book.id)

      // Get user's active categories
      const activeCategories = await prisma.category.findMany({
        where: { 
          bookId: { in: activeBookIds },
          isDisabled: false 
        }
      })

      // Also get disabled categories for restoration context
      const disabledCategories = await prisma.category.findMany({
        where: { 
          bookId: { in: activeBookIds },
          isDisabled: true 
        }
      })

      // Combine all categories for context
      const categories = [...activeCategories, ...disabledCategories]
      const categoryIds = activeCategories.map(cat => cat.id)

      // Get user's expense data (active expenses for statistics)
      const activeExpenses = await prisma.expense.findMany({
        where: { 
          categoryId: { in: categoryIds },
          isDisabled: false 
        },
        take: 10,
        orderBy: { date: 'desc' },
        include: { category: true }
      })

      // Also get disabled expenses for restoration context
      const disabledExpenses = await prisma.expense.findMany({
        where: { 
          categoryId: { in: categoryIds },
          isDisabled: true 
        },
        take: 10,
        orderBy: { date: 'desc' },
        include: { category: true }
      })

      // Combine all expenses for context
      const expenses = [...activeExpenses, ...disabledExpenses]

      // Note: Report model doesn't exist in current schema

      // Calculate spending statistics (only from active expenses)
      const totalSpending = activeExpenses.reduce((sum, exp) => sum + exp.amount, 0)
      const avgExpense = activeExpenses.length > 0 ? totalSpending / activeExpenses.length : 0

      // Group by category (only from active expenses)
      const categoryBreakdown = activeExpenses.reduce((acc, exp) => {
        const catName = exp.category?.name || 'Uncategorized'
        acc[catName] = (acc[catName] || 0) + exp.amount
        return acc
      }, {} as Record<string, number>)

      // Add validation rules as RAG documents so AI learns them naturally
      const validationDocs = [
        {
          id: 'validation-currencies',
          content: `VALID CURRENCIES: ${this.validationRules.currencies.join(', ')}. These are the only valid ISO 4217 currency codes you can use when generating SQL queries for books. Do NOT use invalid codes like "LB" or abbreviations.`,
          metadata: { type: 'validation', table: 'books', field: 'currency' }
        },
        {
          id: 'validation-payment-methods',
          content: `VALID PAYMENT METHODS: ${this.validationRules.paymentMethods.join(', ')}. These are the only valid payment methods you can use when generating SQL queries for expenses. Do NOT use abbreviations or variations.`,
          metadata: { type: 'validation', table: 'expenses', field: 'paymentMethod' }
        },
        {
          id: 'validation-required-fields',
          content: `REQUIRED FIELDS: Books need name, userId. Categories need name, bookId. Expenses need amount, categoryId. Always include these when generating INSERT queries.`,
          metadata: { type: 'validation', rule: 'required-fields' }
        },
        {
          id: 'validation-existence-check',
          content: `CRITICAL EXISTENCE VALIDATION FOR SELECT QUERIES ***
IMPORTANT: This is the FIRST and MOST IMPORTANT thing you must do when a user asks for data from a specific book or category.

1. IMMEDIATELY check if the mentioned book exists in YOUR BOOKS section
2. IMMEDIATELY check if the mentioned category exists in YOUR CATEGORIES section  
3. If the book name does NOT exist in YOUR BOOKS, also check YOUR ARCHIVED BOOKS section for restoration requests
4. If the category name does NOT exist, STOP IMMEDIATELY and respond ONLY with: "I couldn't find a category named '[category name]' in your account. Your available categories are: [extract and list all category names from YOUR CATEGORIES section, separated by commas]. Try asking for expenses from one of these categories instead."
5. For restoration requests, if the book exists in YOUR ARCHIVED BOOKS, generate the restoration UPDATE query
6. ONLY generate SQL SELECT queries if all mentioned books and categories exist in active sections
7. To extract book names: Look for "Book Name: [name]" in both YOUR BOOKS and YOUR ARCHIVED BOOKS sections and list them
8. To extract category names: Look for "Category Name: [name]" in the YOUR CATEGORIES section and list them

CRITICAL WARNING: If you generate SQL queries for non-existent books or categories, the results will be wrong and the user will get incorrect data. Always validate existence first!`,

metadata: { type: 'validation', rule: 'existence-check' }
        },
        {
          id: 'response-format-insert',
          content: `RESPONSE FORMAT FOR INSERT OPERATIONS: When generating SQL INSERT queries, DO NOT generate success messages yourself. Your ONLY job is to generate SQL queries in code blocks. The system will execute your SQL query and generate the success message. For example, after executing your INSERT query, the system will show: "✅ Successfully added: amount: 300.00, date: CURDATE(), description: , categoryId: 43108e76-f1ed-11f0-9c01-20bd1d505f09, paymentMethod: Other, isDisabled: false". NEVER generate success messages like "✅ Successfully added" or "Successfully created" - only generate SQL queries.`,
          metadata: { type: 'response-format', operation: 'insert' }
        },
        {
          id: 'response-format-select',
          content: `RESPONSE FORMAT FOR SELECT OPERATIONS: When users ask to view, show, list, or report on data, generate the appropriate SELECT SQL query. After the system executes your query, you will receive the results and should format them as a natural, user-friendly response. Present the data in readable paragraphs or bullet points, not as raw JSON. For expenses, show amounts with currency symbols, format dates nicely, and include relevant details like categories and descriptions. For reports, summarize totals and provide insights. Always use the user's context to resolve IDs to meaningful names. Make your responses conversational and helpful.`,
          metadata: { type: 'response-format', operation: 'select' }
        },
        {
          id: 'response-format-user-preference',
          content: `USER PREFERRED RESPONSE FORMAT: The user expects responses that show NAMES instead of IDs and use natural language. For INSERT operations, your job is ONLY to generate SQL queries in code blocks - the system will execute them and generate success messages. For SELECT operations, after the system executes your query, you should format the results as natural, readable text. Use currency symbols, format dates properly, and present data in a conversational way. For example: "Here are your recent expenses: 1. January 15 - Groceries: Weekly shopping - $85.50 USD (Credit Card), 2. January 10 - Transportation: Gas - $45.00 USD (Cash)". Always resolve IDs to names using the user context provided.`,
          metadata: { type: 'response-format', userPreference: true }
        },
        {
          id: 'response-format-examples',
          content: `RESPONSE FORMAT EXAMPLES: 
CRITICAL: For INSERT operations, your job is ONLY to generate SQL queries in code blocks. The system will execute them and generate success messages. For SELECT operations, after the system executes your query, you should format the results as natural, readable text.

GOOD EXAMPLES (what you should generate):
- For book creation: \`\`\`sql\nINSERT INTO books (id, name, description, currency, isArchived, userId, createdAt, updatedAt) VALUES (UUID(), 'Test', '', 'USD', false, 'user-id', NOW(), NOW())\n\`\`\`
- For category creation: \`\`\`sql\nINSERT INTO categories (id, name, description, bookId, icon, color, isDisabled, createdAt, updatedAt) VALUES (UUID(), 'C1', '', 'book-id', '', '', false, NOW(), NOW())\n\`\`\`
- For expense creation: \`\`\`sql\nINSERT INTO expenses (id, amount, date, description, categoryId, paymentMethod, isDisabled, createdAt, updatedAt) VALUES (UUID(), 100.00, CURDATE(), '', 'category-id', 'Cash', false, NOW(), NOW())\n\`\`\`
- For SELECT queries: \`\`\`sql\nSELECT * FROM books WHERE userId = 'user-id'\n\`\`\`

AFTER SELECT QUERY EXECUTION - FORMAT RESULTS NATURALLY:
When the system executes your SELECT query and returns results, format them like this:
- For expenses: "Here are your recent expenses: 1. January 15, 2026 - Groceries: Weekly shopping - $85.50 USD (Credit Card), 2. January 10, 2026 - Transportation: Gas - $45.00 USD (Cash). Total: $130.50 USD"
- For books: "Your books: 1. Personal Budget (USD), 2. Business Expenses (EUR)"
- For categories: "Categories in your Personal Budget book: 1. Groceries, 2. Transportation, 3. Utilities"

BAD EXAMPLES (what you should NOT generate):
- ❌ "✅ Successfully added: $300.00 expense to Groceries category in B1 book" (without SQL first)
- ❌ Raw JSON responses like \`\`\`json\n[{"name": "B1", "currency": "LBP"}]\n\`\`\`
- ❌ Any success message without first generating the SQL query in code blocks
- ❌ "Successfully created" or "✅ Successfully added" (never generate these)

SQL QUERY GUIDELINES:
- For expenses: Use JOINs through categories to books for user filtering
- Example: SELECT SUM(amount) FROM expenses e JOIN categories c ON e.categoryId = c.id JOIN books b ON c.bookId = b.id WHERE b.userId = 'user-id'
- For categories: JOIN through books for user filtering
- Example: SELECT * FROM categories c JOIN books b ON c.bookId = b.id WHERE b.userId = 'user-id'
- For books: Direct WHERE clause on userId
- Example: SELECT * FROM books WHERE userId = 'user-id'

CRITICAL: For INSERT operations, YOU must resolve IDs to names using the user context provided. Look at the user's books and categories in the context and replace IDs with their corresponding names. Never show raw database IDs or field names in INSERT responses.
CRITICAL: For SELECT operations, after the system executes your query, format the results as natural, conversational text. Use currency symbols, format dates properly, and present data in an easy-to-read way.`,
          metadata: { type: 'response-format', examples: true }
        },
        {
          id: 'response-format-natural-language',
          content: `NATURAL LANGUAGE REQUIREMENT: For INSERT operations, your job is ONLY to generate SQL queries in code blocks - the system will execute them and generate natural language success messages. For SELECT operations, after the system executes your query, you should format the results as natural, conversational text. Present data in readable paragraphs or bullet points, use proper currency formatting, and make responses helpful and user-friendly. For example, instead of JSON, say "Here are your recent expenses: 1. January 15 - Groceries: Weekly shopping - $85.50 USD, 2. January 10 - Transportation: Gas - $45.00 USD". Focus on generating correct SQL queries, then format the results naturally.`,
          metadata: { type: 'response-format', naturalLanguage: true }
        },
        {
          id: 'ai-response-formatting-responsibility',
          content: `AI RESPONSE FORMATTING RESPONSIBILITY: For INSERT operations, your ONLY job is to generate SQL queries in code blocks. The system will execute your SQL and show the success message with names instead of IDs. For SELECT operations, after the system executes your query, you are responsible for formatting the results as natural, readable text. Use the user context to resolve IDs to meaningful names, format amounts with currency symbols, and present data in a conversational way. For example: "Your books: 1. Personal Budget (USD) - for personal expenses, 2. Business (EUR) - for work-related costs". NEVER generate success messages yourself for INSERT operations, but DO format SELECT results naturally.`,
          metadata: { type: 'response-format', aiResponsibility: true }
        },
        {
          id: 'sql-query-generation-rules',
          content: `SQL QUERY GENERATION RULES: Your ONLY job is to generate SQL queries in code blocks. When generating SELECT queries for user data, you MUST use proper JOINs to filter by userId. The expenses table doesn't have userId directly - you must JOIN through categories to books. Example: SELECT SUM(amount) FROM expenses e JOIN categories c ON e.categoryId = c.id JOIN books b ON c.bookId = b.id WHERE b.userId = 'user-id'. For categories: SELECT COUNT(*) FROM categories c JOIN books b ON c.bookId = b.id WHERE b.userId = 'user-id'. For books: SELECT * FROM books WHERE userId = 'user-id'. The system will auto-fix simple queries, but you should generate correct queries from the start. NEVER generate success messages yourself.

BOOK-SPECIFIC FILTERING IN SELECT QUERIES: When users ask for data from a specific book, you MUST add the book name filter to your SELECT query. Use the book name exactly as mentioned by the user. Examples:
- User says "show expenses in House book": Add "AND b.name = 'House'" to WHERE clause
- User says "list categories from Business book": Add "AND b.name = 'Business'" to WHERE clause  
- User says "get expenses from my Personal book": Add "AND b.name = 'Personal'" to WHERE clause
- Full example: SELECT e.*, c.name as category_name FROM expenses e JOIN categories c ON e.categoryId = c.id JOIN books b ON c.bookId = b.id WHERE b.userId = 'user-id' AND b.name = 'House' ORDER BY e.date DESC`,
          metadata: { type: 'sql-generation', rules: true }
        },
        {
          id: 'duplicate-validation',
          content: `DUPLICATE VALIDATION: When creating a new book or category, the system will automatically check if a duplicate already exists. For books: checks if a book with the same name already exists for the user. For categories: checks if a category with the same name already exists in the same book. If a duplicate is found, the system will refuse to create it and return an error. Your job is ONLY to generate SQL queries - the system will handle all validation including duplicate checking. NEVER generate success messages like "✅ Successfully added" - only generate SQL queries.`,
          metadata: { type: 'validation', rule: 'duplicate' }
        },
        {
          id: 'currency-conversion',
          content: `CURRENCY CONVERSION: When users mention amounts in currencies different from their book's currency, the system will automatically convert the amount to the book's currency using real-time exchange rates. For example, if a user says "add 150 euro for lunch" but their book uses USD, the system will convert 150 EUR to the equivalent USD amount and store the converted amount. The success message will show both the original amount and the conversion details. The system uses reliable exchange rate APIs to ensure accurate conversions.`,
          metadata: { type: 'feature', name: 'currency-conversion' }
        },
        {
          id: 'default-categories-structure',
          content: `DEFAULT CATEGORIES SYSTEM: The application has a set of predefined default categories that users can add to their books. These default categories include: Food & Dining (restaurants, groceries), Transportation (gas, public transport), Shopping (clothing, electronics), Entertainment (movies, games), Bills & Utilities (electricity, internet), Healthcare (medical expenses), Education (books, courses), Travel (flights, hotels), Personal Care (haircuts, cosmetics), Home & Garden (furniture, repairs).

DEFAULT CATEGORY STRUCTURE:
- Default categories have isDefault = true and bookId = null
- When adding a default category to a book, create a NEW category record with the same name, description, and icon, but set bookId to the target book's ID and isDefault = false
- Default categories cannot be modified - they serve as templates
- Each book can have its own copy of default categories

HOW TO ADD DEFAULT CATEGORIES TO BOOKS:
When user says "add Travel category to Company book" or "add the Travel category from default categories":
1. Check if the mentioned book exists in YOUR BOOKS section
2. If book exists, generate SQL to create a new category with the default category's details but linked to the specific book
3. Use the exact name from the default categories list
4. Set isDefault = false and provide the correct bookId

EXAMPLE SQL for adding Bills & Utilities category:
\`\`\`sql
INSERT INTO categories (id, name, description, bookId, icon, color, isDisabled, isDefault, createdAt, updatedAt) 
VALUES (UUID(), 'Bills & Utilities', 'Electricity, water, internet, phone bills', '[book-id-from-your-books-section]', 'Zap', '', false, false, NOW(), NOW())
\`\`\`

CRITICAL: When adding default categories, you MUST create a new category record with isDefault = false and the correct bookId. Do NOT try to update existing default categories. Do NOT set isDefault = true for book-specific categories.`,
          metadata: { type: 'validation', name: 'default-categories' }
        },
        {
          id: 'default-categories-usage',
          content: `DEFAULT CATEGORIES USAGE PATTERNS:
Users can request to add default categories in various ways:
- "add Travel category to Company book"
- "add the Travel category from default categories to my Company book"
- "create Travel category in Company book from defaults"
- "add default Travel category to Company"
- "add to the Company book The Travel category from default categories"

RECOGNITION PATTERNS FOR DEFAULT CATEGORIES:
When you see phrases like:
- "from default categories"
- "default Travel category"
- "add Travel from defaults"
- "Travel category from default categories"
- "add the Travel category"
- "The Travel category from default categories"

TREAT THESE AS DEFAULT CATEGORY REQUESTS. Do NOT treat them as regular category creation.

CATEGORY NAME EXTRACTION:
When extracting the category name from user requests:
- Strip articles like "The", "A", "An" from the beginning
- For "The Travel category" → use "Travel"
- For "add a Food category" → use "Food"
- Always match against the exact default category names: Food & Dining, Transportation, Shopping, Entertainment, Bills & Utilities, Healthcare, Education, Travel, Personal Care, Home & Garden

RESPONSE PATTERN FOR DEFAULT CATEGORY ADDITION:
When user requests to add a default category to a book:
1. IMMEDIATELY check if the mentioned book exists in YOUR BOOKS section
2. If book doesn't exist, respond with: "I couldn't find a book named '[book name]' in your account. Your available books are: [list all book names from YOUR BOOKS section]"
3. If book exists, generate the SQL INSERT query to create the category copy
4. Do NOT check if the category already exists in the book - the system handles duplicate validation
5. Use the exact default category name and details

AVAILABLE DEFAULT CATEGORIES (always use exact names):
- Food & Dining
- Transportation
- Shopping
- Entertainment
- Bills & Utilities
- Healthcare
- Education
- Travel
- Personal Care
- Home & Garden

CRITICAL: For default category addition requests, generate SQL immediately if the book exists. Do NOT ask for confirmation. Do NOT check if category already exists in the book. Just generate the INSERT SQL query.`,
          metadata: { type: 'validation', name: 'default-categories-usage' }
        },
        {
          id: 'add-all-default-categories',
          content: `*** PRIORITY: ADD ALL DEFAULT CATEGORIES ***
When user says ANY of these phrases, this takes precedence over individual category requests:
- "add all default categories"
- "add all defaults"
- "add all default categories to [book]"
- "add all defaults to [book]" 
- "I want to add all defaults category"
- "create all default categories"
- "add every default category"
- "add all the default categories"

IMMEDIATELY generate MULTIPLE SQL INSERT statements for ALL 10 default categories, not just one.

AVAILABLE DEFAULT CATEGORIES (generate INSERT for each):
- Food & Dining (Restaurants, groceries, food delivery) - icon: Utensils
- Transportation (Gas, public transport, rideshare, vehicle maintenance) - icon: Car
- Shopping (Clothing, electronics, general purchases) - icon: ShoppingBag
- Entertainment (Movies, games, concerts, hobbies) - icon: Film
- Bills & Utilities (Electricity, water, internet, phone bills) - icon: Zap
- Healthcare (Medical expenses, insurance, pharmacy) - icon: Stethoscope
- Education (Books, courses, educational materials) - icon: Book
- Travel (Flights, hotels, vacation expenses) - icon: Plane
- Personal Care (Haircuts, cosmetics, personal grooming) - icon: Heart
- Home & Garden (Furniture, repairs, home improvement) - icon: Home

CRITICAL: Generate ONE SQL code block with 10 separate INSERT statements separated by semicolons. Do NOT generate individual category requests for "add all" requests.`,
          metadata: { type: 'validation', name: 'add-all-default-categories' }
        },
        {
          id: 'currency-detection-analysis',
          content: `CURRENCY DETECTION AND CONVERSION INTELLIGENCE:
When users mention amounts with currency symbols or codes, you must detect and handle currency conversion automatically.

CURRENCY SYMBOLS TO DETECT:
- $ = USD (US Dollar)
- € = EUR (Euro)  
- £ = GBP (British Pound)
- ¥ = JPY (Japanese Yen)
- ₹ = INR (Indian Rupee)
- ₽ = RUB (Russian Ruble)
- ₩ = KRW (South Korean Won)
- ₺ = TRY (Turkish Lira)
- ₫ = VND (Vietnamese Dong)
- ₪ = ILS (Israeli Shekel)
- د.إ = AED (UAE Dirham)
- ﷼ = SAR (Saudi Riyal)
- KD = KWD (Kuwaiti Dinar)
- BD = BHD (Bahraini Dinar)
- OMR = OMR (Omani Rial)
- JOD = JOD (Jordanian Dinar)
- LBP = LBP (Lebanese Pound)
- EGP = EGP (Egyptian Pound)
- ₦ = NGN (Nigerian Naira)
- ₱ = PHP (Philippine Peso)
- R$ = BRL (Brazilian Real)
- CHF = CHF (Swiss Franc)
- C$ = CAD (Canadian Dollar)
- A$ = AUD (Australian Dollar)
- NZ$ = NZD (New Zealand Dollar)
- kr = SEK (Swedish Krona)
- Nkr = NOK (Norwegian Krone)
- Dkr = DKK (Danish Krone)
- zł = PLN (Polish Zloty)
- Kč = CZK (Czech Koruna)
- Ft = HUF (Hungarian Forint)
- NT$ = TWD (New Taiwan Dollar)
- ฿ = THB (Thai Baht)
- Rp = IDR (Indonesian Rupiah)
- RM = MYR (Malaysian Ringgit)
- S$ = SGD (Singapore Dollar)
- HK$ = HKD (Hong Kong Dollar)
- CN¥ = CNY (Chinese Yuan)
- MX$ = MXN (Mexican Peso)
- ARS$ = ARS (Argentine Peso)
- CLP$ = CLP (Chilean Peso)
- COP$ = COP (Colombian Peso)
- S/ = PEN (Peruvian Sol)
- UYU$ = UYU (Uruguayan Peso)
- ZAR = ZAR (South African Rand)

VALID CURRENCY CODES: USD, EUR, GBP, JPY, CAD, AUD, CHF, CNY, INR, MXN, BRL, ZAR, RUB, KRW, SGD, HKD, NZD, SEK, NOK, DKK, PLN, CZK, HUF, TRY, TWD, THB, IDR, MYR, PHP, VND, ILS, AED, SAR, QAR, KWD, BHD, OMR, JOD, LBP, EGP, NGN, CLP, COP, PEN, ARS, UYU

CURRENCY CONVERSION BEHAVIOR:
When user mentions an amount in a currency different from their book's currency:
1. Detect the currency from symbols or codes in the message
2. The system will automatically convert the amount to the book's currency
3. Success message will show both original and converted amounts
4. Do NOT mention currency conversion in your SQL generation - the system handles it

EXAMPLE: User says "add 150 euro for lunch" in a USD book:
- System converts 150 EUR to equivalent USD amount
- Stores the converted USD amount in database
- Success message shows: "✅ Successfully added: amount: 165.00 USD (converted from 150.00 EUR), ..."

CRITICAL: You do NOT need to handle currency conversion in SQL. Just generate normal INSERT queries. The system detects currencies and handles conversion automatically.`,
          metadata: { type: 'intelligence', name: 'currency-detection' }
        },
        {
          id: 'book-name-resolution-intelligence',
          content: `BOOK NAME RESOLUTION INTELLIGENCE:
When generating SQL queries that reference books by name, you must resolve book names to their IDs correctly.

BOOK NAME RESOLUTION RULES:
1. When user mentions a book name in queries, you need to use the book ID from YOUR BOOKS section
2. Look for "Book Name: [name], Book ID: [id]" in the YOUR BOOKS section
3. Replace book name references with the actual book ID in your SQL queries
4. For INSERT operations into categories: Use the book ID directly in the bookId field
5. For SELECT operations: Add "AND b.name = 'BookName'" to WHERE clause for filtering

EXAMPLES:
- If user says "add category to House book" and YOUR BOOKS shows "Book Name: House, Book ID: house-123":
  - Use bookId = 'house-123' in your INSERT INTO categories query

- If user says "show expenses from Business book" and YOUR BOOKS shows "Book Name: Business, Book ID: business-456":
  - Add "AND b.name = 'Business'" to your SELECT query WHERE clause

CRITICAL: Always use the exact book IDs from YOUR BOOKS section. Do NOT generate queries that try to resolve book names - use the provided IDs directly.

BOOK FILTERING IN SELECT QUERIES:
When users ask for data from specific books, add book name filters to your SELECT queries:
- "expenses from House book" → Add "AND b.name = 'House'" to WHERE clause
- "categories in Business book" → Add "AND b.name = 'Business'" to WHERE clause
- "reports for Personal book" → Add "AND b.name = 'Personal'" to WHERE clause

EXAMPLE SELECT with book filtering:
SELECT e.*, c.name as category_name FROM expenses e 
JOIN categories c ON e.categoryId = c.id 
JOIN books b ON c.bookId = b.id 
WHERE b.userId = 'user-id' AND b.name = 'House' 
ORDER BY e.date DESC`,
          metadata: { type: 'intelligence', name: 'book-name-resolution' }
        },
        {
          id: 'update-validation-rules',
          content: `UPDATE OPERATIONS VALIDATION: You can generate UPDATE SQL queries to modify existing records. Only non-sensitive fields can be updated. Sensitive fields include: userId, id, createdAt, updatedAt, bookId (for categories), categoryId (for expenses).

EDITABLE FIELDS BY TABLE:
- Books: name, description, currency, isArchived
- Categories: name, description, icon, color, isDisabled
- Expenses: amount, date, description, paymentMethod, isDisabled

UPDATE SECURITY RULES:
1. You MUST include user filtering in UPDATE queries to ensure users can only update their own data
2. For expenses: UPDATE through JOIN with categories and books to filter by userId
3. For categories: UPDATE through JOIN with books to filter by userId  
4. For books: Direct WHERE clause on userId
5. Always include WHERE conditions to target specific records
6. Never allow updates to sensitive fields like userId, bookId, categoryId

UPDATE QUERY EXAMPLES:
- Update book name: UPDATE books SET name = 'New Name', updatedAt = NOW() WHERE id = 'book-id' AND userId = 'user-id'
- Update category: UPDATE categories c JOIN books b ON c.bookId = b.id SET c.name = 'New Name', c.updatedAt = NOW() WHERE c.id = 'category-id' AND b.userId = 'user-id'
- Update expense: UPDATE expenses e JOIN categories c ON e.categoryId = c.id JOIN books b ON c.bookId = b.id SET e.amount = 150.00, e.updatedAt = NOW() WHERE e.id = 'expense-id' AND b.userId = 'user-id'

RESPONSE FORMAT FOR UPDATE: Generate UPDATE SQL queries in code blocks. The system will execute them and show success messages. Do NOT generate success messages yourself.`,
          metadata: { type: 'validation', operation: 'update' }
        },
        {
          id: 'update-response-format',
          content: `RESPONSE FORMAT FOR UPDATE OPERATIONS: When generating SQL UPDATE queries, DO NOT generate success messages yourself. Your ONLY job is to generate SQL queries in code blocks. The system will execute your SQL query and generate the success message. For example, after executing your UPDATE query, the system will show: "✅ Successfully updated: name: New Book Name". NEVER generate success messages like "✅ Successfully updated" - only generate SQL queries.`,
          metadata: { type: 'response-format', operation: 'update' }
        },
        {
          id: 'update-examples',
          content: `UPDATE QUERY EXAMPLES:
GOOD EXAMPLES (what you should generate):
- Update book name: \`\`\`sql\nUPDATE books SET name = 'Personal Finance', updatedAt = NOW() WHERE id = 'book-id' AND userId = 'user-id'\n\`\`\`
- Update category description: \`\`\`sql\nUPDATE categories c JOIN books b ON c.bookId = b.id SET c.description = 'Monthly bills and utilities', c.updatedAt = NOW() WHERE c.id = 'category-id' AND b.userId = 'user-id'\n\`\`\`
- Update expense amount: \`\`\`sql\nUPDATE expenses e JOIN categories c ON e.categoryId = c.id JOIN books b ON c.bookId = b.id SET e.amount = 75.50, e.updatedAt = NOW() WHERE e.id = 'expense-id' AND b.userId = 'user-id'\n\`\`\`
- Archive book: \`\`\`sql\nUPDATE books SET isArchived = true, updatedAt = NOW() WHERE id = 'book-id' AND userId = 'user-id'\n\`\`\`
- Archive ALL books: \`\`\`sql\nUPDATE books SET isArchived = true, updatedAt = NOW() WHERE isArchived = false AND userId = 'user-id'\n\`\`\`
- Disable category: \`\`\`sql\nUPDATE categories c JOIN books b ON c.bookId = b.id SET c.isDisabled = true, c.updatedAt = NOW() WHERE c.id = 'category-id' AND b.userId = 'user-id'\n\`\`\`
- Disable ALL categories: \`\`\`sql\nUPDATE categories c JOIN books b ON c.bookId = b.id SET c.isDisabled = true, c.updatedAt = NOW() WHERE c.isDisabled = false AND b.userId = 'user-id'\n\`\`\`
- Disable ALL expenses: \`\`\`sql\nUPDATE expenses e JOIN categories c ON e.categoryId = c.id JOIN books b ON c.bookId = b.id SET e.isDisabled = true, e.updatedAt = NOW() WHERE e.isDisabled = false AND b.userId = 'user-id'\n\`\`\`

BAD EXAMPLES (what you should NOT generate):
- ❌ "✅ Successfully updated book name to 'Personal Finance'"
- ❌ UPDATE without user filtering
- ❌ UPDATE sensitive fields like userId or bookId
- ❌ Any success message without first generating the SQL query in code blocks`,
          metadata: { type: 'response-format', examples: 'update' }
        },
        {
          id: 'restoration-validation-rules',
          content: `RESTORATION OPERATIONS: You can restore archived books, disabled categories, and disabled expenses by setting their status flags back to active.

RESTORATION PATTERNS TO RECOGNIZE:
- "restore [item]" - restore an archived/disabled item
- "unarchive [item]" - restore an archived book
- "enable [item]" - restore a disabled category or expense
- "reactivate [item]" - restore any disabled item
- "bring back [item]" - restore any archived/disabled item

RESTORATION RULES BY TABLE:
- Books: Set isArchived = false to restore archived books
- Categories: Set isDisabled = false to restore disabled categories
- Expenses: Set isDisabled = false to restore disabled expenses

RESTORATION SECURITY RULES:
1. You MUST include user filtering in restoration queries to ensure users can only restore their own data
2. For expenses: UPDATE through JOIN with categories and books to filter by userId
3. For categories: UPDATE through JOIN with books to filter by userId
4. For books: Direct WHERE clause on userId
5. Always include WHERE conditions to target specific records
6. Only restore items that belong to the user

RESTORATION QUERY EXAMPLES:
- Restore archived book: UPDATE books SET isArchived = false, updatedAt = NOW() WHERE id = 'book-id' AND userId = 'user-id'
- Restore disabled category: UPDATE categories c JOIN books b ON c.bookId = b.id SET c.isDisabled = false, c.updatedAt = NOW() WHERE c.id = 'category-id' AND b.userId = 'user-id'
- Restore disabled expense: UPDATE expenses e JOIN categories c ON e.categoryId = c.id JOIN books b ON c.bookId = b.id SET e.isDisabled = false, e.updatedAt = NOW() WHERE e.id = 'expense-id' AND b.userId = 'user-id'

RESTORATION WORKFLOW:
1. User requests to restore an item by name OR requests bulk restoration ("restore all", "restore all archived books", etc.)
2. For specific item restoration: Check if the item exists in archived/disabled state
3. For bulk restoration: Check if there are any archived/disabled items of that type
4. If items exist in archived/disabled state, generate the appropriate UPDATE query to restore them
5. If no items exist in archived/disabled state, inform the user that there are no items to restore
6. For bulk operations, use WHERE conditions that target all archived/disabled items for that user

RESPONSE FORMAT FOR RESTORATION: Generate UPDATE SQL queries in code blocks. The system will execute them and show success messages. Do NOT generate success messages yourself.`,
          metadata: { type: 'validation', operation: 'restoration' }
        },
        {
          id: 'restoration-response-format',
          content: `RESPONSE FORMAT FOR RESTORATION OPERATIONS: When generating SQL UPDATE queries for restoration, DO NOT generate success messages yourself. Your ONLY job is to generate SQL queries in code blocks. The system will execute your SQL query and generate the success message. For example, after executing your restoration UPDATE query, the system will show: "✅ Successfully restored: Book 'Personal Finance' is now active". NEVER generate success messages like "✅ Successfully restored" - only generate SQL queries.`,
          metadata: { type: 'response-format', operation: 'restoration' }
        },
        {
          id: 'restoration-examples',
          content: `RESTORATION QUERY EXAMPLES:
GOOD EXAMPLES (what you should generate):
- Restore archived book: \`\`\`sql\nUPDATE books SET isArchived = false, updatedAt = NOW() WHERE id = 'book-id' AND userId = 'user-id'\n\`\`\`
- Restore disabled category: \`\`\`sql\nUPDATE categories c JOIN books b ON c.bookId = b.id SET c.isDisabled = false, c.updatedAt = NOW() WHERE c.id = 'category-id' AND b.userId = 'user-id'\n\`\`\`
- Restore disabled expense: \`\`\`sql\nUPDATE expenses e JOIN categories c ON e.categoryId = c.id JOIN books b ON c.bookId = b.id SET e.isDisabled = false, e.updatedAt = NOW() WHERE e.id = 'expense-id' AND b.userId = 'user-id'\n\`\`\`
- Restore ALL archived books: \`\`\`sql\nUPDATE books SET isArchived = false, updatedAt = NOW() WHERE isArchived = true AND userId = 'user-id'\n\`\`\`
- Restore ALL disabled categories: \`\`\`sql\nUPDATE categories c JOIN books b ON c.bookId = b.id SET c.isDisabled = false, c.updatedAt = NOW() WHERE c.isDisabled = true AND b.userId = 'user-id'\n\`\`\`
- Restore ALL disabled expenses: \`\`\`sql\nUPDATE expenses e JOIN categories c ON e.categoryId = c.id JOIN books b ON c.bookId = b.id SET e.isDisabled = false, e.updatedAt = NOW() WHERE e.isDisabled = true AND b.userId = 'user-id'\n\`\`\`

RESTORATION REQUEST PATTERNS:
Users may request restoration in various ways:
- "restore my House book" → Generate UPDATE to set isArchived = false for the House book
- "unarchive the Business book" → Generate UPDATE to set isArchived = false for the Business book
- "enable the Food category" → Generate UPDATE to set isDisabled = false for the Food category
- "reactivate that deleted expense" → Generate UPDATE to set isDisabled = false for the expense
- "bring back my archived book" → Generate UPDATE to set isArchived = false for the archived book
- "restore all archived books" → Generate UPDATE to set isArchived = false WHERE isArchived = true AND userId = 'user-id'
- "restore all disabled categories" → Generate UPDATE to set isDisabled = false WHERE isDisabled = true AND userId = 'user-id'
- "restore all disabled expenses" → Generate UPDATE to set isDisabled = false WHERE isDisabled = true AND userId = 'user-id'
- "unarchive all my books" → Generate UPDATE to set isArchived = false WHERE isArchived = true AND userId = 'user-id'
- "enable all categories" → Generate UPDATE to set isDisabled = false WHERE isDisabled = true AND userId = 'user-id'
- "reactivate all expenses" → Generate UPDATE to set isDisabled = false WHERE isDisabled = true AND userId = 'user-id'

CRITICAL: For restoration requests, you MUST verify the item exists and is in archived/disabled state before generating the UPDATE query. If the item is not found or is already active, inform the user instead of generating SQL.

BAD EXAMPLES (what you should NOT generate):
- ❌ "✅ Successfully restored the House book"
- ❌ UPDATE without user filtering
- ❌ Restoration queries for items that don't exist
- ❌ Any success message without first generating the SQL query in code blocks`,
          metadata: { type: 'response-format', examples: 'restoration' }
        },
        {
          id: 'restoration-existence-check',
          content: `RESTORATION EXISTENCE VALIDATION: Before generating restoration UPDATE queries, you MUST verify that the item exists and is actually archived or disabled.

RESTORATION VALIDATION STEPS:
1. Check if the mentioned item exists in YOUR BOOKS or YOUR ARCHIVED BOOKS sections
2. For books: Check both active books (YOUR BOOKS) and archived books (YOUR ARCHIVED BOOKS) sections
3. For categories: Check both YOUR CATEGORIES section AND DISABLED CATEGORIES section
4. For expenses: Expenses are identified by their details, not just names
5. If the item doesn't exist at all, respond: "I couldn't find '[item name]' in your account. Please check the name and try again."
6. If the item exists in YOUR BOOKS but is already active, respond: "The '[item name]' is already active and doesn't need restoration."
7. If the item exists in YOUR ARCHIVED BOOKS, generate the restoration UPDATE query for books
8. If the item exists in DISABLED CATEGORIES section, generate the restoration UPDATE query for categories
9. ONLY generate restoration queries for items found in archived/disabled state

RESTORATION CONTEXT CHECKING:
- For books: Look in both YOUR BOOKS and YOUR ARCHIVED BOOKS sections
- For categories: Look in both YOUR CATEGORIES section AND DISABLED CATEGORIES section
- For expenses: Expenses are identified by their details, not just names

CRITICAL: For restoration requests, check both active and disabled/archived sections. Generate restoration SQL for items found in disabled/archived state.`,
          metadata: { type: 'validation', rule: 'restoration-existence' }
        },
      ];

      return {
        relevantDocs: [
          {
            id: 'expenses-summary',
            content: `Recent expenses: ${expenses.length} items, total spending: $${totalSpending.toFixed(2)}, average: $${avgExpense.toFixed(2)}`,
            metadata: { type: 'summary', count: expenses.length }
          },
          {
            id: 'category-breakdown',
            content: `Category breakdown: ${JSON.stringify(categoryBreakdown)}`,
            metadata: { type: 'analysis' }
          },
          {
            id: 'disabled-categories',
            content: `DISABLED CATEGORIES (available for restoration): ${disabledCategories.length > 0 ? disabledCategories.map(cat => `${cat.name} (ID: ${cat.id})`).join(', ') : 'None'}. These categories are currently disabled but can be restored by setting isDisabled = false.`,
            metadata: { type: 'restoration', count: disabledCategories.length }
          },
          {
            id: 'disabled-expenses',
            content: `DISABLED EXPENSES (available for restoration): ${disabledExpenses.length > 0 ? disabledExpenses.map(exp => `${exp.description || 'No description'} - $${exp.amount} (${exp.category?.name || 'Unknown category'}, ID: ${exp.id})`).join(', ') : 'None'}. These expenses are currently disabled but can be restored by setting isDisabled = false.`,
            metadata: { type: 'restoration', count: disabledExpenses.length }
          },
          ...validationDocs  // Include validation rules in RAG context
        ],
        userContext: {
          totalExpenses: expenses.length,
          activeExpenses: activeExpenses.length,
          disabledExpenses: disabledExpenses.length,
          totalSpending,
          avgExpense,
          categories: categories.length,
          activeCategories: activeCategories.length,
          disabledCategories: disabledCategories.length,
          books: activeBooks.length,
          archivedBooks: archivedBooks.length,
          totalBooks: allBooks.length,
          categoryBreakdown
        },
        query,
        validationRules: this.validationRules
      }
    } catch (error) {
      console.error('RAG Context Error:', error)
      return {
        relevantDocs: [],
        userContext: {},
        query
      }
    }
  }

  async getExpenseSuggestions(userId: string): Promise<string[]> {
    try {
      // Get user's books first
      const books = await prisma.book.findMany({
        where: { userId, isArchived: false }
      })

      const bookIds = books.map(book => book.id)

      // Get user's categories
      const categories = await prisma.category.findMany({
        where: { 
          bookId: { in: bookIds },
          isDisabled: false 
        }
      })

      const categoryIds = categories.map(cat => cat.id)

      // Get user's expenses
      const expenses = await prisma.expense.findMany({
        where: { 
          categoryId: { in: categoryIds },
          isDisabled: false 
        },
        take: 20,
        orderBy: { date: 'desc' },
        include: { category: true }
      })

      if (expenses.length === 0) {
        return [
          "Start by adding your first expense to track your spending.",
          "Create categories to organize your expenses better.",
          "Set up a budget to monitor your spending limits."
        ]
      }

      const suggestions: string[] = []

      // Analyze spending patterns
      const totalSpending = expenses.reduce((sum, exp) => sum + exp.amount, 0)
      const avgExpense = totalSpending / expenses.length

      // Check for high spending
      if (avgExpense > 100) {
        suggestions.push(`Your average expense ($${avgExpense.toFixed(2)}) is relatively high. Consider reviewing your spending categories.`)
      }

      // Check for frequent small expenses
      const smallExpenses = expenses.filter(exp => exp.amount < 10).length
      if (smallExpenses > expenses.length * 0.5) {
        suggestions.push(`You have many small expenses. These can add up over time. Consider tracking them more carefully.`)
      }

      // Category analysis
      const categoryMap = new Map<string, number>()
      expenses.forEach(exp => {
        const catName = exp.category?.name || 'Uncategorized'
        categoryMap.set(catName, (categoryMap.get(catName) || 0) + exp.amount)
      })

      const topCategory = Array.from(categoryMap.entries()).sort((a, b) => b[1] - a[1])[0]
      if (topCategory) {
        suggestions.push(`Your highest spending category is "${topCategory[0]}" at $${topCategory[1].toFixed(2)}.`)
      }

      // Budget suggestions
      if (totalSpending > 0) {
        const weeklyAvg = totalSpending / Math.max(expenses.length / 7, 1)
        suggestions.push(`Based on your spending, a weekly budget of around $${weeklyAvg.toFixed(2)} might be appropriate.`)
      }

      return suggestions.length > 0 ? suggestions : [
        "Keep up the good work with your expense tracking!",
        "Consider setting up specific budget goals for different categories.",
        "Regular review of your expenses helps maintain financial awareness."
      ]
    } catch (error) {
      console.error('Suggestion Generation Error:', error)
      return ["Add some expenses to get personalized suggestions."]
    }
  }
}

export const ragService = new RAGService()