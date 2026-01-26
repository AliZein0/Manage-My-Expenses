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

      // Get user's expense data
      const expenses = await prisma.expense.findMany({
        where: { 
          categoryId: { in: categoryIds },
          isDisabled: false 
        },
        take: 10,
        orderBy: { date: 'desc' },
        include: { category: true }
      })

      // Note: Report model doesn't exist in current schema

      // Calculate spending statistics
      const totalSpending = expenses.reduce((sum, exp) => sum + exp.amount, 0)
      const avgExpense = expenses.length > 0 ? totalSpending / expenses.length : 0

      // Group by category
      const categoryBreakdown = expenses.reduce((acc, exp) => {
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
          id: 'response-format-insert',
          content: `RESPONSE FORMAT FOR INSERT OPERATIONS: When generating SQL INSERT queries, DO NOT generate success messages yourself. Your ONLY job is to generate SQL queries in code blocks. The system will execute your SQL query and generate the success message. For example, after executing your INSERT query, the system will show: "✅ Successfully added: amount: 300.00, date: CURDATE(), description: , categoryId: 43108e76-f1ed-11f0-9c01-20bd1d505f09, paymentMethod: Other, isDisabled: false". NEVER generate success messages like "✅ Successfully added" or "Successfully created" - only generate SQL queries.`,
          metadata: { type: 'response-format', operation: 'insert' }
        },
        {
          id: 'response-format-select',
          content: `RESPONSE FORMAT FOR SELECT OPERATIONS: When executing SELECT queries, the system displays results as: 📊 Found X records: followed by a JSON code block with the data. For example: 📊 Found 1 records:\n\`\`\`json\n[{"name": "B1", "currency": "LBP"}]\n\`\`\`. Keep responses clean and data-focused.`,
          metadata: { type: 'response-format', operation: 'select' }
        },
        {
          id: 'response-format-user-preference',
          content: `USER PREFERRED RESPONSE FORMAT: The user expects responses that show NAMES instead of IDs and use natural language. However, your job is ONLY to generate SQL queries in code blocks. The system will execute your SQL and generate the success message with names instead of IDs. For example: You generate \`\`\`sql\nINSERT INTO expenses (...) VALUES (UUID(), 100.00, CURDATE(), '', 'category-id', 'Other', false, NOW(), NOW())\n\`\`\` and the system will show "✅ Successfully added: $100.00 expense to Groceries category in B1 book". YOU must resolve IDs to names in your SQL generation by using the correct IDs from the user context provided. For SELECT operations, the system will display results as JSON code blocks with resolved names. NEVER generate success messages yourself.`,
          metadata: { type: 'response-format', userPreference: true }
        },
        {
          id: 'response-format-examples',
          content: `RESPONSE FORMAT EXAMPLES: 
CRITICAL: Your job is ONLY to generate SQL queries in code blocks. The system will execute them and generate success messages. NEVER generate success messages yourself.

GOOD EXAMPLES (what you should generate):
- For book creation: \`\`\`sql\nINSERT INTO books (id, name, description, currency, isArchived, userId, createdAt, updatedAt) VALUES (UUID(), 'Test', '', 'USD', false, 'user-id', NOW(), NOW())\n\`\`\`
- For category creation: \`\`\`sql\nINSERT INTO categories (id, name, description, bookId, icon, color, isDisabled, createdAt, updatedAt) VALUES (UUID(), 'C1', '', 'book-id', '', '', false, NOW(), NOW())\n\`\`\`
- For expense creation: \`\`\`sql\nINSERT INTO expenses (id, amount, date, description, categoryId, paymentMethod, isDisabled, createdAt, updatedAt) VALUES (UUID(), 100.00, CURDATE(), '', 'category-id', 'Other', false, NOW(), NOW())\n\`\`\`
- For SELECT queries: \`\`\`sql\nSELECT * FROM books WHERE userId = 'user-id'\n\`\`\`

BAD EXAMPLES (what you should NOT generate):
- ❌ "✅ Successfully added: $300.00 expense to Groceries category in B1 book" (without SQL first)
- ❌ "📊 Found 1 book: B1 with currency LBP" (without SQL first)
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
CRITICAL: For SELECT operations, the system will handle displaying results as JSON code blocks. Focus on generating correct SQL queries with proper JOINs and WHERE clauses.`,
          metadata: { type: 'response-format', examples: true }
        },
        {
          id: 'response-format-natural-language',
          content: `NATURAL LANGUAGE REQUIREMENT: Your job is ONLY to generate SQL queries in code blocks. The system will execute them and generate natural language responses. For INSERT operations, generate the SQL query and the system will show: "✅ Successfully added: $300.00 expense to Groceries category in B1 book". For SELECT operations, generate the SQL query and the system will display results as JSON code blocks. Focus on generating correct SQL queries rather than formatting the output. NEVER generate success messages yourself.`,
          metadata: { type: 'response-format', naturalLanguage: true }
        },
        {
          id: 'ai-response-formatting-responsibility',
          content: `AI RESPONSE FORMATTING RESPONSIBILITY: Your ONLY job is to generate SQL queries in code blocks. When you generate SQL INSERT queries, you are responsible for using the correct IDs from the user context. The system will execute your SQL and show the success message with names instead of IDs. Use the user context to resolve IDs: if you see bookId 'b01ccdf3-f1ec-11f0-9c01-20bd1d505f09' in the context, know that it refers to book 'B1' and use that ID in your SQL query. The system will convert it to "B1" in the success message. For SELECT queries, the system will handle displaying results as JSON code blocks - focus on generating correct SQL with proper JOINs and WHERE clauses. NEVER generate success messages yourself - only generate SQL queries.`,
          metadata: { type: 'response-format', aiResponsibility: true }
        },
        {
          id: 'sql-query-generation-rules',
          content: `SQL QUERY GENERATION RULES: Your ONLY job is to generate SQL queries in code blocks. When generating SELECT queries for user data, you MUST use proper JOINs to filter by userId. The expenses table doesn't have userId directly - you must JOIN through categories to books. Example: SELECT SUM(amount) FROM expenses e JOIN categories c ON e.categoryId = c.id JOIN books b ON c.bookId = b.id WHERE b.userId = 'user-id'. For categories: SELECT COUNT(*) FROM categories c JOIN books b ON c.bookId = b.id WHERE b.userId = 'user-id'. For books: SELECT * FROM books WHERE userId = 'user-id'. The system will auto-fix simple queries, but you should generate correct queries from the start. NEVER generate success messages yourself.`,
          metadata: { type: 'sql-generation', rules: true }
        },
        {
          id: 'duplicate-validation',
          content: `DUPLICATE VALIDATION: When creating a new book or category, the system will automatically check if a duplicate already exists. For books: checks if a book with the same name already exists for the user. For categories: checks if a category with the same name already exists in the same book. If a duplicate is found, the system will refuse to create it and return an error. Your job is ONLY to generate SQL queries - the system will handle all validation including duplicate checking. NEVER generate success messages like "✅ Successfully added" - only generate SQL queries.`,
          metadata: { type: 'validation', rule: 'duplicate' }
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
          ...validationDocs  // Include validation rules in RAG context
        ],
        userContext: {
          totalExpenses: expenses.length,
          totalSpending,
          avgExpense,
          categories: categories.length,
          books: books.length,
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