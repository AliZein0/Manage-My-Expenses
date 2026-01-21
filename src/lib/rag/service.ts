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
      books: ['name', 'userId', 'currency'],
      categories: ['name', 'bookId'],
      expenses: ['amount', 'date', 'categoryId', 'paymentMethod']
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
          content: `REQUIRED FIELDS: Books need name, userId, currency. Categories need name, bookId. Expenses need amount, date, categoryId, paymentMethod. Always include these when generating INSERT queries.`,
          metadata: { type: 'validation', rule: 'required-fields' }
        },
        {
          id: 'response-format-insert',
          content: `RESPONSE FORMAT FOR INSERT OPERATIONS: When generating SQL INSERT queries, the system will extract and display only the record values in a clean JSON format. For example: "✅ Successfully added: amount: 300.00, date: CURDATE(), description: , categoryId: 43108e76-f1ed-11f0-9c01-20bd1d505f09, paymentMethod: Other, isDisabled: false". The response should be concise and show only the added record values without row counts or query type information.`,
          metadata: { type: 'response-format', operation: 'insert' }
        },
        {
          id: 'response-format-select',
          content: `RESPONSE FORMAT FOR SELECT OPERATIONS: When executing SELECT queries, the system displays results as: 📊 Found X records: followed by a JSON array of the data. For example: 📊 Found 1 records: [{"name": "B1", "currency": "LBP"}]. Keep responses clean and data-focused.`,
          metadata: { type: 'response-format', operation: 'select' }
        },
        {
          id: 'response-format-user-preference',
          content: `USER PREFERRED RESPONSE FORMAT: The user expects responses that show NAMES instead of IDs and use natural language, not JavaScript/JSON scripts. For example: "✅ Successfully added: $300.00 expense to Groceries category in B1 book" instead of showing raw database IDs. Always use book names, category names, and user-friendly descriptions. Avoid showing UUIDs, raw database field names, or JSON structures. Responses should be conversational and informative. YOU must resolve IDs to names using your knowledge of the user's data from the context provided.`,
          metadata: { type: 'response-format', userPreference: true }
        },
        {
          id: 'response-format-examples',
          content: `RESPONSE FORMAT EXAMPLES: 
- GOOD: "✅ Successfully added: $300.00 expense to Groceries category in B1 book"
- GOOD: "📊 Found 1 book: B1 with currency LBP"
- GOOD: "✅ Successfully added: C5 category to B1 book"
- GOOD: "📊 Found 1 expense: $50.00 for 'Weekly groceries' in Groceries category in B1 book"
- BAD: "✅ Successfully added: amount: 300.00, date: CURDATE(), description: , categoryId: 43108e76-f1ed-11f0-9c01-20bd1d505f09, paymentMethod: Other, isDisabled: false"
- BAD: Showing raw UUIDs like 43108e76-f1ed-11f0-9c01-20bd1d505f09
- BAD: Showing database field names like "categoryId", "bookId", "isDisabled"

SQL QUERY GUIDELINES:
- For expenses: Use JOINs through categories to books for user filtering
- Example: SELECT SUM(amount) FROM expenses e JOIN categories c ON e.categoryId = c.id JOIN books b ON c.bookId = b.id WHERE b.userId = 'user-id'
- For categories: JOIN through books for user filtering
- Example: SELECT * FROM categories c JOIN books b ON c.bookId = b.id WHERE b.userId = 'user-id'
- For books: Direct WHERE clause on userId
- Example: SELECT * FROM books WHERE userId = 'user-id'

CRITICAL: YOU must resolve IDs to names using the user context provided. Look at the user's books and categories in the context and replace IDs with their corresponding names. Never show raw database IDs or field names.`,
          metadata: { type: 'response-format', examples: true }
        },
        {
          id: 'response-format-natural-language',
          content: `NATURAL LANGUAGE REQUIREMENT: Responses must be conversational and informative, not JavaScript/JSON scripts. Never output raw JSON arrays, database records, or code blocks as the main response. Use complete sentences and explain what was done or found in plain English. For example: "I found 1 book named B1 with currency LBP" instead of "📊 Found 1 records: [{"name": "B1", "currency": "LBP"}]".`,
          metadata: { type: 'response-format', naturalLanguage: true }
        },
        {
          id: 'ai-response-formatting-responsibility',
          content: `AI RESPONSE FORMATTING RESPONSIBILITY: When you generate SQL queries, you are also responsible for how the final response will be formatted. The system will execute your SQL and show results, but YOU must ensure your response instructions lead to natural language with names instead of IDs. Use the user context to resolve IDs: if you see bookId 'b01ccdf3-f1ec-11f0-9c01-20bd1d505f09' in the context, know that it refers to book 'B1' and mention 'B1' in your response, not the ID.`,
          metadata: { type: 'response-format', aiResponsibility: true }
        },
        {
          id: 'sql-query-generation-rules',
          content: `SQL QUERY GENERATION RULES: When generating SELECT queries for user data, you MUST use proper JOINs to filter by userId. The expenses table doesn't have userId directly - you must JOIN through categories to books. Example: SELECT SUM(amount) FROM expenses e JOIN categories c ON e.categoryId = c.id JOIN books b ON c.bookId = b.id WHERE b.userId = 'user-id'. For categories: SELECT COUNT(*) FROM categories c JOIN books b ON c.bookId = b.id WHERE b.userId = 'user-id'. For books: SELECT * FROM books WHERE userId = 'user-id'. The system will auto-fix simple queries, but you should generate correct queries from the start.`,
          metadata: { type: 'sql-generation', rules: true }
        },
        {
          id: 'duplicate-book-validation',
          content: `DUPLICATE BOOK VALIDATION: When creating a new book, you MUST check if a book with the same name already exists for the user. The system will validate this and refuse to create duplicate book names. If a book with the same name already exists, respond with "Book already exists" instead of generating an SQL query. Always check YOUR BOOKS section first before creating a new book.`,
          metadata: { type: 'validation', rule: 'duplicate-book' }
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