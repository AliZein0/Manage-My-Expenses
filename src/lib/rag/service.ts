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
          id: 'database-schema-expenses',
          content: `EXPENSES TABLE SCHEMA:
- id: String (Primary Key, CUID format)
- amount: Float (Expense amount, e.g., 123.45)
- date: DateTime (Expense date, format: YYYY-MM-DD)
- description: String (Optional description, can be NULL)
- categoryId: String (Foreign Key to categories.id)
- paymentMethod: String (Cash, Credit Card, Wire Transfer, PayPal, Other)
- isDisabled: Boolean (Soft delete flag, default false)
- createdAt: DateTime (Auto-generated creation timestamp)
- updatedAt: DateTime (Auto-generated update timestamp)`,
          metadata: { type: 'schema', table: 'expenses' }
        },
        {
          id: 'database-schema-categories',
          content: `CATEGORIES TABLE SCHEMA:
- id: String (Primary Key, CUID format)
- name: String (Category name, e.g., "Food & Dining")
- description: String (Optional description, can be NULL)
- icon: String (Icon identifier, e.g., "UtensilsCrossed")
- color: String (Hex color code, e.g., "#FF6B6B")
- isDisabled: Boolean (Soft delete flag, default false)
- isDefault: Boolean (Whether this is a system default category)
- createdAt: DateTime (Auto-generated creation timestamp)
- updatedAt: DateTime (Auto-generated update timestamp)
- bookId: String (Foreign Key to books.id)`,
          metadata: { type: 'schema', table: 'categories' }
        },
        {
          id: 'database-schema-books',
          content: `BOOKS TABLE SCHEMA:
- id: String (Primary Key, CUID format)
- name: String (Book name, e.g., "Personal Budget")
- description: String (Optional description, can be NULL)
- currency: String (ISO 4217 currency code: USD, EUR, GBP, etc.)
- isArchived: Boolean (Archive flag, default false)
- createdAt: DateTime (Auto-generated creation timestamp)
- updatedAt: DateTime (Auto-generated update timestamp)
- userId: String (Foreign Key to users.id)`,
          metadata: { type: 'schema', table: 'books' }
        },
        {
          id: 'database-schema-users',
          content: `USERS TABLE SCHEMA:
- id: String (Primary Key, CUID format)
- name: String (User display name)
- email: String (Email address, unique)
- emailVerified: DateTime (Email verification timestamp, can be NULL)
- image: String (Profile image URL, can be NULL)
- password: String (Hashed password)
- createdAt: DateTime (Auto-generated creation timestamp)
- updatedAt: DateTime (Auto-generated update timestamp)`,
          metadata: { type: 'schema', table: 'users' }
        },
        {
          id: 'sql-naming-conventions',
          content: `SQL NAMING CONVENTIONS - CRITICAL RULES:
- Primary Keys: Always named 'id' (not 'exp_id', 'expense_id', 'cat_id', 'category_id', 'book_id', 'user_id')
- Foreign Keys: Use camelCase (categoryId, bookId, userId) - not snake_case (category_id, book_id, user_id)
- Boolean Fields: Use 'is' prefix (isDisabled, isArchived, isDefault)
- Timestamps: Use camelCase (createdAt, updatedAt)
- Never abbreviate or invent column names
- Never use snake_case for any column names`,
          metadata: { type: 'conventions', category: 'naming' }
        },
        {
          id: 'sql-query-patterns',
          content: `COMMON SQL QUERY PATTERNS:
1. SELECT expenses with category: SELECT e.id, e.amount, e.date, c.name FROM expenses e JOIN categories c ON e.categoryId = c.id
2. SELECT with full context: SELECT e.*, c.name as category_name, b.name as book_name FROM expenses e JOIN categories c ON e.categoryId = c.id JOIN books b ON c.bookId = b.id WHERE b.userId = ?
3. JOIN relationships: expenses → categories (e.categoryId = c.id), categories → books (c.bookId = b.id), books → users (b.userId = u.id)
4. Always filter by userId through book relationships for security`,
          metadata: { type: 'patterns', category: 'queries' }
        },
        {
          id: 'ai-column-mistake-prevention',
          content: `AI COLUMN NAME MISTAKE PREVENTION:
- Never assume column names - only use exact schema names
- If you think a column should be named 'exp_id' → use 'id' from expenses table
- If you think a column should be named 'category_id' → use 'categoryId' from expenses table
- If you think a column should be named 'book_id' → use 'bookId' from categories table
- Pattern: Any 'X_id' should be 'XId' or just 'id' depending on context
- Always verify column names against the provided schema before generating queries`,
          metadata: { type: 'prevention', category: 'column-names' }
        },
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
          content: `CRITICAL EXISTENCE VALIDATION FOR SELECT QUERIES ONLY ***
IMPORTANT: This validation ONLY applies when users ask to VIEW, SHOW, LIST, or REPORT on existing data (SELECT operations).

For SELECT operations (viewing data):
1. IMMEDIATELY check if the mentioned book exists in YOUR BOOKS section
2. IMMEDIATELY check if the mentioned category exists in YOUR CATEGORIES section
3. If the book name does NOT exist in YOUR BOOKS, also check YOUR ARCHIVED BOOKS section for restoration requests
4. If the category name does NOT exist, STOP IMMEDIATELY and respond ONLY with: "I couldn't find a category named '[category name]' in your account. Your available categories are: [extract and list all category names from YOUR CATEGORIES section, separated by commas]. Try asking for expenses from one of these categories instead."
5. For restoration requests, if the book exists in YOUR ARCHIVED BOOKS, generate the restoration UPDATE query
6. ONLY generate SQL SELECT queries if all mentioned books and categories exist in active sections



OPERATION DETECTION:
- SELECT operations: "show", "list", "view", "get", "find", "search", "report", "display", "see"
- INSERT operations: "add", "create", "new", "spend", "paid", "bought", "spent", "charge"

CRITICAL WARNING: For SELECT queries, if you generate SQL for non-existent books or categories, the results will be wrong. For INSERT operations involving missing categories, ALWAYS ask for user confirmation before creating.`,
          metadata: { type: 'validation', rule: 'existence-check' }
        },
        {
          id: 'insert-create-missing-entities',
          content: `MISSING CATEGORY HANDLING - ASK FOR CLARIFICATION ***
When users want to ADD expenses but the required category doesn't exist in the specified book, you MUST ASK for clarification. NEVER automatically create categories or fall back to other books.

MISSING CATEGORY RULES:
- If a category doesn't exist in the target book, ALWAYS ASK the user for clarification
- NEVER automatically create categories without explicit user confirmation
- NEVER use a category from a different book, even if it has the same name
- NEVER fall back to another book that happens to have the category

CLARIFICATION RESPONSE FORMAT:
When the required category doesn't exist in the target book, respond with:
"The [book name] book doesn't have a '[category name]' category. Would you like me to:
1. Create a '[category name]' category in the [book name] book and add this expense?
2. Add this expense to a different category in [book name]? Available categories: [list categories in that book]

Please let me know how you'd like to proceed."

AFTER USER CONFIRMS CATEGORY CREATION:
- Only then generate TWO SQL INSERT queries: one for the category in the correct book, one for the expense
- CRITICAL: Always create the category in the SAME book where the expense will be added

CRITICAL: NEVER USE SUBQUERIES IN EXPENSE INSERTION ***
When creating expenses after creating a category:
- DO NOT use subqueries like: (SELECT id FROM categories WHERE name = 'X' AND bookId = 'Y' LIMIT 1)
- MariaDB does not support LIMIT in subqueries
- Instead, use a specific UUID for the category, then reference that UUID directly in the expense

CORRECT APPROACH:
1. Generate category INSERT with a specific UUID (e.g., UUID())
2. In the same response, generate expense INSERT using a direct categoryId reference
3. Both queries should be in the same SQL block so they execute together

SQL GENERATION PATTERN (use actual book IDs from YOUR BOOKS context):
\`\`\`sql
INSERT INTO categories (id, name, description, bookId, icon, color, isDisabled, isDefault, createdAt, updatedAt) 
VALUES (UUID(), '[category-name]', '[category-description]', '[actual-book-id-from-context]', '[icon]', '[color]', false, false, NOW(), NOW());

INSERT INTO expenses (id, amount, date, description, categoryId, paymentMethod, isDisabled, createdAt, updatedAt) 
SELECT UUID(), [amount], CURDATE(), '[description]', id, '[payment-method]', false, NOW(), NOW()
FROM categories WHERE name = '[category-name]' AND bookId = '[actual-book-id-from-context]' ORDER BY createdAt DESC LIMIT 1;
\`\`\`

WRONG APPROACH (DO NOT DO THIS):
❌ (SELECT id FROM categories WHERE name = 'Category' AND bookId = 'book-id' LIMIT 1) in VALUES clause
❌ Using category from different book when specified book doesn't have it


CORRECT BEHAVIOR FOR ANY BOOK:
1. Identify the target book from user's message (look for book name in YOUR BOOKS section)
2. Check if required category exists in that specific book (from YOUR CATEGORIES)
3. If category EXISTS: Add expense using existing category ID
4. If category MISSING: ASK user for clarification - "The [book] book doesn't have a '[category]' category. Would you like me to create it?"
5. ONLY after user confirms, create category then add expense
6. NEVER use categories from other books, even with same name
7. NEVER auto-create categories without user confirmation`,
          metadata: { type: 'validation', rule: 'confirm-missing-entities' }
        },
        {
          id: 'no-select-in-insert-operations',
          content: `NEVER GENERATE SELECT QUERIES FOR INSERT OPERATIONS ***
When users want to ADD, CREATE, or ENTER expenses (INSERT operations):

DO NOT GENERATE SELECT QUERIES:
- Do NOT generate "SELECT * FROM categories WHERE name = 'X'" to check existence
- Do NOT generate "SELECT COUNT(*) FROM categories WHERE..." for validation
- Do NOT generate any SELECT queries for INSERT operations

HOW TO HANDLE MISSING ENTITIES:
- Use the context provided (YOUR BOOKS and YOUR CATEGORIES sections) to determine what exists
- If a category is not mentioned in YOUR CATEGORIES for the specific book, assume it doesn't exist
- ALWAYS ask user for clarification before creating missing categories - NEVER auto-create
- NEVER fall back to another book that has the category - this is the WRONG behavior
- After explicit user confirmation, generate ONLY INSERT queries

SECURITY: The system blocks SELECT queries in INSERT operations for security. Do NOT attempt to generate SELECT queries for validation.

EXAMPLE - CORRECT APPROACH:
User: "add $50 to transportation in company 1"
AI: Checks YOUR CATEGORIES section for Company 1 book
AI: Doesn't see "Transportation" listed
AI: "I couldn't find a category named 'transportation' in the Company 1 book. Would you like me to create it for you?"
User: "yes"
AI: Generates INSERT for category, then INSERT for expense

WRONG - DO NOT DO THIS:
❌ Generate SELECT COUNT(*) FROM categories WHERE name = 'transportation' AND bookId = '...'

CRITICAL: For INSERT operations, rely on provided context only. Never generate SELECT queries.`,
          metadata: { type: 'validation', rule: 'no-select-in-insert' }
        },
        {
          id: 'use-default-categories-for-creation',
          content: `USE DEFAULT CATEGORY DETAILS WHEN CREATING CATEGORIES ***
When creating categories that match default category names, ALWAYS use the default category's details:

DEFAULT CATEGORIES LIST (use exact names and details):
- Food & Dining: description="Restaurants, groceries, takeout, dining expenses", icon="UtensilsCrossed", color="#FF6B6B"
- Transportation: description="Gas, fuel, public transport, vehicle maintenance, parking", icon="Car", color="#4ECDC4"
- Shopping: description="Clothing, electronics, household items, personal purchases", icon="ShoppingBag", color="#45B7D1"
- Entertainment: description="Movies, games, concerts, hobbies, recreational activities", icon="Gamepad2", color="#96CEB4"
- Bills & Utilities: description="Electricity, water, internet, phone bills, utilities", icon="Zap", color="#FFEAA7"
- Healthcare: description="Medical expenses, doctor visits, prescriptions, health insurance", icon="Heart", color="#DDA0DD"
- Education: description="Books, courses, tuition, educational materials, training", icon="GraduationCap", color="#98D8C8"
- Travel: description="Flights, hotels, vacation expenses, travel bookings", icon="Plane", color="#F7DC6F"
- Personal Care: description="Haircuts, cosmetics, toiletries, personal grooming", icon="Sparkles", color="#BB8FCE"
- Home & Garden: description="Furniture, repairs, gardening, home improvement, maintenance", icon="Home", color="#85C1E9"
- Office Supplies: description="Stationery, printer ink, office equipment, supplies", icon="Printer", color="#F8C471"
- Business Travel: description="Flights, hotels, transportation for business purposes", icon="Briefcase", color="#82E0AA"
- Advertising & Marketing: description="Promotional materials, ads, marketing campaigns", icon="Megaphone", color="#F1948A"
- Equipment & Software: description="Computers, licenses, software, business equipment", icon="Monitor", color="#AED6F1"
- Professional Services: description="Consulting, legal fees, professional advice", icon="UserCheck", color="#ABEBC6"
- Client Entertainment: description="Business meals, events, client entertainment", icon="Users", color="#F9E79F"
- Training & Development: description="Workshops, courses, professional development", icon="BookOpen", color="#D7BDE2"
- Business Insurance: description="Property insurance, liability, business insurance", icon="Shield", color="#A9DFBF"
- Office Rent/Lease: description="Monthly rent, lease payments for office space", icon="Building", color="#FAD7A0"
- Office Utilities: description="Electricity, internet, utilities for office", icon="Zap", color="#FFE4E1"
- Salaries & Wages: description="Employee payroll, wages, compensation", icon="DollarSign", color="#D5A6BD"
- Business Taxes: description="Income tax, property tax, business tax payments", icon="Receipt", color="#A3E4D7"
- Legal & Accounting: description="Legal fees, audit, accounting services", icon="Scale", color="#FADBD8"
- IT & Technology: description="IT support, cloud services, technology expenses", icon="Server", color="#D1F2EB"
- Business Vehicle Expenses: description="Fuel, maintenance, vehicle expenses for business", icon="Truck", color="#FDEDEC"
- Office Maintenance: description="Repairs, cleaning, office maintenance", icon="Wrench", color="#E8F8F5"
- Subscriptions & Memberships: description="Software subscriptions, professional memberships", icon="Calendar", color="#FEF9E7"
- Miscellaneous Business: description="Other business expenses not categorized elsewhere", icon="MoreHorizontal", color="#F4ECF7"

CREATION RULE:
When user requests to create a category and the name matches a default category name:
1. Use the EXACT name from the default categories list
2. Copy the description, icon, and color from the default category
3. Set isDefault = false (this is a book-specific copy)
4. Use the correct bookId from YOUR BOOKS section

EXAMPLE: User wants "Transportation" category
Generate:
\`\`\`sql
INSERT INTO categories (id, name, description, bookId, icon, color, isDisabled, isDefault, createdAt, updatedAt) 
VALUES (UUID(), 'Transportation', 'Gas, fuel, public transport, vehicle maintenance, parking', 'ACTUAL_BOOK_ID_HERE', 'Car', '#4ECDC4', false, false, NOW(), NOW())
\`\`\`

ONLY create blank categories if:
- The category name does NOT match any default category name
- User explicitly says "don't use default" or "create custom category"

CRITICAL: Default categories provide better user experience with proper icons and descriptions. Always use them when available.`,
          metadata: { type: 'validation', rule: 'use-default-categories' }
        },
        {
          id: 'use-correct-user-id',
          content: `CRITICAL: ALWAYS USE THE CORRECT USER ID FROM CONTEXT ***
When generating SQL queries, you MUST use the actual userId from the provided context. NEVER use placeholders like 'user-id' or 'user_id'.

HOW TO GET THE CORRECT USER ID:
- Look at YOUR BOOKS section in the context
- Every book shows: "Book Name: [name], Book ID: [uuid], Currency: [currency]"
- The userId is the same for all books belonging to the user
- Use this userId in ALL SQL queries that require userId

BOOK CREATION EXAMPLE:
❌ WRONG: INSERT INTO books (id, name, userId) VALUES (UUID(), 'Work', 'user-id')
✅ CORRECT: INSERT INTO books (id, name, userId) VALUES (UUID(), 'Work', 'actual-user-uuid-from-context')

CATEGORY CREATION EXAMPLE:
❌ WRONG: INSERT INTO categories (id, name, bookId, userId) VALUES (UUID(), 'Test', 'book-id', 'user-id')
✅ CORRECT: Categories don't need userId directly - they link to books which have userId

EXPENSE CREATION EXAMPLE:
❌ WRONG: INSERT INTO expenses (id, amount, categoryId, userId) VALUES (UUID(), 100.00, 'cat-id', 'user-id')
✅ CORRECT: Expenses don't need userId directly - they link to categories which link to books with userId

SECURITY CRITICAL: Using wrong userId causes foreign key constraint failures. Always use the actual userId from YOUR BOOKS context.`,
          metadata: { type: 'validation', rule: 'use-correct-user-id' }
        },
        {
          id: 'book-name-fuzzy-matching',
          content: `BOOK NAME FUZZY MATCHING FOR NATURAL LANGUAGE ***
When users mention book names in natural language, you must use fuzzy matching to find the correct book:

BOOK NAME MATCHING RULES:
- "company book" or "my company book" → matches "Company 1", "Company", "Business", etc.
- "personal book" or "my personal book" → matches "Personal", "My Personal", etc.
- "house book" or "home book" → matches "House", "Home", "Household", etc.
- "test book" → matches "Test", "Testing", etc.

HOW TO MATCH BOOK NAMES:
1. Look at YOUR BOOKS section for exact matches first
2. If no exact match, look for partial matches:
   - "company" in book name → likely "Company 1" or similar
   - "personal" in book name → likely "Personal" 
   - "house" or "home" in book name → likely "House"
   - "business" in book name → likely "Company 1" or "Business"
3. If multiple possible matches, use the most recently used or alphabetically first
4. If still unclear, ask user to clarify: "I found multiple books that might match. Did you mean [Book1] or [Book2]?"

EXAMPLES:
- User says "company book" → Use "Company 1" (assuming it exists)
- User says "personal expenses" → Use "Personal" book
- User says "house stuff" → Use "House" book

CRITICAL: Always use the actual book name from YOUR BOOKS section in SQL queries, not the user's fuzzy description.`,
          metadata: { type: 'validation', rule: 'book-name-matching' }
        },
        {
          id: 'response-format-consolidated',
          content: `RESPONSE FORMAT RULES (COMPREHENSIVE)

=== FOR INSERT/UPDATE/DELETE OPERATIONS ===
Your ONLY job is to generate SQL queries in code blocks. The system will:
1. Execute your SQL query
2. Generate success messages automatically
3. Show user-friendly names instead of IDs

WHAT YOU MUST DO:
✅ Generate SQL in \`\`\`sql code blocks
✅ Use actual IDs from YOUR BOOKS and YOUR CATEGORIES sections
✅ Use actual userId from context

WHAT YOU MUST NOT DO:
❌ Generate success messages like "✅ Successfully added"
❌ Generate success messages like "Successfully created"
❌ Use placeholders like '[book-id]' or 'ACTUAL_BOOK_ID_HERE'
❌ Generate any text after the SQL code block

=== FOR SELECT OPERATIONS ===
After the system executes your SELECT query and returns results:
1. Format results as natural, readable text
2. Use currency symbols and proper date formatting
3. Present data conversationally, not as raw JSON

EXAMPLE GOOD OUTPUT for SELECT:
"Here are your recent expenses:
1. January 15, 2026 - Groceries: Weekly shopping - $85.50 USD (Credit Card)
2. January 10, 2026 - Transportation: Gas - $45.00 USD (Cash)
Total: $130.50 USD"

=== SQL QUERY PATTERNS ===
- Books: SELECT * FROM books WHERE userId = 'user-id'
- Categories: SELECT c.* FROM categories c JOIN books b ON c.bookId = b.id WHERE b.userId = 'user-id'
- Expenses: SELECT e.* FROM expenses e JOIN categories c ON e.categoryId = c.id JOIN books b ON c.bookId = b.id WHERE b.userId = 'user-id'
- With book filter: Add "AND b.name = 'BookName'" to WHERE clause

=== MARIADB COMPATIBILITY ===
- Do NOT use LIMIT in subqueries
- Use IDs directly from context instead of subqueries`,
          metadata: { type: 'response-format', consolidated: true }
        },
        {
          id: 'sql-query-generation-rules',
          content: `SQL QUERY GENERATION RULES: Your ONLY job is to generate SQL queries in code blocks. When generating SELECT queries for user data, you MUST use proper JOINs to filter by userId. The expenses table doesn't have userId directly - you must JOIN through categories to books. Example: SELECT SUM(amount) FROM expenses e JOIN categories c ON e.categoryId = c.id JOIN books b ON c.bookId = b.id WHERE b.userId = 'user-id'. For categories: SELECT COUNT(*) FROM categories c JOIN books b ON c.bookId = b.id WHERE b.userId = 'user-id'. For books: SELECT * FROM books WHERE userId = 'user-id'. The system will auto-fix simple queries, but you should generate correct queries from the start. NEVER generate success messages yourself.

MARIADB COMPATIBILITY: Do NOT use LIMIT in subqueries as this is not supported in older MariaDB versions. Instead of (SELECT id FROM table WHERE condition LIMIT 1), use the IDs directly from the provided context or restructure the query to avoid subqueries with LIMIT. For expense creation, use categoryId values directly from YOUR CATEGORIES section instead of subqueries.

BOOK-SPECIFIC FILTERING IN SELECT QUERIES: When users ask for data from a specific book, you MUST add the book name filter to your SELECT query. Use the book name exactly as mentioned by the user. Examples:
- User says "show expenses in House book": Add "AND b.name = 'House'" to WHERE clause
- User says "list categories from Business book": Add "AND b.name = 'Business'" to WHERE clause  
- User says "get expenses from my Personal book": Add "AND b.name = 'Personal'" to WHERE clause
- Full example: SELECT e.*, c.name as category_name FROM expenses e JOIN categories c ON e.categoryId = c.id JOIN books b ON c.bookId = b.id WHERE b.userId = 'user-id' AND b.name = 'House' ORDER BY e.date DESC`,
          metadata: { type: 'sql-generation', rules: true }
        },
        {
          id: 'date-parsing-natural-language',
          content: `NATURAL LANGUAGE DATE PARSING: When users mention dates in natural language, you MUST convert them to proper SQL date format (YYYY-MM-DD) in your INSERT queries. Do NOT use CURDATE() when the user specifies a date.

DATE PARSING RULES:
- "today" → Use CURDATE() for current date
- "yesterday" → Use DATE_SUB(CURDATE(), INTERVAL 1 DAY)
- "last week" → Use DATE_SUB(CURDATE(), INTERVAL 7 DAY)  
- "last month" → Use DATE_SUB(CURDATE(), INTERVAL 1 MONTH)
- "this week" → Use CURDATE() (current week)
- "this month" → Use CURDATE() (current month)
- "previous month" → Use DATE_SUB(CURDATE(), INTERVAL 1 MONTH)
- Month names: "January", "in January" → DATE_FORMAT(CONCAT(YEAR(CURDATE()), '-01-01'), '%Y-%m-%d') for January, etc.
- Specific days: "Monday", "last Monday" → Calculate the most recent Monday
- Specific dates: "15th", "on the 15th" → DATE_FORMAT(CONCAT(YEAR(CURDATE()), '-', MONTH(CURDATE()), '-15'), '%Y-%m-%d')
- Years: "2023", "in 2023" → DATE_FORMAT('2023-01-01', '%Y-%m-%d')

EXAMPLES:
- User says "spent $50 last month" → Use DATE_SUB(CURDATE(), INTERVAL 1 MONTH) in the date field
- User says "paid bill in January" → Use DATE_FORMAT(CONCAT(YEAR(CURDATE()), '-01-01'), '%Y-%m-%d')
- User says "bought groceries yesterday" → Use DATE_SUB(CURDATE(), INTERVAL 1 DAY)
- User says "trip last week" → Use DATE_SUB(CURDATE(), INTERVAL 7 DAY)

CRITICAL: Always use proper SQL date functions instead of hardcoded dates. The system will execute your SQL with the correct date calculations.`,
          metadata: { type: 'date-parsing', naturalLanguage: true }
        },
        {
          id: 'currency-conversion',
          content: `CURRENCY CONVERSION: When users mention amounts in currencies different from their book's currency, the system will automatically convert the amount to the book's currency using real-time exchange rates. For example, if a user says "add 150 euro for lunch" but their book uses USD, the system will convert 150 EUR to the equivalent USD amount and store the converted amount. The success message will show both the original amount and the conversion details. The system uses reliable exchange rate APIs to ensure accurate conversions.`,
          metadata: { type: 'feature', name: 'currency-conversion' }
        },
        {
          id: 'default-categories-structure',
          content: `DEFAULT CATEGORIES SYSTEM: The application has a set of predefined default categories that users can add to their books. These default categories include: Food & Dining (restaurants, groceries), Transportation (gas, public transport), Shopping (clothing, electronics), Entertainment (movies, games), Bills & Utilities (electricity, internet), Healthcare (medical expenses), Education (books, courses), Travel (flights, hotels), Personal Care (haircuts, cosmetics), Home & Garden (furniture, repairs), Office Supplies (stationery, printer ink), Business Travel (flights, hotels for business), Advertising & Marketing (promotional materials, ads), Equipment & Software (computers, licenses), Professional Services (consulting, legal), Client Entertainment (business meals, events), Training & Development (workshops, courses), Business Insurance (property, liability), Office Rent/Lease (monthly rent), Office Utilities (electricity, internet for office), Salaries & Wages (employee payroll), Business Taxes (income, property tax), Legal & Accounting (legal fees, audit), IT & Technology (IT support, cloud), Business Vehicle Expenses (fuel, maintenance), Office Maintenance (repairs, cleaning), Subscriptions & Memberships (software, professional), Miscellaneous Business (other business expenses).

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
VALUES (UUID(), 'Bills & Utilities', 'Electricity, water, internet, phone bills', 'ACTUAL_BOOK_ID_HERE', 'Zap', '', false, false, NOW(), NOW())
\`\`\`

CRITICAL: Replace 'ACTUAL_BOOK_ID_HERE' with the EXACT book ID from YOUR BOOKS section. For example, if the user mentions "Company book" and YOUR BOOKS shows "Book ID: 16b3efd2-0333-11f1-8243-73659eebc0fc", use '16b3efd2-0333-11f1-8243-73659eebc0fc'.

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

HOW TO ADD A SINGLE DEFAULT CATEGORY:
1. Check YOUR CATEGORIES section to see if the category already exists in the target book
2. If it already exists, inform user: "The [book] book already has a [category] category."
3. If it doesn't exist, use the DEFAULT CATEGORIES LIST above to get the correct details
4. Generate INSERT with the exact name, description, icon, and color from the defaults list
5. Set bookId to the target book's ID from YOUR BOOKS section, and isDefault = false

EXAMPLE SQL for adding a single default category (use actual book ID from context):
\`\`\`sql
INSERT INTO categories (id, name, description, bookId, icon, color, isDisabled, isDefault, createdAt, updatedAt)
VALUES (UUID(), 'Travel', 'Flights, hotels, vacation expenses, travel bookings', 'ACTUAL-BOOK-ID-FROM-YOUR-BOOKS', 'Plane', '#F7DC6F', false, false, NOW(), NOW())
\`\`\`

CRITICAL: Use the actual book ID from YOUR BOOKS section. Do NOT use subqueries or placeholders.

CATEGORY NAME EXTRACTION:
When extracting the category name from user requests:
- Strip articles like "The", "A", "An" from the beginning
- For "The Travel category" → use "Travel"
- For "add a Food category" → use "Food"
- Always match against the exact default category names: Food & Dining, Transportation, Shopping, Entertainment, Bills & Utilities, Healthcare, Education, Travel, Personal Care, Home & Garden, Office Supplies, Business Travel, Advertising & Marketing, Equipment & Software, Professional Services, Client Entertainment, Training & Development, Business Insurance, Office Rent/Lease, Office Utilities, Salaries & Wages, Business Taxes, Legal & Accounting, IT & Technology, Business Vehicle Expenses, Office Maintenance, Subscriptions & Memberships, Miscellaneous Business

RESPONSE PATTERN FOR DEFAULT CATEGORY ADDITION:
When user requests to add a default category to a book:
1. IMMEDIATELY check if the mentioned book exists in YOUR BOOKS section
2. If book doesn't exist, respond with: "I couldn't find a book named '[book name]' in your account. Your available books are: [list all book names from YOUR BOOKS section]"
3. If book exists, generate the SQL INSERT query using the subquery approach above
4. The SQL will automatically check for duplicates and only add if it doesn't exist
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
- Office Supplies
- Business Travel
- Advertising & Marketing
- Equipment & Software
- Professional Services
- Client Entertainment
- Training & Development
- Business Insurance
- Office Rent/Lease
- Office Utilities
- Salaries & Wages
- Business Taxes
- Legal & Accounting
- IT & Technology
- Business Vehicle Expenses
- Office Maintenance
- Subscriptions & Memberships
- Miscellaneous Business

CRITICAL: For default category addition requests, generate SQL immediately if the book exists. The SQL handles duplicate checking automatically.`,
          metadata: { type: 'validation', name: 'default-categories-usage' }
        },
        {
          id: 'add-all-default-categories',
          content: `*** ADD ALL DEFAULT CATEGORIES ***
When user says ANY of these phrases, generate SQL to add ALL default categories to a book:
- "add all default categories"
- "add all defaults"
- "add all default categories to [book]"
- "add all defaults to [book]" 
- "I want to add all defaults category"
- "create all default categories"
- "add every default category"
- "add all the default categories"

DEFAULT CATEGORIES IDENTIFICATION:
- Default categories are identified by isDefault = true (or isDefault = 1)
- Default categories have bookId = null
- There are exactly 28 default categories in the system

HOW TO ADD ALL DEFAULT CATEGORIES:
1. First, get all default categories: SELECT * FROM categories WHERE isDefault = true
2. For each default category, check if it already exists in the target book: SELECT COUNT(*) FROM categories WHERE name = '[default_name]' AND bookId = '[book_id]' AND isDisabled = false
3. Only add categories that don't already exist in the book
4. When adding, create a copy with: bookId = '[book_id]', isDefault = false, and all other fields same as default

CRITICAL: Generate ONE SQL query that handles the bulk insertion. Do NOT generate individual INSERT statements. Use a subquery or JOIN approach.

EXAMPLE SQL for adding all default categories to a book:
NOTE: For bulk adding all default categories, the system will handle this specially.
The AI should check YOUR CATEGORIES section to see which defaults already exist in the book,
then generate individual INSERT statements for each missing default category.

ALTERNATIVE - Generate individual INSERTs for each missing category:
Check YOUR CATEGORIES for the target book, then for each default category NOT in that book:
\`\`\`sql
INSERT INTO categories (id, name, description, bookId, icon, color, isDisabled, isDefault, createdAt, updatedAt)
VALUES (UUID(), 'Food & Dining', 'Restaurants, groceries, takeout, dining expenses', 'ACTUAL-BOOK-ID', 'UtensilsCrossed', '#FF6B6B', false, false, NOW(), NOW());
-- Repeat for each missing default category
\`\`\`

CRITICAL: You MUST replace 'ACTUAL-BOOK-ID' with the EXACT book ID from the YOUR BOOKS section. Look for the book mentioned in the user query and use its corresponding Book ID. Do NOT use placeholders.

RESPONSE: After generating the SQL, the system will execute it and show how many categories were added.`,
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
          metadata: { type: 'validation', rule: 'restoration-existence' }        },
        {
          id: 'category-book-mismatch-handling',
          content: `CATEGORY-BOOK MISMATCH HANDLING - ASK FOR CLARIFICATION: When processing expenses, you MUST ensure each expense is assigned to the correct book and category. NEVER assign expenses to different books when the category doesn't exist.

CRITICAL RULE - ALWAYS ASK FOR CLARIFICATION WHEN CATEGORY IS MISSING:
- When user specifies a book (e.g., "add to Company book", "office expense"), check if the required category exists in THAT specific book
- If the category does NOT exist in the target book, STOP and ASK for clarification
- NEVER use a category from a different book, even if it has the same name
- NEVER automatically create categories - always ask user first
- NEVER silently fall back to another book - this confuses users

MULTIPLE EXPENSE PROCESSING RULES:
1. When user mentions multiple expenses in one message, identify the context and intended book for each expense
2. If an expense requires a category that doesn't exist in the intended book, STOP and ASK for clarification
3. NEVER auto-create categories without explicit user confirmation
4. NEVER assign the expense to a different book that happens to have that category
5. Only proceed with expense creation after user confirms category creation

BOOK CONTEXT DETECTION (universal algorithm for ANY book):
1. Extract all book names from YOUR BOOKS section
2. Search user's message for ANY mention of these book names (case-insensitive, partial match)
3. If a book name is found in the message → Use that specific book ID from YOUR BOOKS
4. If NO book name is found in the message → STOP and ask: "Which book would you like to add this expense to? Your available books are: [list all book names from YOUR BOOKS]"

BOOK NAME MATCHING RULES:
- Match full book names: "House" matches "House book", "add to House", "House expense"
- Match partial names: If user says "office" and you have "Office Supplies" book, match it
- Case-insensitive: "DORM" matches "Dorm", "dorm" matches "Dorm" 
- Multi-word books: "My Personal" matches "My Personal Expenses" book
- If multiple books could match, ask for clarification listing the matching books

CRITICAL: NEVER assume or default to first book when book context is not specified. Always ask for clarification.
CRITICAL: Do NOT use hardcoded keywords. Only match against actual book names from YOUR BOOKS section.

CATEGORY RESOLUTION ALGORITHM (works for ANY book):
When user wants to add expense to a specific book:
1. Extract target book ID from YOUR BOOKS section (by name match)
2. Check if required category exists in that book's categories (from YOUR CATEGORIES)
3. If category EXISTS in target book: Generate expense INSERT using that category ID
4. If category MISSING in target book: STOP and ASK user for clarification
   - Ask: "The [book name] book doesn't have a '[category]' category. Would you like me to create it?"
   - ONLY after user confirms, generate category INSERT then expense INSERT
5. NEVER search other books for same category name
6. NEVER fall back to another book silently

UNIVERSAL PATTERN (not book-specific):
For ANY book mentioned by user:
- Look up book ID in YOUR BOOKS section by matching book name
- Check if category exists for that specific bookId
- If missing: CREATE category with that bookId
- Add expense using category from that bookId only

CRITICAL: This approach works for all books regardless of name (House, Dorm, Office, Vacation, Investment, Car Expenses, etc.). Always use the actual book ID from context.`,
          metadata: { type: 'validation', rule: 'category-book-mismatch' }
        },
        {
          id: 'expense-creation-vs-viewing-distinction',
          content: `CRITICAL DISTINCTION: EXPENSE CREATION vs EXPENSE VIEWING

WHEN TO CREATE EXPENSES (Generate SQL INSERT):
- User says: "I spent $150 on electricity yesterday" (HAS AMOUNT)
- User says: "I paid $50 for gas" (HAS AMOUNT)
- User says: "I bought groceries for $75" (HAS AMOUNT)
- User says: "I have paid yesterday a electricity bill for 150$" (HAS AMOUNT)
- Any natural language describing spending/paying/buying with amounts
- ACTION: Generate SQL INSERT queries for expenses table

CRITICAL: If no amount is provided, DO NOT create expenses. Ask for clarification instead:
- User says: "I bought coffee" → Ask: "I need the amount for this expense. How much did you spend on coffee?"
- User says: "I refueled the car" → Ask: "I need the amount for this expense. How much did you spend on fuel?"
- NEVER create expenses with made-up, default, or estimated amounts

WHEN TO VIEW/SHOW EXPENSES (Generate SQL SELECT):
- User says: "show me my expenses"
- User says: "list my recent expenses"
- User says: "what are my expenses"
- User says: "display expenses from last month"
- ACTION: Generate SQL SELECT queries, then format results naturally

PROHIBITED RESPONSE: Never respond with formatted expense displays like:
❌ "Feb 9, 2026, 02:00 AM Bills & Utilities I have paid yesterday a electricity bill for 150$ for the company 💳 Other House $150.00"

This is WRONG because:
1. User is trying to CREATE an expense, not view existing ones
2. AI should generate SQL INSERT, not format display text
3. System will execute SQL and show proper success message

CORRECT RESPONSE for expense creation:
✅ Generate SQL INSERT query in code blocks
✅ System executes and shows: "✅ Successfully added: amount: 150.00, date: DATE_SUB(CURDATE(), INTERVAL 1 DAY), description: I have paid yesterday a electricity bill for 150$ for the company, categoryId: [bills-category-id], paymentMethod: Other, isDisabled: false"

RESPONSE PATTERN RECOGNITION:
- If message contains spending verbs (spent, paid, bought, got, purchased) + amounts → CREATE EXPENSE
- If message asks to see/list/show expenses → VIEW EXPENSES
- If message describes past spending with specific amounts → CREATE EXPENSE
- If message asks for expense information/reports → VIEW EXPENSES

CRITICAL: When user describes spending money, your job is to generate SQL INSERT queries. The formatted expense displays in examples are for AFTER you generate SELECT queries and the system returns results. Never show formatted displays when users are creating expenses.`,
          metadata: { type: 'validation', rule: 'creation-vs-viewing' }
        },
        {
          id: 'no-placeholders-in-sql',
          content: `ABSOLUTE BAN ON PLACEHOLDERS IN SQL QUERIES

PROHIBITED PLACEHOLDER PATTERNS (NEVER USE THESE):
❌ 'BOOK_ID_FROM_YOUR_[BOOK_NAME]_BOOK'
❌ '[book-id]'
❌ '[category-id]'  
❌ '[user-id]'
❌ 'ACTUAL_BOOK_ID_HERE'
❌ Any text in square brackets []
❌ Any text with underscores like 'BOOK_ID_HERE'

WHY PLACEHOLDERS ARE WRONG:
- Placeholders cause FOREIGN KEY CONSTRAINT FAILURES
- Database rejects queries with non-existent IDs
- Users get "Cannot add or update a child row" errors
- Operations fail instead of succeeding

HOW TO GET REAL IDs:
1. Look at YOUR BOOKS section in the context
2. Find the book by name (e.g., "Company 1")
3. Copy the EXACT Book ID (UUID) that appears after "Book ID: "
4. Use that UUID directly in your SQL query

EXAMPLE CORRECT USAGE:
If YOUR BOOKS shows: "- Book Name: Company 1, Book ID: 550e8400-e29b-41d4-a716-446655440000, Currency: USD"
Then use: bookId = '550e8400-e29b-41d4-a716-446655440000'

INCORRECT (CAUSES ERRORS):
❌ bookId = 'BOOK_ID_FROM_YOUR_COMPANY1_BOOK'
❌ bookId = '[book-id]'

CRITICAL: Always use the actual UUIDs from YOUR BOOKS section. Never invent or use placeholder text. If you cannot find the book ID in the context, ask the user for clarification instead of using placeholders.`,
          metadata: { type: 'validation', rule: 'no-placeholders' }
        },
        {
          id: 'expense-categorization-accuracy',
          content: `CRITICAL EXPENSE CATEGORIZATION ACCURACY RULES

CATEGORIZATION KEYWORD PRIORITY (highest to lowest):
1. EXACT MATCHES: Use these keywords to determine category with highest confidence
   - Food & Dining: food, groceries, restaurant, lunch, dinner, coffee, drink, meal, eat, dining, breakfast, snack, fast food, takeout, delivery, pizza, burger, sushi, salad, dessert
   - Transportation: gas, fuel, refuel, petrol, diesel, car, taxi, bus, train, subway, parking, toll, uber, lyft, ride, mileage, vehicle, auto, transportation
   - Shopping: shopping, clothes, clothing, electronics, purchase, buy, store, mall, amazon, retail, items, goods, products, merchandise
   - Entertainment: movie, movies, cinema, concert, music, game, games, gaming, theater, show, event, entertainment, leisure, fun, hobby
   - Bills & Utilities: bill, bills, electricity, electric, water, internet, phone, utility, utilities, cable, gas bill, power, sewage, garbage
   - Healthcare: medical, doctor, hospital, pharmacy, medicine, health, dental, prescription, clinic, therapy, healthcare, insurance
   - Education: book, books, course, courses, tuition, school, college, university, education, learning, training, class, workshop, seminar
   - Travel: flight, hotel, vacation, trip, travel, airline, airport, accommodation, lodging, resort, cruise, tour, holiday
   - Personal Care: haircut, hair, salon, cosmetics, beauty, personal care, grooming, spa, massage, nails, barber
   - Home & Garden: home, house, garden, repair, maintenance, furniture, appliance, cleaning, lawn, yard, improvement

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

5. MISSING CATEGORY HANDLING: If the matched category doesn't exist in the target book:
   - NEVER fall back to another book or use a different category silently
   - ALWAYS ask for clarification: "The [book name] book doesn't have a '[category name]' category. Would you like me to create it?"
   - Only proceed after user confirms

CATEGORIZATION ACCURACY CHECKLIST:
- Does the keyword directly match the category description?
- Is the context consistent with the category purpose?
- Would a reasonable person categorize this expense this way?
- Does it match similar expenses in the user's history?

CRITICAL: Always prioritize FOOD keywords for meal-related expenses. "Lunch", "dinner", "breakfast" should NEVER go to Education, Entertainment, or any other category - they are FOOD expenses.`,
          metadata: { type: 'validation', rule: 'categorization-accuracy' }
        },
        {
          id: 'book-context-retention',
          content: `BOOK CONTEXT RETENTION FOR CONVERSATION FLOW

CRITICAL: Maintain book context throughout the conversation. When users refer to "this book", "that book", or continue working with a previously mentioned book, you MUST remember and use the correct book.

BOOK CONTEXT RULES:
1. When user mentions a specific book name (e.g., "Dorm book", "Company book"), remember it for subsequent operations
2. When user says "this book" or "that book", refer back to the most recently mentioned book in the conversation
3. When user says "add to it" or "create in it", "it" refers to the most recently mentioned book
4. Book context persists until user explicitly mentions a different book

EXAMPLES OF CONTEXT RETENTION:
- User: "add electricity bill to Dorm book" → Remember "Dorm" as current book
- User: "create Bills category from default to this book" → Use "Dorm" book (not Company or any other)
- User: "add the bill to it" → Use "Dorm" book and find the Bills category in Dorm book

BOOK IDENTIFICATION PRIORITY:
1. Explicitly mentioned book name in current message
2. "this book", "that book", "it" → Use most recently mentioned book from conversation history
3. If no book context, ask user to specify which book

CRITICAL: Never default to a different book when user says "this book". Always use the book from the immediate conversation context.

WRONG BEHAVIOR TO AVOID:
❌ User mentions "Dorm book" → AI creates category in "Company book"
❌ User says "this book" → AI uses wrong book ID
❌ User says "add to it" → AI cannot find the category because it's looking in wrong book

CORRECT BEHAVIOR:
✅ User mentions "Dorm book" → Store "Dorm" as current context
✅ User says "create category in this book" → Use "Dorm" book ID
✅ User says "add expense to it" → Use "Dorm" book and its categories`,
          metadata: { type: 'validation', rule: 'book-context-retention' }
        },
        {
          id: 'pending-expense-context',
          content: `PENDING EXPENSE CONTEXT RETENTION - CRITICAL FOR FOLLOW-UP COMMANDS

When a user's expense creation is interrupted (e.g., missing category), you MUST remember the PENDING EXPENSE details and wait for follow-up commands.

PENDING EXPENSE SCENARIO:
1. User: "electricity bill for House for $40" → Category missing → AI asks to create category
2. User: "yes, create it" → AI creates the category
3. User: "add the bill now" or "add it now" or "add the expense" → AI should add the ORIGINAL expense ($40 electricity bill)

FOLLOW-UP COMMAND PATTERNS (recognize these as "add the pending expense"):
- "add the bill now" / "add the bill know" (typo)
- "add it now" / "add it" / "now add it"
- "add the expense" / "add the expense now"
- "yes add it" / "ok add it" / "go ahead"
- "create the expense" / "create it now"
- "proceed" / "continue" / "do it"
- Any variation with typos like "know" instead of "now"

CRITICAL - WHAT NOT TO DO:
❌ "add the bill know" → Create a book called "Bill Know" (WRONG!)
❌ "add it now" → Ask "what do you want to add?" (WRONG - you already know!)
❌ Forget the pending expense details after creating the category

CORRECT BEHAVIOR:
✅ Remember: amount=$40, description="electricity bill", book="House", category="Bills & Utilities"
✅ When user says "add the bill now" → Generate INSERT for the $40 electricity bill expense
✅ Use the newly created category ID for the expense

CONTEXT RETENTION RULES:
1. When expense creation fails due to missing category, store the expense details as PENDING
2. After category is created, the pending expense is READY to be added
3. Any follow-up like "add it", "add the bill", "proceed" should trigger the pending expense creation
4. Clear the pending context only after the expense is successfully added

TYPO HANDLING:
- "know" should be understood as "now" in context
- "bil" should be understood as "bill"
- "expens" should be understood as "expense"
- Use fuzzy matching for common typos in follow-up commands`,
          metadata: { type: 'validation', rule: 'pending-expense-context' }
        },
        {
          id: 'correct-table-references',
          content: `CORRECT TABLE REFERENCES - NEVER USE WRONG TABLE NAMES

DATABASE TABLES (use EXACTLY these names):
- expenses (NOT bills, NOT expense, NOT expenditures)
- categories (NOT category, NOT cats)
- books (NOT book, NOT ledgers)
- users (NOT user, NOT accounts)

PROHIBITED TABLE REFERENCES:
❌ INSERT INTO bills ... (WRONG - should be expenses)
❌ SELECT FROM expense ... (WRONG - should be expenses)  
❌ UPDATE categories SET ... WHERE book_id = ... (WRONG - should be bookId)
❌ SELECT * FROM book ... (WRONG - should be books)

CORRECT TABLE USAGE:
✅ INSERT INTO expenses (id, amount, date, description, categoryId, paymentMethod, isDisabled, createdAt, updatedAt) VALUES (...)
✅ SELECT * FROM categories WHERE bookId = 'book-id'
✅ UPDATE books SET name = 'New Name' WHERE id = 'book-id'
✅ SELECT e.*, c.name FROM expenses e JOIN categories c ON e.categoryId = c.id

CRITICAL: The error "Table 'manage_my_expenses.bills' doesn't exist" means the AI used "bills" instead of "expenses". Always use the correct table names from the schema.

TABLE NAME VALIDATION CHECKLIST:
- For expense operations → Use "expenses" table
- For category operations → Use "categories" table  
- For book operations → Use "books" table
- For user operations → Use "users" table
- Never invent table names or use abbreviations`,
          metadata: { type: 'validation', rule: 'correct-table-references' }
        }
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