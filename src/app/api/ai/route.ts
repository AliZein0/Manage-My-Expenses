import { NextResponse } from 'next/server'
import { ragService } from '@/lib/rag/service'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// OpenRouter API client configuration
const OPENROUTER_API_URL = process.env.OPENROUTER_API_URL || 'https://openrouter.ai/api/v1'
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY

// Runtime tunables (override from .env)
const OPENROUTER_TEMPERATURE = parseFloat(process.env.OPENROUTER_TEMPERATURE || '0.7')
const OPENROUTER_MAX_TOKENS = parseInt(process.env.OPENROUTER_MAX_TOKENS || '1000', 10)
const APP_URL = process.env.APP_URL || process.env.NEXTAUTH_URL || 'https://localhost:3000'
const APP_NAME = process.env.APP_NAME || 'Manage My Expenses'
const ENABLE_AI_SQL_EXECUTION = (process.env.ENABLE_AI_SQL_EXECUTION || 'true').toLowerCase() === 'true' 

// Model configuration with fallbacks - now loaded from env with safe defaults
const MODEL_CONFIG = {
  primary: process.env.OPENROUTER_MODEL_PRIMARY || 'google/gemma-3-27b-it:free',
  fallback: process.env.OPENROUTER_MODEL_FALLBACK || 'allenai/molmo-2-8b:free'
} 

// Helper function to call OpenRouter API with fallback support
async function callOpenRouterAPI(messages: any[], model: string = MODEL_CONFIG.primary) {
  try {
    const apiResponse = await fetch(`${OPENROUTER_API_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': APP_URL,
        'X-Title': APP_NAME,
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        temperature: OPENROUTER_TEMPERATURE,
        max_tokens: OPENROUTER_MAX_TOKENS,
      }),
    })

    if (!apiResponse.ok) {
      let errorData;
      try {
        errorData = await apiResponse.json()
      } catch (jsonError) {
        // If response is not JSON, use status text
        errorData = { error: { message: `HTTP ${apiResponse.status}: ${apiResponse.statusText}` } }
      }

      // If rate limited, try fallback model
      const errorMessage = typeof errorData.error === 'string' ? errorData.error : (errorData.error?.message || '')
      if (apiResponse.status === 429 || errorMessage.includes('rate limit')) {
        console.log(`Rate limit hit for ${model}, trying fallback: ${MODEL_CONFIG.fallback}`)

        // Try fallback model
        const fallbackResponse = await fetch(`${OPENROUTER_API_URL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': APP_URL,
            'X-Title': APP_NAME,
          },
          body: JSON.stringify({
            model: MODEL_CONFIG.fallback,
            messages: messages,
            temperature: OPENROUTER_TEMPERATURE,
            max_tokens: OPENROUTER_MAX_TOKENS,
          }),
        })

        if (!fallbackResponse.ok) {
          let fallbackError;
          try {
            fallbackError = await fallbackResponse.json()
          } catch (jsonError) {
            fallbackError = { error: { message: `HTTP ${fallbackResponse.status}: ${fallbackResponse.statusText}` } }
          }
          throw new Error(`API Error: ${fallbackError.error?.message || 'Unknown error'}`)
        }

        return await fallbackResponse.json()
      }

      throw new Error(`API Error: ${errorMessage || apiResponse.statusText}`)
    }

    return await apiResponse.json()
  } catch (error) {
    console.error('OpenRouter API call failed:', error)
    // Return a fallback response instead of throwing
    return {
      choices: [{
        message: {
          content: 'I apologize, but I\'m currently unable to process your request due to an API connectivity issue. Please try again in a moment.'
        }
      }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    }
  }
}

// Helper function to resolve book names to IDs in SQL queries






// Helper function to convert currency using exchange rate API
async function convertCurrency(amount: number, fromCurrency: string, toCurrency: string): Promise<{ convertedAmount: number; exchangeRate: number; success: boolean; error?: string }> {
  try {
    // If currencies are the same, no conversion needed
    if (fromCurrency === toCurrency) {
      return {
        convertedAmount: amount,
        exchangeRate: 1,
        success: true
      };
    }

    // Use exchangerate-api.com (free tier)
    const response = await fetch(`https://api.exchangerate-api.com/v4/latest/${fromCurrency}`);
    
    if (!response.ok) {
      throw new Error(`Exchange rate API returned ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.rates || !data.rates[toCurrency]) {
      throw new Error(`Exchange rate for ${toCurrency} not found`);
    }

    const exchangeRate = data.rates[toCurrency];
    const convertedAmount = amount * exchangeRate;

    return {
      convertedAmount: Math.round(convertedAmount * 100) / 100, // Round to 2 decimal places
      exchangeRate,
      success: true
    };
  } catch (error) {
    console.error('Currency conversion error:', error);
    return {
      convertedAmount: amount,
      exchangeRate: 1,
      success: false,
      error: `Failed to convert ${fromCurrency} to ${toCurrency}: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

// Helper function to extract amount and currency from message
function extractAmountAndCurrency(message: string): { amount: number | null; currency: string | null; originalText: string } {
  // Match patterns like "150 euro", "€150", "$50", "50 USD", etc.
  const patterns = [
    // Currency symbol + number: €150, $50, £25
    /([$€£¥₹₽₩₺₫₪د.إ﷼KDد.ب﷼JODل.لEGP₦₱R$CHF₵A$NZ$krNkrDkrzłKčFtNT$฿RpRM₫₭₨₮₶₷₹₺₻₼₽₾₿][\d,]+\.?\d*)/i,
    // Number + currency code: 150 EUR, 50 USD
    /(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(USD|EUR|GBP|JPY|CAD|AUD|CHF|CNY|INR|MXN|BRL|ZAR|RUB|KRW|SGD|HKD|NZD|SEK|NOK|DKK|PLN|CZK|HUF|TRY|TWD|THB|IDR|MYR|PHP|VND|ILS|AED|SAR|QAR|KWD|BHD|OMR|JOD|LBP|EGP|NGN|CLP|COP|PEN|ARS|UYU)/i,
    // Currency code + number: EUR 150, USD 50
    /(USD|EUR|GBP|JPY|CAD|AUD|CHF|CNY|INR|MXN|BRL|ZAR|RUB|KRW|SGD|HKD|NZD|SEK|NOK|DKK|PLN|CZK|HUF|TRY|TWD|THB|IDR|MYR|PHP|VND|ILS|AED|SAR|QAR|KWD|BHD|OMR|JOD|LBP|EGP|NGN|CLP|COP|PEN|ARS|UYU)\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match) {
      let amountStr = '';
      let currency = '';
      let originalText = match[0];

      if (match[1] && match[1].match(/^\d/)) {
        // Pattern: number + currency code
        amountStr = match[1];
        currency = match[2];
      } else if (match[1] && match[2]) {
        // Pattern: currency code + number
        currency = match[1];
        amountStr = match[2];
      } else if (match[1]) {
        // Pattern: currency symbol + number
        const symbolMatch = match[1];
        // Extract number from symbol + number
        const numberMatch = symbolMatch.match(/[\d,]+\.?\d*/);
        if (numberMatch) {
          amountStr = numberMatch[0];
          // Detect currency from symbol
          const symbol = symbolMatch.replace(amountStr, '').trim();
          const currencyMap: Record<string, string> = {
            '$': 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY', '₹': 'INR', '₽': 'RUB', '₩': 'KRW', '₺': 'TRY', '₫': 'VND', '₪': 'ILS', 'د.إ': 'AED', '﷼': 'SAR'
          };
          currency = currencyMap[symbol] || '';
        }
      }

      if (amountStr && currency) {
        // Clean amount string (remove commas)
        const cleanAmount = amountStr.replace(/,/g, '');
        const amount = parseFloat(cleanAmount);
        
        if (!isNaN(amount)) {
          return { amount, currency: currency.toUpperCase(), originalText };
        }
      }
    }
  }

  return { amount: null, currency: null, originalText: '' };
}

// Function to extract and format record values from SQL query
function extractRecordValuesFromQuery(query: string, userBooks: any[], categories: any[]): string {
  try {
    // Find VALUES keyword
    const valuesStart = query.indexOf('VALUES');
    if (valuesStart === -1) return '';

    // Get everything after VALUES
    const afterValues = query.substring(valuesStart + 6).trim();
    if (!afterValues.startsWith('(')) return '';

    // Find the matching closing parenthesis
    let depth = 1;
    let i = 1;
    while (i < afterValues.length && depth > 0) {
      if (afterValues[i] === '(') depth++;
      if (afterValues[i] === ')') depth--;
      i++;
    }

    // Extract the values part (without the outer parentheses)
    const valuesPart = afterValues.substring(1, i - 1);

    // Extract the column names
    const columnsStart = query.indexOf('(');
    const columnsEnd = query.indexOf(')', columnsStart);
    if (columnsStart === -1 || columnsEnd === -1) return '';

    const columnsPart = query.substring(columnsStart + 1, columnsEnd);
    const columns = columnsPart.split(',').map(col => col.trim().replace(/`/g, '').replace(/"/g, ''));

    // Parse the values
    const values = parseSQLValues(valuesPart);

    // Build a clean object without sensitive IDs
    const recordObj: any = {};

    columns.forEach((col, index) => {
      if (values[index] !== undefined) {
        // Clean up the value
        let value = values[index];

        // Remove quotes from string values
        if (typeof value === 'string') {
          value = value.replace(/^['"]|['"]$/g, '');
        }

        // Skip UUID() and NOW() functions
        if (value === 'UUID()' || value === 'NOW()' || value === 'CURDATE()') {
          return;
        }

        // Resolve IDs to names for better user experience
        if (col.toLowerCase() === 'categoryid') {
          const category = categories.find(c => c.id === value);
          if (category) {
            recordObj['category'] = category.name;
          }
          return; // Don't show the raw ID
        }

        if (col.toLowerCase() === 'bookid') {
          const book = userBooks.find(b => b.id === value);
          if (book) {
            recordObj['book'] = book.name;
          }
          return; // Don't show the raw ID
        }

        // Skip any other ID fields
        if (col.toLowerCase().endsWith('id')) {
          return;
        }

        recordObj[col] = value;
      }
    });

    // Convert to readable string format
    const entries = Object.entries(recordObj);
    if (entries.length === 0) return '';

    return entries.map(([key, value]) => `${key}: ${value}`).join(', ');
  } catch (error) {
    console.error('Error parsing SQL values:', error);
    return '';
  }
}

// Helper function to parse SQL VALUES, handling nested parentheses and quotes
function parseSQLValues(valuesString: string): any[] {
  const values: any[] = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';
  let depth = 0;

  for (let i = 0; i < valuesString.length; i++) {
    const char = valuesString[i];

    if (inQuotes) {
      if (char === quoteChar && valuesString[i - 1] !== '\\') {
        inQuotes = false;
        current += char;
      } else {
        current += char;
      }
    } else {
      if (char === "'" || char === '"') {
        inQuotes = true;
        quoteChar = char;
        current += char;
      } else if (char === '(') {
        depth++;
        current += char;
      } else if (char === ')') {
        depth--;
        current += char;
      } else if (char === ',' && depth === 0) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
  }

  // Push the last value
  if (current.trim()) {
    values.push(current.trim());
  }

  // Parse each value
  return values.map(val => {
    val = val.trim();

    // Handle UUID() and NOW() functions
    if (val === 'UUID()' || val === 'NOW()') {
      return val;
    }

    // Handle CURDATE() function
    if (val === 'CURDATE()') {
      return val;
    }

    // Handle numeric values
    if (!isNaN(val) && val !== '') {
      return parseFloat(val);
    }

    // Handle boolean values
    if (val.toLowerCase() === 'true') return true;
    if (val.toLowerCase() === 'false') return false;

    // Handle NULL
    if (val.toLowerCase() === 'null') return null;

    // Remove quotes from string values
    if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
      return val.slice(1, -1);
    }

    return val;
  });
}

// Function to format success messages based on SQL query type and data
function formatSuccessMessage(sqlQuery: string, executionResult: any, userBooks: any[] = [], categories: any[] = []): string {
  if (!executionResult.success) {
    return executionResult.error || 'Operation failed';
  }

  const trimmedQuery = sqlQuery.trim().toLowerCase();

  // Handle UPDATE operations
  if (trimmedQuery.startsWith('update')) {
    // Extract the primary table name from UPDATE statement
    const updateTableMatch = trimmedQuery.match(/update\s+(\w+)/i);
    const primaryTable = updateTableMatch ? updateTableMatch[1] : '';
    
    if (primaryTable === 'books') {
      // Extract what was updated from the SET clause
      const setMatch = sqlQuery.match(/SET\s+(.+?)\s+(?:WHERE|JOIN|$)/i);
      if (setMatch) {
        const setClause = setMatch[1];
        const updates = setClause.split(',').map(update => update.trim());
        return `Book updated (${updates.join(', ')})`;
      }
      return 'Book updated';
    }

    if (primaryTable === 'categories') {
      const setMatch = sqlQuery.match(/SET\s+(.+?)\s+(?:WHERE|JOIN|$)/i);
      if (setMatch) {
        const setClause = setMatch[1];
        const updates = setClause.split(',').map(update => update.trim());
        return `Category updated (${updates.join(', ')})`;
      }
      return 'Category updated';
    }

    if (primaryTable === 'expenses') {
      const setMatch = sqlQuery.match(/SET\s+(.+?)\s+(?:WHERE|JOIN|$)/i);
      if (setMatch) {
        const setClause = setMatch[1];
        const updates = setClause.split(',').map(update => update.trim());
        return `Expense updated (${updates.join(', ')})`;
      }
      return 'Expense updated';
    }

    return 'Record updated';
  }

  if (trimmedQuery.includes('into categories')) {
    const recordDetails = extractRecordValuesFromQuery(sqlQuery, userBooks, categories);
    const nameMatch = sqlQuery.match(/VALUES\s*\(\s*UUID\(\)\s*,\s*'([^']+)'/);
    const categoryName = nameMatch ? nameMatch[1] : 'Category';
    return `${categoryName} category added${recordDetails ? ` (${recordDetails})` : ''}`;
  }

  if (trimmedQuery.includes('into books')) {
    const recordDetails = extractRecordValuesFromQuery(sqlQuery, userBooks, categories);
    const nameMatch = sqlQuery.match(/VALUES\s*\(\s*UUID\(\)\s*,\s*'([^']+)'/);
    const bookName = nameMatch ? nameMatch[1] : 'Book';
    return `${bookName} book created${recordDetails ? ` (${recordDetails})` : ''}`;
  }

  if (trimmedQuery.includes('into expenses')) {
    const recordDetails = extractRecordValuesFromQuery(sqlQuery, userBooks, categories);
    return `Expense added${recordDetails ? ` (${recordDetails})` : ''}`;
  }

  return 'Record added';
}

// SQL execution function with validation
async function executeDirectSQLWithValidation(query: string) {
  try {
    // Feature flag: allow disabling AI-driven DB writes via env
    if (!ENABLE_AI_SQL_EXECUTION) {
      console.log('executeDirectSQLWithValidation: Disabled by ENABLE_AI_SQL_EXECUTION');
      return {
        success: false,
        error: 'AI SQL execution is disabled by configuration.'
      };
    }

    // Security: Only allow INSERT queries for this direct execution
    const trimmedQuery = query.trim().toLowerCase();
    if (!trimmedQuery.startsWith('insert')) {
      throw new Error('Only INSERT queries are allowed for direct execution');
    }

    // Security: Prevent dangerous SQL keywords
    const words = trimmedQuery.split(/\s+/);
    const dangerousKeywords = ['drop', 'delete', 'update', 'alter', 'create', 'truncate', 'exec', 'select'];
    
    for (const word of words) {
      const cleanWord = word.replace(/[(),;]/g, '');
      if (dangerousKeywords.includes(cleanWord)) {
        throw new Error(`Query contains dangerous SQL keyword: ${cleanWord}`);
      }
    }

    // Security: Prevent SQL comments
    if (trimmedQuery.includes('--') || trimmedQuery.includes('/*') || trimmedQuery.includes('*/')) {
      throw new Error('Query contains SQL comments which are not allowed');
    }

    // Validate expense creation - check for required fields
    if (trimmedQuery.includes('into expenses')) {
      // Check if the query has the required fields for expenses
      // Required: amount, categoryId
      // Optional: date, description, paymentMethod
      const hasAmount = trimmedQuery.includes('amount');
      const hasCategoryId = trimmedQuery.includes('categoryid') || trimmedQuery.includes('category_id');
      
      if (!hasAmount || !hasCategoryId) {
        throw new Error('Expense creation requires amount and categoryId fields');
      }
      
      // Check if categoryId is a valid UUID (not a category name)
      const categoryIdMatch = query.match(/categoryId\s*=\s*['"]([^'"]+)['"]/i);
      if (categoryIdMatch) {
        const categoryId = categoryIdMatch[1];
        // UUID pattern: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidPattern.test(categoryId)) {
          throw new Error(`Invalid categoryId: "${categoryId}". Category ID must be a valid UUID, not a category name.`);
        }
      }
      
      // Check if description is not a UUID (in case AI generates wrong query)
      const descriptionMatch = query.match(/description\s*=\s*['"]([^'"]+)['"]/i);
      if (descriptionMatch && descriptionMatch[1]) {
        const description = descriptionMatch[1];
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidPattern.test(description)) {
          throw new Error(`Invalid description`);
        }
      }
    }

    // Validate category creation - check for valid bookId and duplicates
    if (trimmedQuery.includes('into categories')) {
      // Check if the query has the required fields for categories
      // Required: name, bookId
      const hasName = trimmedQuery.includes('name');
      const hasBookId = trimmedQuery.includes('bookid') || trimmedQuery.includes('book_id');
      
      if (!hasName || !hasBookId) {
        throw new Error('Category creation requires name and bookId fields');
      }
      
      // Check if bookId is a valid UUID (not a book name)
      const bookIdMatch = query.match(/bookId\s*=\s*['"]([^'"]+)['"]/i);
      if (bookIdMatch) {
        const bookId = bookIdMatch[1];
        // UUID pattern: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidPattern.test(bookId)) {
          throw new Error(`Invalid bookId: "${bookId}". Book ID must be a valid UUID, not a book name.`);
        }
      }
      
      // Extract the category name from the INSERT query
      // Pattern: INSERT INTO categories (...) VALUES (UUID(), 'category-name', ...)
      const categoryNameMatch = query.match(/VALUES\s*\(\s*UUID\(\)\s*,\s*'([^']+)'/);
      if (categoryNameMatch && categoryNameMatch[1]) {
        const newCategoryName = categoryNameMatch[1];

        // Validate that the category name is not a UUID
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidPattern.test(newCategoryName)) {
          throw new Error(`Category already exists in this book`);
        }

        // Since AI generates correct SQL with proper IDs, rely on database constraints for duplicate checking
        // The system will handle duplicate validation at the database level
      }
    }

    // Validate book creation - check for required fields
    if (trimmedQuery.includes('into books')) {
      // Check if the query has the required fields for books
      // Required: name, currency
      const hasName = trimmedQuery.includes('name');
      const hasCurrency = trimmedQuery.includes('currency');
      
      if (!hasName || !hasCurrency) {
        throw new Error('Book creation requires name and currency fields');
      }
      
      // Extract the book name from the INSERT query
      // Pattern: INSERT INTO books (...) VALUES (UUID(), 'book-name', ...)
      // Need to handle UUID() which contains parentheses
      // Match: VALUES\s*\(\s*UUID\(\)\s*,\s*'([^']+)'
      const bookNameMatch = query.match(/VALUES\s*\(\s*UUID\(\)\s*,\s*'([^']+)'/);
      if (bookNameMatch && bookNameMatch[1]) {
        const newBookName = bookNameMatch[1];
        
        // Validate that the book name is not a UUID
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidPattern.test(newBookName)) {
          throw new Error(`Book already exists`);
        }
        
        // Since AI generates correct SQL and database handles duplicates, rely on database constraints
        // No need for client-side duplicate checking
      }
    }

    // Execute the INSERT query with Prisma's raw query
    // Handle multiple statements separated by semicolons
    const statements = query.split(';').map(stmt => stmt.trim()).filter(stmt => stmt.length > 0);
    
    console.log('executeDirectSQLWithValidation: Executing', statements.length, 'SQL statements');
    
    let totalRowsAffected = 0;
    for (const statement of statements) {
      if (statement.trim()) {
        console.log('executeDirectSQLWithValidation: Executing statement:', statement);
        const result = await prisma.$executeRawUnsafe(statement);
        console.log('executeDirectSQLWithValidation: Statement executed successfully, rows affected:', result);
        totalRowsAffected += result;
      }
    }
    
    console.log('executeDirectSQLWithValidation: All statements executed successfully, total rows affected:', totalRowsAffected);
    
    return {
      success: true,
      message: `Successfully added ${totalRowsAffected} record(s)`
    };
  } catch (error) {
    console.log('executeDirectSQLWithValidation: Query failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: ' Operation Failed '
    };
  }
}




// Helper function to format SELECT results using AI for natural language formatting
async function formatSelectResultsWithAI(selectResults: any[], originalMessage: string, userId: string, conversationHistory: any[]) {
  try {
    // Get user's books and categories for context
    let userBooks: any[] = [];
    let categories: any[] = [];
    try {
      userBooks = await prisma.book.findMany({
        where: { userId: userId, isArchived: false }
      });
      
      const bookIds = userBooks.map(b => b.id);
      if (bookIds.length > 0) {
        categories = await prisma.category.findMany({
          where: { bookId: { in: bookIds }, isDisabled: false }
        });
      }
    } catch (error) {
      console.log('Could not fetch user data for formatting:', error);
    }

    // Prepare data for AI formatting
    const formattedResults = selectResults.map(result => {
      const { data } = result;
      
      if (!data || !Array.isArray(data)) return 'No data found';
      
      // Resolve IDs to names in the data
      const resolvedData = data.map((item: any) => {
        const resolved: any = {};
        
        // Copy all properties, handling special types
        Object.keys(item).forEach(key => {
          const value = item[key];
          if (typeof value === 'bigint') {
            resolved[key] = value.toString();
          } else if (value instanceof Date) {
            resolved[key] = value.toISOString();
          } else if (value instanceof Buffer) {
            resolved[key] = value.toString();
          } else {
            resolved[key] = value;
          }
        });
        
        // Add resolved names
        if (resolved.bookId && userBooks.length > 0) {
          const book = userBooks.find(b => b.id === resolved.bookId);
          if (book) {
            resolved.book_name = book.name;
            resolved.book_currency = book.currency;
          }
        }
        
        if (resolved.categoryId && categories.length > 0) {
          const category = categories.find(c => c.id === resolved.categoryId);
          if (category) {
            resolved.category_name = category.name;
          }
        }
        
        return resolved;
      });
      
      return {
        query: result.query,
        data: resolvedData,
        count: resolvedData.length
      };
    });

    // Create system prompt for formatting
    const formatSystemPrompt = `You are an AI assistant that formats database query results into natural, user-friendly responses.

Your task is to take the JSON data from database queries and present it in a conversational, readable format.

FORMATTING GUIDELINES:
- For expenses: Show as "Here are your recent expenses: 1. [Date] - [Category]: [Description] - $[Amount] [Currency] ([Payment Method])"
- For books: Show as "Your books: 1. [Book Name] ([Currency])"
- For categories: Show as "Categories: 1. [Category Name]"
- Use proper currency symbols ($ for USD, € for EUR, etc.)
- Format dates as MM/DD/YYYY
- Keep responses concise but informative
- Use bullet points or numbered lists for multiple items
- Include totals/summaries when appropriate

EXAMPLE FORMATS:
- Expenses: "Here are your recent expenses: 1. 01/15/2026 - Groceries: Weekly shopping - $85.50 USD (Credit Card), 2. 01/10/2026 - Transportation: Gas - $45.00 USD (Cash)"
- Books: "Your books: 1. Personal Budget (USD), 2. Business Expenses (EUR)"
- Categories: "Categories in Personal Budget: 1. Groceries, 2. Transportation, 3. Utilities"

Present the data naturally as if you're having a conversation with the user.`;

    // Build messages for formatting AI call
    const messages = [
      { role: 'system', content: formatSystemPrompt }
    ];
    
    // Add conversation history for context
    if (conversationHistory && Array.isArray(conversationHistory)) {
      const filteredHistory = conversationHistory.filter(msg => {
        if (msg.role === 'assistant') {
          // Filter out technical messages
          const technicalPattern = /```sql|✅ Successfully|⚠️ I notice/;
          return !technicalPattern.test(msg.content);
        }
        return true;
      });
      messages.push(...filteredHistory.slice(-3)); // Last 3 messages for context
    }
    
    // Add the original user message
    messages.push({ role: 'user', content: originalMessage });
    
    // Add the query results
    const resultsText = JSON.stringify(formattedResults, (key, value) => {
      // Handle BigInt serialization
      if (typeof value === 'bigint') {
        return value.toString();
      }
      // Handle Date objects
      if (value instanceof Date) {
        return value.toISOString();
      }
      return value;
    }, 2);
    
    messages.push({ 
      role: 'user', 
      content: `Here are the results from your database query. Please format them as a natural, user-friendly response:\n\n${resultsText}` 
    });

    // Call AI to format the results
    const completion = await callOpenRouterAPI(messages);
    const formattedResponse = completion.choices[0]?.message?.content || 'I retrieved the data but had trouble formatting it. Please try again.';
    
    return formattedResponse;
    
  } catch (error) {
    console.error('Error formatting SELECT results with AI:', error);
    return 'I successfully retrieved your data, but had trouble formatting the response. Please try again.';
  }
}

// Function to execute UPDATE SQL queries with validation
async function executeUpdateSQLWithValidation(query: string, userId: string) {
  try {
    // Feature flag: allow disabling AI-driven DB writes via env
    if (!ENABLE_AI_SQL_EXECUTION) {
      console.log('executeUpdateSQLWithValidation: Disabled by ENABLE_AI_SQL_EXECUTION');
      return {
        success: false,
        error: 'AI SQL update execution is disabled by configuration.'
      };
    }

    // Security: Only allow UPDATE queries for this direct execution
    const trimmedQuery = query.trim().toLowerCase();
    if (!trimmedQuery.startsWith('update')) {
      throw new Error('Only UPDATE queries are allowed for direct execution');
    }

    // Security: Prevent dangerous SQL keywords
    const words = trimmedQuery.split(/\s+/);
    const dangerousKeywords = ['drop', 'delete', 'alter', 'create', 'truncate', 'exec'];
    
    for (const word of words) {
      const cleanWord = word.replace(/[(),;]/g, '');
      if (dangerousKeywords.includes(cleanWord)) {
        throw new Error(`Query contains dangerous SQL keyword: ${cleanWord}`);
      }
    }

    // Security: Prevent SQL comments
    if (trimmedQuery.includes('--') || trimmedQuery.includes('/*') || trimmedQuery.includes('*/')) {
      throw new Error('Query contains SQL comments which are not allowed');
    }

    // Validate basic SQL structure for UPDATE queries
    if (!trimmedQuery.toUpperCase().startsWith('UPDATE')) {
      throw new Error('Query must be an UPDATE statement');
    }
    
    // Ensure the query has a SET clause
    if (!trimmedQuery.toUpperCase().includes('SET')) {
      throw new Error('UPDATE query must have a SET clause');
    }
    
    // Check for malformed WHERE clauses
    const whereMatches = trimmedQuery.match(/WHERE/gi);
    if (whereMatches && whereMatches.length > 1) {
      throw new Error('Query contains multiple WHERE clauses');
    }
    
    // Check for consecutive AND keywords
    if (trimmedQuery.toUpperCase().includes(' AND AND ')) {
      throw new Error('Query contains consecutive AND keywords');
    }
    
    // Check for AND without WHERE
    const upperQuery = trimmedQuery.toUpperCase();
    const andIndex = upperQuery.indexOf(' AND ');
    const whereIndex = upperQuery.indexOf(' WHERE ');
    
    if (andIndex !== -1 && (whereIndex === -1 || andIndex < whereIndex)) {
      throw new Error('Query contains AND keyword before WHERE clause');
    }

    // Validate that only non-sensitive fields are being updated
    const allowedFields = {
      books: ['name', 'description', 'currency', 'isarchived', 'updatedat'],
      categories: ['name', 'description', 'icon', 'color', 'isdisabled', 'updatedat'],
      expenses: ['amount', 'date', 'description', 'paymentmethod', 'isdisabled', 'updatedat']
    };

    const sensitiveFields = ['userId', 'id', 'createdAt', 'bookId', 'categoryId'];

    // Extract SET clause to check what fields are being updated
    const setMatch = query.match(/SET\s+(.+?)\s+(?:WHERE|JOIN|$)/i);
    if (setMatch) {
      const setClause = setMatch[1];
      console.log('UPDATE Validation: SET clause extracted:', setClause);

      const fieldsBeingUpdated = setClause.split(',').map(field => {
        const fieldMatch = field.trim().match(/^([`\w.]+)\s*=/);
        const fullField = fieldMatch ? fieldMatch[1].replace(/`/g, '') : '';
        // Extract the actual field name (remove table prefix if present)
        return fullField.split('.').pop() || '';
      }).filter(field => field.length > 0);

      console.log('UPDATE Validation: Fields being updated:', fieldsBeingUpdated);
      console.log('UPDATE Validation: Raw SET clause:', setClause);
      console.log('UPDATE Validation: Fields being updated array:', fieldsBeingUpdated);
      console.log('UPDATE Validation: Individual fields:');
      fieldsBeingUpdated.forEach((field, index) => {
        console.log(`  [${index}] Field: "${field}"`);
      });
      console.log('UPDATE Validation: Sensitive fields list:', sensitiveFields);

      // Check if any sensitive fields are being updated
      const hasSensitiveField = fieldsBeingUpdated.some(field => sensitiveFields.includes(field.toLowerCase()));
      console.log('UPDATE Validation: Has sensitive field?', hasSensitiveField);

      if (hasSensitiveField) {
        console.log('UPDATE Validation: BLOCKED - Attempted to update sensitive field');
        throw new Error(`Cannot update sensitive fields: ${sensitiveFields.join(', ')}. Only non-sensitive fields can be updated.`);
      }

      console.log('UPDATE Validation: Sensitive field check passed');

      // Check table-specific allowed fields
      let tableAllowedFields: string[] = [];
      
      // Extract the primary table name from UPDATE statement
      const updateTableMatch = trimmedQuery.match(/update\s+(\w+)/i);
      const primaryTable = updateTableMatch ? updateTableMatch[1] : '';
      
      console.log('UPDATE Validation: Full query:', query);
      console.log('UPDATE Validation: Trimmed query:', trimmedQuery);
      console.log('UPDATE Validation: Primary table extracted:', primaryTable);
      console.log('UPDATE Validation: Update table match:', updateTableMatch);
      
      if (primaryTable === 'books') {
        tableAllowedFields = allowedFields.books;
        console.log('UPDATE Validation: Table identified as BOOKS, allowed fields:', tableAllowedFields);
      } else if (primaryTable === 'categories') {
        tableAllowedFields = allowedFields.categories;
        console.log('UPDATE Validation: Table identified as CATEGORIES, allowed fields:', tableAllowedFields);
      } else if (primaryTable === 'expenses') {
        tableAllowedFields = allowedFields.expenses;
        console.log('UPDATE Validation: Table identified as EXPENSES, allowed fields:', tableAllowedFields);
      }

      if (tableAllowedFields.length > 0) {
        const hasInvalidField = fieldsBeingUpdated.some(field => !tableAllowedFields.includes(field.toLowerCase()));
        console.log('UPDATE Validation: Has invalid field?', hasInvalidField);

        if (hasInvalidField) {
          console.log('UPDATE Validation: BLOCKED - Invalid field for this table');
          throw new Error(`Invalid fields for update. Allowed fields for this table: ${tableAllowedFields.join(', ')}`);
        }

        console.log('UPDATE Validation: Table-specific validation passed');
      } else {
        console.log('UPDATE Validation: No table-specific validation (table not recognized)');
      }

      console.log('UPDATE Validation: ALL CHECKS PASSED - Query is safe to execute');
    } else {
      console.log('UPDATE Validation: No SET clause found in query');
    }

    // Security: For expenses table, ensure user can only update their own records
    if (trimmedQuery.includes('expenses')) {
      // Add user filtering by joining through categories and books
      const updatedQuery = addUserFilterToUpdateQuery(query, userId);
      // Execute the UPDATE query with Prisma's raw query
      const result = await prisma.$executeRawUnsafe(updatedQuery);
      
      return {
        success: true,
        message: `Successfully updated ${result} record(s)`,
        affectedRows: result
      };
    } else if (trimmedQuery.includes('categories')) {
      // For categories, ensure user can only update their own records
      console.log('executeUpdateSQLWithValidation: Processing categories update');
      const updatedQuery = addUserFilterToUpdateQuery(query, userId);
      console.log('executeUpdateSQLWithValidation: Updated query for categories:', updatedQuery);
      const result = await prisma.$executeRawUnsafe(updatedQuery);
      
      return {
        success: true,
        message: `Successfully updated ${result} record(s)`,
        affectedRows: result
      };
    } else if (trimmedQuery.includes('books')) {
      // For books, ensure user can only update their own records
      const updatedQuery = addUserFilterToUpdateQuery(query, userId);
      const result = await prisma.$executeRawUnsafe(updatedQuery);
      
      return {
        success: true,
        message: `Successfully updated ${result} record(s)`,
        affectedRows: result
      };
    } else {
      throw new Error('UPDATE queries are only allowed for expenses, categories, and books tables');
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Failed to execute UPDATE query'
    };
  }
}

// Helper function to add user filtering to UPDATE queries
function addUserFilterToUpdateQuery(query: string, userId: string): string {
  const trimmedQuery = query.trim();
  const lowerQuery = trimmedQuery.toLowerCase();
  
  console.log('addUserFilterToUpdateQuery: Original query:', trimmedQuery);
  console.log('addUserFilterToUpdateQuery: Lower query:', lowerQuery);
  
  // Check for malformed queries (queries with AND at the end of WHERE clause)
  const malformedAndPattern = /\s+and\s*$/i;
  if (malformedAndPattern.test(trimmedQuery)) {
    console.log('addUserFilterToUpdateQuery: Detected malformed query with trailing AND, fixing it');
    const fixedQuery = trimmedQuery.replace(malformedAndPattern, '');
    return addUserFilterToUpdateQuery(fixedQuery, userId);
  }
  
  // Check for queries with WHERE but no conditions
  const emptyWherePattern = /\s+where\s*$/i;
  if (emptyWherePattern.test(trimmedQuery)) {
    console.log('addUserFilterToUpdateQuery: Detected query with empty WHERE clause, fixing it');
    const fixedQuery = trimmedQuery.replace(emptyWherePattern, '');
    return addUserFilterToUpdateQuery(fixedQuery, userId);
  }
  
  if (lowerQuery.includes('expenses')) {
    // For expenses, add user filtering by joining through categories and books
    // Extract the SET clause to preserve the original updates
    const setMatch = trimmedQuery.match(/set\s+(.+?)\s+where/i);
    if (setMatch) {
      const setClause = setMatch[1];
      // Extract WHERE clause
      const whereMatch = trimmedQuery.match(/where\s+(.+)$/i);
      const whereClause = whereMatch ? whereMatch[1] : '1=1';
      
      return `UPDATE expenses e 
             JOIN categories c ON e.categoryId = c.id 
             JOIN books b ON c.bookId = b.id 
             SET ${setClause} 
             WHERE ${whereClause} AND b.userId = '${userId}'`;
    }
  } else if (lowerQuery.includes('categories')) {
    // For categories, add user filtering by joining with books
    console.log('addUserFilterToUpdateQuery: Processing categories query:', trimmedQuery);
    const setMatch = trimmedQuery.match(/set\s+(.+?)\s+where/i);
    console.log('addUserFilterToUpdateQuery: SET match:', setMatch);
    if (setMatch) {
      const setClause = setMatch[1];
      const whereMatch = trimmedQuery.match(/where\s+(.+)$/i);
      const whereClause = whereMatch ? whereMatch[1] : '1=1';
      console.log('addUserFilterToUpdateQuery: WHERE clause extracted:', whereClause);
      
      const result = `UPDATE categories c 
             JOIN books b ON c.bookId = b.id 
             SET ${setClause} 
             WHERE ${whereClause} AND b.userId = '${userId}'`;
      console.log('addUserFilterToUpdateQuery: Final query:', result);
      return result;
    }
  } else if (lowerQuery.includes('books')) {
    // For books, ensure userId filter is present
    console.log('addUserFilterToUpdateQuery: Processing books query');
    
    // Check if userId is already in the query (case insensitive)
    if (trimmedQuery.toLowerCase().includes('userid')) {
      console.log('addUserFilterToUpdateQuery: userId already present in books query');
      return trimmedQuery;
    }
    
    // Add userId filter - append to the end if WHERE exists, otherwise add WHERE
    if (lowerQuery.includes('where')) {
      console.log('addUserFilterToUpdateQuery: Adding userId to existing WHERE clause');
      const result = `${trimmedQuery} AND userId = '${userId}'`;
      console.log('addUserFilterToUpdateQuery: Result:', result);
      return result;
    } else {
      console.log('addUserFilterToUpdateQuery: Adding WHERE clause with userId');
      const result = `${trimmedQuery} WHERE userId = '${userId}'`;
      console.log('addUserFilterToUpdateQuery: Result:', result);
      return result;
    }
  }
  
  // If we can't parse the query properly, return it as-is (it will likely fail security checks)
  console.log('addUserFilterToUpdateQuery: Returning query as-is:', query);
  return query;
}

// Safe query execution for SELECT operations
async function executeSafeQuery(userId: string, query: string) {
  try {
    // Security: Only allow SELECT queries
    const trimmedQuery = query.trim().toLowerCase();
   

    // Security: Prevent dangerous SQL keywords
    const words = trimmedQuery.split(/\s+/);
    const dangerousKeywords = ['drop', 'delete', 'update', 'alter', 'create', 'truncate', 'exec'];
    
    for (const word of words) {
      const cleanWord = word.replace(/[(),;]/g, '');
      if (dangerousKeywords.includes(cleanWord)) {
        throw new Error(`Query contains dangerous SQL keyword: ${cleanWord}`);
      }
    }

    // Security: Prevent SQL comments
    if (trimmedQuery.includes('--') || trimmedQuery.includes('/*') || trimmedQuery.includes('*/')) {
      throw new Error('Query contains SQL comments which are not allowed');
    }

    // Auto-fix user filtering and joins for expense queries
    let finalQuery = query;
    
    // Handle expense queries specially
    if (trimmedQuery.includes('from expenses')) {
      console.log('executeSafeQuery: Processing expense query:', query);
      
      // Extract the SELECT part
      const selectMatch = query.match(/SELECT\s+(.+?)\s+FROM/i);
      if (selectMatch) {
        let selectPart = selectMatch[1];
        
        // Replace * with specific fields including book currency
        if (selectPart.trim() === '*') {
          selectPart = 'e.*, c.name as category_name, b.name as book_name, b.currency as book_currency';
        } else if (!selectPart.includes('currency')) {
          selectPart = selectPart + ', b.currency as book_currency';
        }
        
        // Extract existing WHERE clause and preserve book filters
        const whereMatch = query.match(/WHERE\s+([\s\S]+?)(?:\s+ORDER\s+BY|\s+GROUP\s+BY|\s+HAVING|\s+LIMIT|$)/i);
        let bookFilter = '';
        
        if (whereMatch) {
          let whereClause = whereMatch[1];
          console.log('executeSafeQuery: Extracted WHERE clause:', whereClause);
          
          // Look for book name filters and preserve them
          const bookNameMatch = whereClause.match(/(?:b\.name|books\.name|book_name|name)\s*=\s*['"]([^'"]+)['"]/i);
          if (bookNameMatch) {
            bookFilter = ` AND b.name = '${bookNameMatch[1]}'`;
            console.log('executeSafeQuery: Found book filter:', bookFilter);
          }
          
          // Look for book ID filters
          const bookIdMatch = whereClause.match(/(?:b\.id|books\.id|bookId|book_id)\s*=\s*['"]([^'"]+)['"]/i);
          if (bookIdMatch) {
            bookFilter = ` AND b.id = '${bookIdMatch[1]}'`;
            console.log('executeSafeQuery: Found book ID filter:', bookFilter);
          }
        } else {
          console.log('executeSafeQuery: No WHERE clause found in query');
        }
        
        // Extract ORDER BY, LIMIT clauses
        let orderBy = '';
        let limit = '';
        
        const orderByMatch = query.match(/ORDER\s+BY\s+(.+?)(?:\s+LIMIT|$)/i);
        if (orderByMatch) {
          orderBy = ' ORDER BY ' + orderByMatch[1].replace(/\bexpenses\./gi, 'e.').replace(/\bcategories\./gi, 'c.').replace(/\bbooks\./gi, 'b.');
        }
        
        const limitMatch = query.match(/LIMIT\s+(.+?)$/i);
        if (limitMatch) {
          limit = ' LIMIT ' + limitMatch[1];
        }
        
        // Build the final query with proper JOINs
        finalQuery = `SELECT ${selectPart} FROM expenses e 
                      JOIN categories c ON e.categoryId = c.id 
                      JOIN books b ON c.bookId = b.id 
                      WHERE b.userId = '${userId}'${bookFilter}${orderBy}${limit}`;
        
        // Clean up whitespace
        finalQuery = finalQuery.replace(/\s+/g, ' ').trim();
        
        console.log('executeSafeQuery: Transformed query:', finalQuery);
      }
    } else if (trimmedQuery.includes('userid') && !trimmedQuery.includes('join')) {
      // Handle other queries that need user filtering
      if (trimmedQuery.includes('from categories')) {
        // Add proper joins for categories
        finalQuery = addCategoriesJoins(query, userId);
      } else if (trimmedQuery.includes('from books')) {
        // Books already has userId, just add WHERE clause if missing
        if (!trimmedQuery.includes('where')) {
          finalQuery = query.replace(/from books/i, `FROM books WHERE userId = '${userId}'`);
        }
      }
    }

    // Execute the query
    const result = await prisma.$queryRawUnsafe(finalQuery);
    
    return {
      success: true,
      data: result,
      rowCount: Array.isArray(result) ? result.length : 1
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Helper to add proper joins for categories queries
function addCategoriesJoins(originalQuery: string, userId: string): string {
  // Extract the SELECT part (everything before FROM)
  const selectMatch = originalQuery.match(/SELECT\s+(.+?)\s+FROM/i);
  if (!selectMatch) return originalQuery;
  
  const selectPart = selectMatch[1];
  
  // Build new query with proper JOINs
  let newQuery = `SELECT ${selectPart} FROM categories c 
                  JOIN books b ON c.bookId = b.id 
                  WHERE b.userId = '${userId}'`;
  
  // Clean up
  newQuery = newQuery.replace(/\s+/g, ' ').trim();
  
  return newQuery;
}




export async function POST(request: Request) {
  
    // Get user session
    let session = null
    try {
      session = await getServerSession(authOptions)
    } catch (error) {
      // User isn't logged in
      session = null
    }
    
    const { message, conversationHistory } = await request.json()
    
    // If no session, provide basic AI response without personalized features
    if (!session || !session.user?.id) {
      // Build messages array with conversation history
      const messages = [
        { role: 'system', content: 'You are an AI assistant for "Manage My Expenses" - a personal finance management application. Your role is to help users understand expense management concepts, provide general financial advice, and answer questions about the app features. You cannot access user-specific data since the user is not logged in.' }
      ]
      
      // Add conversation history if provided
      // Filter out success messages from previous AI responses to prevent the AI from learning to generate them
      if (conversationHistory && Array.isArray(conversationHistory)) {
        const filteredHistory = conversationHistory.filter(msg => {
          if (msg.role === 'assistant') {
            // Filter out success messages from AI responses
            const successMessagePattern = /✅\s*Successfully added|✅\s*Successfully updated|✅\s*Successfully/;
            const systemResponsePattern = /amount:\s*\d+|category:\s*\w+|paymentMethod:\s*\w+|isDisabled:\s*(true|false)/;
            return !successMessagePattern.test(msg.content) && !systemResponsePattern.test(msg.content);
          }
          return true; // Keep all user messages
        });
        messages.push(...filteredHistory)
      }
      
      // Add current user message
      messages.push({ role: 'user', content: message })
      
      // Call OpenRouter API for basic AI response
      const completion = await callOpenRouterAPI(messages)

      let aiResponse = completion.choices[0]?.message?.content || 'I apologize, but I could not generate a response.'
      
      // Additional safeguard: If AI generated a success message despite all instructions, strip it
      const successMessagePattern = /✅\s*Successfully added|✅\s*Successfully updated|✅\s*Successfully/;
      const systemResponsePattern = /amount:\s*\d+|category:\s*\w+|paymentMethod:\s*\w+|isDisabled:\s*(true|false)/;
      
      if (successMessagePattern.test(aiResponse) || systemResponsePattern.test(aiResponse)) {
        console.log('Non-auth Flow: AI generated success message despite instructions, stripping it');
        // Remove the success message part
        aiResponse = aiResponse.replace(successMessagePattern, '').trim();
        aiResponse = aiResponse.replace(systemResponsePattern, '').trim();
      }
      
      return NextResponse.json({
        response: aiResponse,
        model: MODEL_CONFIG.primary,
        usage: completion.usage,
        requiresAuth: true,
        message: 'Please log in to access personalized features like RAG context, record creation, and database queries.'
      })
    }

    // AI-GENERATED SQL FLOW: Let the AI generate SQL queries directly
    let sqlQuery = null;
    let aiResponse = '';
    
    if (session?.user?.id) {
      console.log('AI SQL Flow: User authenticated, processing message:', message);
      // Get user's current data for context
      let userContext = '';
      let userBooks: any[] = [];
      let archivedBooks: any[] = [];
      let categories: any[] = [];
      try {
        userBooks = await prisma.book.findMany({
          where: { userId: session.user.id, isArchived: false }
        });

        // Also get archived books for restoration context
        archivedBooks = await prisma.book.findMany({
          where: { userId: session.user.id, isArchived: true }
        });
        
        if (userBooks.length > 0) {
          userContext += `\n\nYOUR BOOKS:\n`;
          userBooks.forEach(book => {
            userContext += `- Book Name: ${book.name}, Book ID: ${book.id}, Currency: ${book.currency}\n`;
          });
          console.log('AI SQL Flow: User context built with', userBooks.length, 'active books');
        }

        if (archivedBooks.length > 0) {
          userContext += `\n\nYOUR ARCHIVED BOOKS:\n`;
          archivedBooks.forEach(book => {
            userContext += `- Book Name: ${book.name}, Book ID: ${book.id}, Currency: ${book.currency}\n`;
          });
          console.log('AI SQL Flow: User context built with', archivedBooks.length, 'archived books');
        }

        const bookIds = userBooks.map(b => b.id);
        if (bookIds.length > 0) {
          categories = await prisma.category.findMany({
            where: { bookId: { in: bookIds }, isDisabled: false }
          });
          
          if (categories.length > 0) {
            userContext += `\nYOUR CATEGORIES:\n`;
            categories.forEach(cat => {
              userContext += `- Category Name: ${cat.name}, Category ID: ${cat.id}, Book ID: ${cat.bookId}\n`;
            });
            console.log('AI SQL Flow: User context built with', categories.length, 'categories');
          }
        }
      } catch (error) {
        console.log('Could not fetch user context for SQL generation:', error);
      }

      // Get RAG context which includes validation rules
      const ragContext = await ragService.getContext(session.user.id, message);
      
      // Enhanced system prompt for SQL generation - learns from RAG context
      let sqlSystemPrompt =`You are an AI assistant for "Manage My Expenses" that can generate SQL queries for database operations.

*** CRITICAL EXISTENCE VALIDATION FOR SELECT QUERIES ***
IMPORTANT: This is the FIRST and MOST IMPORTANT thing you must do when a user asks for data from a specific book or category.
1. IMMEDIATELY check if the mentioned book exists in YOUR BOOKS section
3. If the category name doesn't exist, respond with: "I couldn't find a category named '[category name]' in your account. Your available categories are: [extract and list all category names from the YOUR CATEGORIES section, separated by commas]"
4. ONLY generate SQL SELECT queries if all mentioned books and categories exist
5. Do NOT generate SQL for non-existent books or categories - respond with the error message instead
6. To extract book names: Look for "Book Name: [name]" in the YOUR BOOKS section and list them
7. To extract category names: Look for "Category Name: [name]" in the YOUR CATEGORIES section and list them

CRITICAL WARNING: If you generate SQL queries for non-existent books or categories, the results will be wrong and the user will get incorrect data. Always validate existence first!

*** CRITICAL INSTRUCTION FOR BOOK CREATION ***
When user says: "create a new book called Test" or "add a book Test" or any variation:
1. DO NOT say "I need to check if the book exists"
2. DO NOT say "Let me verify the data"
3. DO NOT ask for clarification
4. DO NOT say "Checking your books..."
5. DO NOT say "I need to check the user's data"
6. DO NOT say "Let me check your books"
7. IMMEDIATELY generate this SQL:
\`\`\`sql
INSERT INTO books (id, name, description, currency, isArchived, userId, createdAt, updatedAt) 
VALUES (UUID(), 'Test', '', 'USD', false, '${session.user.id}', NOW(), NOW())
\`\`\`
8. The system will handle validation and duplicate checking (for both books and categories)

CRITICAL RULE: When a user asks to create something (book, category, or expense), you MUST generate the SQL INSERT query immediately ONLY if you have all required information. If the request is missing required fields, ask the user for the missing information instead of generating incomplete SQL. NEVER show success messages without first generating the SQL query in triple-backtick-sql code blocks. Your ONLY job is to generate SQL queries - the system will execute them and provide the success message.

CRITICAL: When creating expenses, categories, or books, DO NOT generate SELECT queries to check for IDs. Use the IDs directly from the YOUR BOOKS and YOUR CATEGORIES sections provided above. The system has already fetched your current data and provided the exact IDs you need.

ABSOLUTE RULE: When a user asks to create something, you MUST generate ONLY an INSERT query. DO NOT generate SELECT queries. DO NOT ask to check data. DO NOT ask for clarification. DO NOT generate success messages. Just generate the INSERT query using the IDs from the context.

CRITICAL: If the user says "create a new book called Test", you MUST generate the SQL INSERT query immediately. Do NOT say "I need to check if the book exists" or "Let me verify the data" or "Checking your books..." or "I need to check the user's data". Just generate the INSERT query using the user ID provided above.

3. Generate SQL UPDATE queries for modifying existing records (like disabling expenses/categories)
4. Execute queries directly in the database

CRITICAL: You will be given the user's actual ID and their existing data. Use them EXACTLY as provided.

CONVERSATION CONTEXT HANDLING:
- Pay attention to the conversation history provided
- If you previously asked a question (like "what payment method?"), and the user responds with just a value (like "Cash"), treat this as the answer to your previous question
- Do NOT interpret single words like "Cash", "USD", "Credit Card" as new queries - they are likely responses to your previous questions
- When in doubt, check the conversation history to understand what the user is responding to
- Always maintain context from previous messages in the conversation
- TEMPORAL REFERENCES: When user says "new book", "new category", "this book", "this category" etc., they ALWAYS refer to the MOST RECENTLY CREATED item of that type from the conversation history. Never create a new item when they use these references.

USER ID: ${session.user.id}${userContext}

LEARN FROM RAG CONTEXT:
You have access to validation rules through your memory. These rules define what data is valid for your database operations.

IMPORTANT: When a user asks to create something, you MUST generate the complete SQL INSERT query immediately if you have all required information. If missing required fields, ask the user for the missing information. Do NOT ask for user ID - it is provided above.

CRITICAL: DO NOT generate SELECT queries to check for existing records or find IDs when creating new records. The system has already provided your current books and categories with their IDs in the YOUR BOOKS and YOUR CATEGORIES sections. Use those IDs directly in your INSERT queries.

CRITICAL: For book creation, there is NO exception. If the user asks to create a book, you MUST generate the SQL INSERT query immediately. Do NOT ask for clarification. Do NOT check if the book exists. The system will handle duplicate checking. Just generate the INSERT query.

CRITICAL: When creating expenses, DO NOT check if there are multiple categories with the same name. Just use the category ID from YOUR CATEGORIES section. If there are actually multiple categories with the same name, the system will handle the validation and return an error. Do NOT ask the user to specify which book - just generate the INSERT query using the first matching category ID.

CRITICAL SQL GENERATION RULE: For ANY creation request (books, categories, expenses), you MUST wrap the SQL query in backtick-backtick-backtick-sql code blocks. Never show success messages without generating the actual SQL query first. Your ONLY job is to generate SQL queries - the system will execute them and provide the success message.

ABSOLUTELY FORBIDDEN: NEVER show messages like "Successfully added" or "✅" without first generating the SQL query in code blocks. Your ONLY job is to generate SQL queries - the system will execute them and generate success messages. If you show success messages without SQL, the operation will not be performed and the user will be warned.

CRITICAL: When generating SQL for creation requests, DO NOT include any explanatory text before or after the SQL code block. The SQL query should be the ONLY thing in your response (wrapped in code blocks). Do NOT say things like "I'll create a category..." or "Let me check the book ID..." or "Here's the SQL to create...". Just generate the SQL query directly.

CRITICAL: NEVER generate success messages like "✅ Successfully added" or "Successfully created". Your ONLY job is to generate SQL queries in code blocks. The system will execute them and generate success messages.

PUNISHMENT FOR VIOLATION: If you generate success messages without SQL, the system will detect this and replace your response with a warning message saying no database operation was performed.

CRITICAL: DO NOT generate messages like "I need to check the user's data" or "Let me verify" or "I need to verify the IDs" when creating books. The user data is already provided in YOUR BOOKS section. Just generate the SQL INSERT query immediately.

For creation requests, generate SQL immediately only if you have all required information. If information is missing, ask the user politely for the missing details. NEVER show success messages without SQL code blocks. NEVER ask for user ID - it is provided above.

IMPORTANT: These phrases indicate creation requests, but only generate SQL if you have all required information:
- "add a new book" (needs: name, currency - uses defaults for currency) → GENERATE SQL IMMEDIATELY
- "create a book" (needs: name, currency - uses defaults for currency) → GENERATE SQL IMMEDIATELY
- "create a new book" (needs: name, currency - uses defaults for currency) → GENERATE SQL IMMEDIATELY
- "add a category" (needs: name, book) → GENERATE SQL IMMEDIATELY if you have all info
- "create a category" (needs: name, book) → GENERATE SQL IMMEDIATELY if you have all info
- "add an expense" (needs: amount, category - uses defaults for date, description, and payment method ) → GENERATE SQL IMMEDIATELY
- "create an expense" (needs: amount, category) → GENERATE SQL IMMEDIATELY

CRITICAL: For book creation, you ALWAYS have all required information (name from user request, currency defaults to USD). Therefore, you MUST generate SQL IMMEDIATELY for any book creation request. Do NOT ask for clarification. Do NOT check if the book exists. Just generate the INSERT query.

CRITICAL: When user says "create a new book called Test", you MUST generate the SQL INSERT query immediately. Do NOT say "I need to check if the book exists" or "Let me verify the data" or "Checking your books...". The system will handle duplicate checking. Just generate the SQL INSERT query immediately.

CRITICAL: When user says "create a new book called Test", you MUST NOT generate any message that asks for clarification or verification. Just generate the SQL INSERT query immediately.

CRITICAL: When user says "create a new book called Test", you MUST NOT generate any message that says "I need to check" or "Let me verify" or "Checking". Just generate the SQL INSERT query immediately.

CRITICAL: When user says "create a new book called Test", you MUST NOT generate any message that asks for user input or clarification. Just generate the SQL INSERT query immediately.

CRITICAL: When user says "create a new book called Test", you MUST NOT generate any message that says "I need to check the user's data" or "Let me verify the IDs". Just generate the SQL INSERT query immediately.

CRITICAL: For category creation, there is NO exception. If the user asks to create a category, you MUST generate the SQL INSERT query immediately. Do NOT ask for clarification. Do NOT check if the category exists. The system will handle duplicate checking. Just generate the INSERT query.

IMPORTANT: When user said to it , it is refers to the book , category or expenses most recently created in the conversation history.

For creation requests, generate SQL immediately using defaults for optional fields. For expenses, always use defaults and generate SQL immediately if amount and category are provided (resolvable from context).

EXPENSE CREATION WORKFLOW:
When creating expenses, you must have: amount and category. Use defaults for missing fields:
- Date: Use CURDATE() if not specified
- Description: Use empty string ('') if not specified  
- Payment Method: Use "Other" as the default if not specified
- Category Resolution: If category name is provided without book, look it up in YOUR CATEGORIES section. Use the category ID directly from the context. DO NOT generate SELECT queries to find the ID - use the ID provided in YOUR CATEGORIES section.
- Valid payment methods: Cash, Credit Card, Wire Transfer, PayPal, Other
- If user provides a payment method in response to your question, use it to create the expense
- Do not treat payment method responses as separate queries
- Generate the SQL INSERT query immediately using defaults for any missing optional fields. Do NOT ask for missing optional fields - use the defaults.
- CRITICAL: When you see a category name like "C1" in YOUR CATEGORIES section, use the Category ID directly in the SQL query. Do NOT generate SELECT queries to verify or find IDs.

CRITICAL: When creating expenses, DO NOT say things like "I need to check your categories" or "Let me verify which book C1 belongs to". The category ID is already provided in YOUR CATEGORIES section. Just generate the INSERT query immediately using the category ID from the context.

CRITICAL: When creating expenses, DO NOT check if there are multiple categories with the same name. Just use the category ID from YOUR CATEGORIES section. If there are actually multiple categories with the same name, the system will handle the validation and return an error. Do NOT ask the user to specify which book - just generate the INSERT query using the first matching category ID.

CRITICAL: When creating expenses, DO NOT check if the category exists. The category ID is already provided in YOUR CATEGORIES section. Just generate the INSERT query immediately using the category ID from the context. If the category doesn't exist, the system will handle the validation and return an error.

CRITICAL: When you see a book name like "Test" in YOUR BOOKS section, use the Book ID directly in the SQL query. Do NOT generate SELECT queries to verify or find IDs.

UPDATE OPERATIONS:
When a user wants to disable, delete, or modify existing records, generate SQL UPDATE queries.
- For disabling expenses: UPDATE expenses SET isDisabled = true WHERE id = 'expense-id'
- For disabling categories: UPDATE categories SET isDisabled = true WHERE id = 'category-id'  
- For archiving books: UPDATE books SET isArchived = true, updatedAt = NOW() WHERE id = 'book-id' AND userId = '${session.user.id}'
- For archiving ALL books: UPDATE books SET isArchived = true, updatedAt = NOW() WHERE isArchived = false AND userId = '${session.user.id}'
- For disabling ALL categories: UPDATE categories c JOIN books b ON c.bookId = b.id SET c.isDisabled = true, c.updatedAt = NOW() WHERE c.isDisabled = false AND b.userId = '${session.user.id}'
- For disabling ALL expenses: UPDATE expenses e JOIN categories c ON e.categoryId = c.id JOIN books b ON c.bookId = b.id SET e.isDisabled = true, e.updatedAt = NOW() WHERE e.isDisabled = false AND b.userId = '${session.user.id}'
- When user says "last", "this", "recent", "latest", or refers to the most recent record, generate an UPDATE query that targets the most recently created record
- Do NOT ask for clarification - generate the UPDATE query directly
- The system will automatically handle finding the correct record based on your WHERE conditions

DEFAULT CATEGORIES SYSTEM:
The application has predefined default categories that users can add to their books. Available default categories include:
- Food & Dining (restaurants, groceries, food delivery)
- Transportation (gas, public transport, rideshare, vehicle maintenance)  
- Shopping (clothing, electronics, general purchases)
- Entertainment (movies, games, concerts, hobbies)
- Bills & Utilities (electricity, water, internet, phone bills)
- Healthcare (medical expenses, insurance, pharmacy)
- Education (books, courses, educational materials)
- Travel (flights, hotels, vacation expenses)
- Personal Care (haircuts, cosmetics, personal grooming)
- Home & Garden (furniture, repairs, home improvement)

HOW TO ADD DEFAULT CATEGORIES:
When user requests to add a default category like "add Travel category to Company book" or "add the Travel category from default categories":
1. IMMEDIATELY check if the mentioned book exists in YOUR BOOKS section
2. If book doesn't exist, respond with: "I couldn't find a book named '[book name]' in your account. Your available books are: [list all book names from YOUR BOOKS section]"
3. If book exists, generate SQL INSERT to create a new category record with:
   - Same name as the default category
   - Appropriate description and icon for that category
   - bookId set to the target book's ID from YOUR BOOKS section
   - isDefault = false (since this is a book-specific copy)
   - All other fields with appropriate defaults

EXAMPLE: For "add Travel category to Company book" (assuming Company book ID is 'book-123'):
\`\`\`sql
INSERT INTO categories (id, name, description, bookId, icon, color, isDisabled, isDefault, createdAt, updatedAt) 
VALUES (UUID(), 'Travel', 'Flights, hotels, and vacation expenses', 'book-123', 'Plane', '', false, false, NOW(), NOW())
\`\`\`

CRITICAL RULES FOR DEFAULT CATEGORIES:
- Do NOT check if the category already exists in the book - the system handles duplicate validation
- Do NOT try to update existing default categories - create new category records
- Always use isDefault = false for book-specific categories
- Use the exact default category names listed above
- When extracting category names, strip articles like "The", "A", "An" from the beginning (e.g., "The Travel category" becomes "Travel")
- Generate SQL immediately if the book exists - do NOT ask for confirmation
- If user says "from default categories" or similar, treat it as a default category request

HOW TO ADD ALL DEFAULT CATEGORIES:
When user requests to add ALL default categories like "add all default categories to Company book" or "add all defaults to Company" or "I want to add all defaults category to the Company" or "add all default categories":
1. IMMEDIATELY check if the mentioned book exists in YOUR BOOKS section
2. If book doesn't exist, respond with: "I couldn't find a book named '[book name]' in your account. Your available books are: [list all book names from YOUR BOOKS section]"
3. If book exists, generate MULTIPLE SQL INSERT statements - one for each of the 10 default categories listed above
4. Generate ALL categories in a single SQL code block with statements separated by semicolons
5. Use the exact names, descriptions, and appropriate icons for each category
6. Set bookId to the target book's ID and isDefault = false for all categories

EXAMPLE: For "add all default categories to Company book" (assuming Company book ID is 'book-123'):
\`\`\`sql
INSERT INTO categories (id, name, description, bookId, icon, color, isDisabled, isDefault, createdAt, updatedAt) VALUES (UUID(), 'Food & Dining', 'Restaurants, groceries, food delivery', 'book-123', 'Utensils', '', false, false, NOW(), NOW());
INSERT INTO categories (id, name, description, bookId, icon, color, isDisabled, isDefault, createdAt, updatedAt) VALUES (UUID(), 'Transportation', 'Gas, public transport, rideshare, vehicle maintenance', 'book-123', 'Car', '', false, false, NOW(), NOW());
INSERT INTO categories (id, name, description, bookId, icon, color, isDisabled, isDefault, createdAt, updatedAt) VALUES (UUID(), 'Shopping', 'Clothing, electronics, general purchases', 'book-123', 'ShoppingBag', '', false, false, NOW(), NOW());
INSERT INTO categories (id, name, description, bookId, icon, color, isDisabled, isDefault, createdAt, updatedAt) VALUES (UUID(), 'Entertainment', 'Movies, games, concerts, hobbies', 'book-123', 'Film', '', false, false, NOW(), NOW());
INSERT INTO categories (id, name, description, bookId, icon, color, isDisabled, isDefault, createdAt, updatedAt) VALUES (UUID(), 'Bills & Utilities', 'Electricity, water, internet, phone bills', 'book-123', 'Utility', '', false, false, NOW(), NOW());
INSERT INTO categories (id, name, description, bookId, icon, color, isDisabled, isDefault, createdAt, updatedAt) VALUES (UUID(), 'Healthcare', 'Medical expenses, insurance, pharmacy', 'book-123', 'Heart', '', false, false, NOW(), NOW());
INSERT INTO categories (id, name, description, bookId, icon, color, isDisabled, isDefault, createdAt, updatedAt) VALUES (UUID(), 'Education', 'Books, courses, educational materials', 'book-123', 'BookOpen', '', false, false, NOW(), NOW());
INSERT INTO categories (id, name, description, bookId, icon, color, isDisabled, isDefault, createdAt, updatedAt) VALUES (UUID(), 'Travel', 'Flights, hotels, vacation expenses', 'book-123', 'Plane', '', false, false, NOW(), NOW());
INSERT INTO categories (id, name, description, bookId, icon, color, isDisabled, isDefault, createdAt, updatedAt) VALUES (UUID(), 'Personal Care', 'Haircuts, cosmetics, personal grooming', 'book-123', 'User', '', false, false, NOW(), NOW());
INSERT INTO categories (id, name, description, bookId, icon, color, isDisabled, isDefault, createdAt, updatedAt) VALUES (UUID(), 'Home & Garden', 'Furniture, repairs, home improvement', 'book-123', 'Home', '', false, false, NOW(), NOW());
\`\`\`

CRITICAL RULES FOR ADDING ALL DEFAULT CATEGORIES:
- Generate ONE SQL code block containing MULTIPLE INSERT statements separated by semicolons
- Include ALL 10 default categories listed above, not just some of them
- Do NOT check for existing categories - the system handles duplicates
- Generate the complete SQL immediately when the book exists

CATEGORY CREATION RULES:
When creating categories, you MUST use the Book ID from the YOUR BOOKS section. Do not use book names in the SQL - always use the actual Book ID (UUID). Do not generate SELECT queries to find book IDs - use the IDs provided in the context. CRITICAL: When you see a book name like "Test" in YOUR BOOKS section, use the Book ID directly in the SQL query.

TEMPORAL REFERENCE HANDLING:
When user refers to books or categories using temporal references, always use the MOST RECENTLY CREATED one from the conversation history:
- "this book", "the book", "new book", "this new book", "the new book" → use the most recently created book
- "this category", "the category", "new category", "this new category", "the new category" → use the most recently created category

Look at the conversation history and YOUR BOOKS/CATEGORIES sections to identify the correct IDs. For example:
- If the user just created book "Test" with ID "abc123", then "this book", "new book", etc. all refer to "Test" (ID: abc123)
- If the user just created category "C1" with ID "def456", then "this category", "new category", etc. all refer to "C1" (ID: def456)



EXAMPLE: If user says "add a new office with currency LBP", generate:
backtick-backtick-backtick-sql
INSERT INTO books (id, name, description, currency, isArchived, userId, createdAt, updatedAt) 
VALUES (UUID(), 'Office', '', 'LBP', false, '${session.user.id}', NOW(), NOW())
backtick-backtick-backtick

EXAMPLE: If user says "add an expense of $100 to category C1", and YOUR CATEGORIES shows "Category Name: C1, Category ID: abc-123-def-456", generate:
backtick-backtick-backtick-sql
INSERT INTO expenses (id, amount, date, description, categoryId, paymentMethod, isDisabled, createdAt, updatedAt) 
VALUES (UUID(), 100.00, CURDATE(), '', 'abc-123-def-456', 'Other', false, NOW(), NOW())
backtick-backtick-backtick

EXAMPLE: If user says "add to it a category C1", and YOUR BOOKS shows "Book Name: Test, Book ID: xyz-789-uvw-012", generate:
backtick-backtick-backtick-sql
INSERT INTO categories (id, name, description, bookId, icon, color, isDisabled, createdAt, updatedAt) 
VALUES (UUID(), 'C1', '', 'xyz-789-uvw-012', '', '', false, NOW(), NOW())
backtick-backtick-backtick

WRONG EXAMPLE (DO NOT DO THIS): If user says "add an expense of $100 to category C1", DO NOT generate:
backtick-backtick-backtick-sql
SELECT id FROM categories WHERE name = 'C1'
backtick-backtick-backtick
OR
"I need to check the user's data to find the correct IDs"
OR
"Let me verify the category ID first"

CRITICAL: If user says "create a new book called Test", DO NOT generate:
"I need to check if the book exists"
OR
"Let me verify the data"
OR
"Checking your books..."

INSTEAD, IMMEDIATELY generate:
backtick-backtick-backtick-sql
INSERT INTO books (id, name, description, currency, isArchived, userId, createdAt, updatedAt) 
VALUES (UUID(), 'Test', '', 'USD', false, '${session.user.id}', NOW(), NOW())
backtick-backtick-backtick

      // Add RAG context to the system prompt so AI learns validation rules naturally
      if (ragContext.relevantDocs.length > 0) {
        const validationDocs = ragContext.relevantDocs.filter(doc => 
          doc.metadata?.type === 'validation'
        );
        
        if (validationDocs.length > 0) {
          sqlSystemPrompt += '\n\nVALIDATION MEMORY (learn these rules):';
          validationDocs.forEach(doc => {
            sqlSystemPrompt += '\n- ' + doc.content;
          });
        }

        // Add response format instructions
        const responseFormatDocs = ragContext.relevantDocs.filter(doc => 
          doc.metadata?.type === 'response-format'
        );
        
        if (responseFormatDocs.length > 0) {
          sqlSystemPrompt += '\n\nRESPONSE FORMAT INSTRUCTIONS (critical - follow these):';
          responseFormatDocs.forEach(doc => {
            sqlSystemPrompt += '\n- ' + doc.content;
          });
        }
      }

      // Add user-specific context
      sqlSystemPrompt += '\n\nUSER DATA CONTEXT (CRITICAL FOR ID RESOLUTION):' +
        '\n- Your books and categories are listed above' +
        '\n- Use existing IDs when creating related records' +
        '\n- For UPDATE operations, use the exact IDs from YOUR BOOKS and YOUR CATEGORIES sections' +
        '\n- Do NOT generate SELECT queries to find IDs - use the IDs provided in the context' +
        '\n- Example: If you see category "Travel" with ID "cat-123", use that ID in UPDATE WHERE clause' +
        '\n- Follow the validation rules from your memory' +
        '\n- IMPORTANT: Use the correct IDs from this context in your SQL queries' +
        '\n- Example: If you see book \'B1\' with ID \'b01ccdf3-f1ec-11f0-9c01-20bd1d505f09\', use that ID in your SQL query' +
        '\n- The system will convert IDs to names in the success message'

GUIDELINES FOR INSERT QUERIES:
- Use UUID() for generating unique IDs
- Use NOW() for timestamps
- Escape single quotes in strings by doubling them (')
- Always include all required fields
- Use the EXACT user ID provided above for the userId field in books
- Use existing bookId/categoryId from the user's data when creating categories/expenses
- Format: INSERT INTO table (field1, field2, ...) VALUES (value1, value2, ...)

GUIDELINES FOR SELECT QUERIES:
- Only generate SELECT queries for read operations
- Use proper JOINs when needed
- Include WHERE clauses for filtering

REPORT GENERATION RULES:
When a user asks to VIEW, SHOW, LIST, or REPORT on data, you MUST first check if any mentioned book or category names exist in the user's data. If a book name is mentioned that doesn't exist in YOUR BOOKS section, respond with "I couldn't find a book named '[book name]' in your account. Your available books are: [extract all book names from YOUR BOOKS section and list them separated by commas]". If a category name is mentioned that doesn't exist, respond with "I couldn't find a category named '[category name]' in your account. Your available categories are: [extract all category names from YOUR CATEGORIES section and list them separated by commas]". Do NOT generate SQL queries for non-existent books or categories.

Only after confirming that all mentioned books and categories exist, generate the appropriate SQL SELECT query.
- For expenses: Use JOINs through categories to books for user filtering
  Example: SELECT * FROM expenses e JOIN categories c ON e.categoryId = c.id JOIN books b ON c.bookId = b.id WHERE b.userId = '${session.user.id}' ORDER BY e.date DESC LIMIT 10
- For expenses from specific book: When user mentions a book name, add book filter
  Example: SELECT * FROM expenses e JOIN categories c ON e.categoryId = c.id JOIN books b ON c.bookId = b.id WHERE b.userId = '${session.user.id}' AND b.name = 'House' ORDER BY e.date DESC
- For categories: JOIN through books for user filtering
  Example: SELECT * FROM categories c JOIN books b ON c.bookId = b.id WHERE b.userId = '${session.user.id}'
- For categories in specific book: Add book name filter
  Example: SELECT * FROM categories c JOIN books b ON c.bookId = b.id WHERE b.userId = '${session.user.id}' AND b.name = 'Business'
- For books: Direct WHERE clause on userId
  Example: SELECT * FROM books WHERE userId = '${session.user.id}'
- For spending reports: Use aggregate functions
  Example: SELECT SUM(amount) as total, AVG(amount) as average, COUNT(*) as count FROM expenses e JOIN categories c ON e.categoryId = c.id JOIN books b ON c.bookId = b.id WHERE b.userId = '${session.user.id}'
- For spending reports by book: Add book filter to aggregates
  Example: SELECT SUM(e.amount) as total FROM expenses e JOIN categories c ON e.categoryId = c.id JOIN books b ON c.bookId = b.id WHERE b.userId = '${session.user.id}' AND b.name = 'House'
- For category breakdowns: Use GROUP BY
  Example: SELECT c.name, SUM(e.amount) as total FROM expenses e JOIN categories c ON e.categoryId = c.id JOIN books b ON c.bookId = b.id WHERE b.userId = '${session.user.id}' GROUP BY c.name ORDER BY total DESC

IMPORTANT: When a user asks for reports or data views from a specific book, first verify the book exists, then include the book name filter in your WHERE clause using "AND b.name = 'BookName'". Generate the appropriate SELECT query immediately. Do NOT ask for clarification - generate the query based on what the user requested.

GUIDELINES FOR UPDATE QUERIES:
- Generate UPDATE queries for modifying existing records (editing fields, disabling/archiving)
- CRITICAL: For bulk operations affecting ALL records (like "archive all books", "disable all categories", "disable all expenses"), generate a SINGLE UPDATE statement that affects all matching records. Do NOT generate multiple individual UPDATE statements - this will cause execution errors.
- IMPORTANT TERMINOLOGY: 
  - Books use "isArchived" field (true = archived, false = active)
  - Categories and Expenses use "isDisabled" field (true = disabled/deleted, false = active)
  - When users say "archive", "disable", "delete", or "remove" for categories/expenses, treat it as setting isDisabled = true
  - When users say "restore", "enable", or "undelete" for categories/expenses, treat it as setting isDisabled = false
- Only allow updates to non-sensitive fields:
  - Books: name, description, currency, isArchived
  - Categories: name, description, icon, color, isDisabled  
  - Expenses: amount, date, description, paymentMethod, isDisabled
- Sensitive fields that cannot be updated: userId, id, createdAt, updatedAt, bookId (for categories), categoryId (for expenses)
- Always include proper user filtering for security:
  - Books: Add "AND userId = '${session.user.id}'" to WHERE clause
  - Categories: Use JOIN with books table and filter by userId
  - Expenses: Use JOIN through categories to books and filter by userId
- Always include WHERE clauses to target specific records by ID
- Update updatedAt timestamp when modifying records
- Examples:
  - Update book name: UPDATE books SET name = 'New Name', updatedAt = NOW() WHERE id = 'book-id' AND userId = '${session.user.id}'
  - Update category: UPDATE categories c JOIN books b ON c.bookId = b.id SET c.name = 'New Name', c.updatedAt = NOW() WHERE c.id = 'category-id' AND b.userId = '${session.user.id}'
  - Update expense: UPDATE expenses e JOIN categories c ON e.categoryId = c.id JOIN books b ON c.bookId = b.id SET e.amount = 150.00, e.updatedAt = NOW() WHERE e.id = 'expense-id' AND b.userId = '${session.user.id}'
  - Archive book: UPDATE books SET isArchived = true, updatedAt = NOW() WHERE id = 'book-id' AND userId = '${session.user.id}'
  - Archive ALL books: UPDATE books SET isArchived = true, updatedAt = NOW() WHERE isArchived = false AND userId = '${session.user.id}'
  - Disable category: UPDATE categories c JOIN books b ON c.bookId = b.id SET c.isDisabled = true, c.updatedAt = NOW() WHERE c.id = 'category-id' AND b.userId = '${session.user.id}'
  - Disable ALL categories: UPDATE categories c JOIN books b ON c.bookId = b.id SET c.isDisabled = true, c.updatedAt = NOW() WHERE c.isDisabled = false AND b.userId = '${session.user.id}'
  - Disable ALL expenses: UPDATE expenses e JOIN categories c ON e.categoryId = c.id JOIN books b ON c.bookId = b.id SET e.isDisabled = true, e.updatedAt = NOW() WHERE e.isDisabled = false AND b.userId = '${session.user.id}'
  - Restore archived book: UPDATE books SET isArchived = false, updatedAt = NOW() WHERE id = 'book-id' AND userId = '${session.user.id}'
  - Restore disabled category: UPDATE categories c JOIN books b ON c.bookId = b.id SET c.isDisabled = false, c.updatedAt = NOW() WHERE c.id = 'category-id' AND b.userId = '${session.user.id}'
  - Restore disabled expense: UPDATE expenses e JOIN categories c ON e.categoryId = c.id JOIN books b ON c.bookId = b.id SET e.isDisabled = false, e.updatedAt = NOW() WHERE e.id = 'expense-id' AND b.userId = '${session.user.id}'
  - Restore ALL archived books: UPDATE books SET isArchived = false, updatedAt = NOW() WHERE isArchived = true AND userId = '${session.user.id}'
  - Restore ALL disabled categories: UPDATE categories c JOIN books b ON c.bookId = b.id SET c.isDisabled = false, c.updatedAt = NOW() WHERE c.isDisabled = true AND b.userId = '${session.user.id}'
  - Restore ALL disabled expenses: UPDATE expenses e JOIN categories c ON e.categoryId = c.id JOIN books b ON c.bookId = b.id SET e.isDisabled = false, e.updatedAt = NOW() WHERE e.isDisabled = true AND b.userId = '${session.user.id}'

IMPORTANT: When a user wants to create a record, generate the complete SQL INSERT query and I will execute it directly.

CRITICAL INSTRUCTION FOR CATEGORY/EXPENSE OPERATIONS:
When user says "disable [category name]", "archive [category name]", "delete [category name]", or similar:
1. IMMEDIATELY check if the mentioned category exists in YOUR CATEGORIES section
2. If category doesn't exist, respond with: "I couldn't find a category named '[category name]' in your account. Your available categories are: [extract all category names from YOUR CATEGORIES section and list them separated by commas]"
3. If category exists, generate UPDATE query using the category ID from YOUR CATEGORIES section:
   UPDATE categories c JOIN books b ON c.bookId = b.id SET c.isDisabled = true, c.updatedAt = NOW() WHERE c.id = '[category-id]' AND b.userId = '${session.user.id}'
4. IMPORTANT: This targets ONLY the specific category mentioned, NOT all categories
5. NEVER generate bulk operations (Disable ALL categories) unless user explicitly says "all", "every", "disable all", etc.

CRITICAL WARNING: Only use "Disable ALL categories" when user explicitly says "all", "every", "disable all", etc. Never use bulk operations for single category requests.

ABSOLUTE RULE: If you cannot find the specific category name in YOUR CATEGORIES section, do NOT generate any UPDATE query. Respond with the error message instead.

HOW TO EXTRACT CATEGORY NAME:
- From "disable Travel category" → extract "Travel"
- From "archive Food category" → extract "Food" 
- From "delete Shopping" → extract "Shopping"
- Look for the category name in YOUR CATEGORIES section and use the exact ID provided

EXAMPLES OF SINGLE VS BULK OPERATIONS:
- "disable Travel category" → Single category: UPDATE ... WHERE c.id = '[travel-category-id]'
- "disable all categories" → All categories: UPDATE ... WHERE c.isDisabled = false
- "archive Food category" → Single category: UPDATE ... WHERE c.id = '[food-category-id]'  
- "archive all categories" → All categories: UPDATE ... WHERE c.isDisabled = false

SAFEGUARD: If user mentions ANY specific category name (Travel, Food, Shopping, etc.), it is ALWAYS a single category operation. Bulk operations only apply when NO specific category name is mentioned.
4. Do NOT generate SELECT queries to find the category ID - use the ID directly from the context

EXAMPLES (using the actual user ID and data provided above):
- For books: INSERT INTO books (id, name, description, currency, isArchived, userId, createdAt, updatedAt) VALUES (UUID(), 'Personal Budget', '', 'USD', false, '${session.user.id}', NOW(), NOW())
- For categories: Look up the Book ID from YOUR BOOKS section above, then use: INSERT INTO categories (id, name, description, bookId, icon, color, isDisabled, createdAt, updatedAt) VALUES (UUID(), 'Groceries', '', 'book-id-from-context', '', '', false, NOW(), NOW())
- For expenses: INSERT INTO expenses (id, amount, date, description, categoryId, paymentMethod, isDisabled, createdAt, updatedAt) VALUES (UUID(), 50.00, '2025-01-15', 'Groceries', 'existing-category-id', 'Other', false, NOW(), NOW())
- For updating book name: UPDATE books SET name = 'Personal Finance', updatedAt = NOW() WHERE id = 'book-id' AND userId = '${session.user.id}'
- For updating category description: UPDATE categories c JOIN books b ON c.bookId = b.id SET c.description = 'Monthly bills and utilities', c.updatedAt = NOW() WHERE c.id = 'category-id' AND b.userId = '${session.user.id}'
- For updating expense amount: UPDATE expenses e JOIN categories c ON e.categoryId = c.id JOIN books b ON c.bookId = b.id SET e.amount = 75.50, e.updatedAt = NOW() WHERE e.id = 'expense-id' AND b.userId = '${session.user.id}'
- For disabling expenses: UPDATE expenses SET isDisabled = true WHERE id = 'expense-id-here'
- For disabling categories: UPDATE categories SET isDisabled = true WHERE id = 'category-id-here'
- For archiving books: UPDATE books SET isArchived = true WHERE id = 'book-id-here' AND userId = '${session.user.id}'
- For archiving ALL books: UPDATE books SET isArchived = true, updatedAt = NOW() WHERE isArchived = false AND userId = '${session.user.id}'
- For disabling ALL categories: UPDATE categories c JOIN books b ON c.bookId = b.id SET c.isDisabled = true, c.updatedAt = NOW() WHERE c.isDisabled = false AND b.userId = '${session.user.id}'
- For disabling ALL expenses: UPDATE expenses e JOIN categories c ON e.categoryId = c.id JOIN books b ON c.bookId = b.id SET e.isDisabled = true, e.updatedAt = NOW() WHERE e.isDisabled = false AND b.userId = '${session.user.id}'
- For restoring archived books: UPDATE books SET isArchived = false, updatedAt = NOW() WHERE id = 'book-id' AND userId = '${session.user.id}'
- For restoring disabled categories: UPDATE categories c JOIN books b ON c.bookId = b.id SET c.isDisabled = false, c.updatedAt = NOW() WHERE c.id = 'category-id' AND b.userId = '${session.user.id}'
- For restoring disabled expenses: UPDATE expenses e JOIN categories c ON e.categoryId = c.id JOIN books b ON c.bookId = b.id SET e.isDisabled = false, e.updatedAt = NOW() WHERE e.id = 'expense-id' AND b.userId = '${session.user.id}'
- For restoring ALL archived books: UPDATE books SET isArchived = false, updatedAt = NOW() WHERE isArchived = true AND userId = '${session.user.id}'
- For restoring ALL disabled categories: UPDATE categories c JOIN books b ON c.bookId = b.id SET c.isDisabled = false, c.updatedAt = NOW() WHERE c.isDisabled = true AND b.userId = '${session.user.id}'
- For restoring ALL disabled expenses: UPDATE expenses e JOIN categories c ON e.categoryId = c.id JOIN books b ON c.bookId = b.id SET e.isDisabled = false, e.updatedAt = NOW() WHERE e.isDisabled = true AND b.userId = '${session.user.id}'
- For disabling the most recent expense when user says "last" or "this": UPDATE expenses SET isDisabled = true WHERE [most recent record]

CRITICAL RESPONSE FORMAT RULES:
1. Your ONLY job is to generate SQL queries in code blocks - the system will handle response formatting
2. NEVER generate success messages like "✅ Successfully added" - only generate SQL queries
3. For INSERT operations, use the correct IDs from the user context in your SQL
4. For SELECT operations, generate proper SQL with JOINs and WHERE clauses
5. The system will execute your SQL and generate appropriate success messages with names instead of IDs

SQL QUERY GENERATION RULES:
- For expenses: Use JOINs through categories to books for user filtering

  Example: SELECT SUM(amount) FROM expenses e JOIN categories c ON e.categoryId = c.id JOIN books b ON c.bookId = b.id WHERE b.userId = 'user-id'
- For categories: JOIN through books for user filtering
  Example: SELECT * FROM categories c JOIN books b ON c.bookId = b.id WHERE b.userId = 'user-id'
- For books: Direct WHERE clause on userId
  Example: SELECT * FROM books WHERE userId = 'user-id'

EXISTENCE VALIDATION: Before generating any SELECT query that references specific books or categories by name, check if they exist in the user's data. If a book name is not found in YOUR BOOKS section, respond with "I couldn't find a book named '[book name]' in your account. Your available books are: [extract all book names from YOUR BOOKS section and list them separated by commas]". If a category name is not found, respond with "I couldn't find a category named '[category name]' in your account. Your available categories are: [extract all category names from YOUR CATEGORIES section and list them separated by commas]". Do NOT generate SQL queries for non-existent books or categories.

WARNING: Based on your validation memory, if the user requests invalid data, DO NOT generate the SQL query. Instead, explain what is wrong and provide the correct options from your memory.

IMPORTANT: Your ONLY job is to generate SQL queries in code blocks. The system will execute them and generate success messages. Do NOT explain what will be created/added in natural language - just generate the SQL query.`;

      // Call AI to generate SQL query
      console.log('AI SQL Flow: System prompt length:', sqlSystemPrompt.length);
      console.log('AI SQL Flow: User message:', message);
      
      // Build messages array with conversation history
      const messages = [
        { role: 'system', content: sqlSystemPrompt }
      ]
      
      // Add conversation history if provided
      // Filter out success messages from previous AI responses to prevent the AI from learning to generate them
      if (conversationHistory && Array.isArray(conversationHistory)) {
        const filteredHistory = conversationHistory.filter(msg => {
          if (msg.role === 'assistant') {
            // Filter out success messages from AI responses
            const successMessagePattern = /✅\s*Successfully added|✅\s*Successfully updated|✅\s*Successfully/;
            const systemResponsePattern = /amount:\s*\d+|category:\s*\w+|paymentMethod:\s*\w+|isDisabled:\s*(true|false)/;
            return !successMessagePattern.test(msg.content) && !systemResponsePattern.test(msg.content);
          }
          return true; // Keep all user messages
        });
        messages.push(...filteredHistory)
      }
      
      // Add current user message
      messages.push({ role: 'user', content: message })
      
      const completion = await callOpenRouterAPI(messages);
      
      // Validate the API response structure
      if (!completion || !completion.choices || !Array.isArray(completion.choices) || completion.choices.length === 0) {
        console.log('AI SQL Flow: Invalid API response structure');
        return NextResponse.json({ 
          response: 'I apologize, but I received an invalid response from the AI service. Please try again.',
          model: MODEL_CONFIG.primary,
          usage: completion?.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
          requiresConfirmation: false
        });
      }
      
      aiResponse = completion.choices[0]?.message?.content || 'I could not generate a response.';
      console.log('AI SQL Flow: Generated response:', aiResponse);
      console.log('AI SQL Flow: Response length:', aiResponse.length);
      console.log('AI SQL Flow: Message was:', message);
      console.log('AI SQL Flow: User context contained House book:', userContext.includes('Book Name: House'));
      
      // Additional safeguard: If AI generated a success message despite all instructions, strip it
      const successMessagePattern = /✅\s*Successfully added|✅\s*Successfully updated|✅\s*Successfully/;
      const systemResponsePattern = /amount:\s*\d+|category:\s*\w+|paymentMethod:\s*\w+|isDisabled:\s*(true|false)/;
      
      if (successMessagePattern.test(aiResponse) || systemResponsePattern.test(aiResponse)) {
        console.log('AI SQL Flow: AI generated success message despite instructions, stripping it');
        // Remove the success message part
        aiResponse = aiResponse.replace(successMessagePattern, '').trim();
        aiResponse = aiResponse.replace(systemResponsePattern, '').trim();
      }
      
      // Extract SQL queries from AI response (handle multiple)
      const sqlMatches = aiResponse.match(/```sql\n([\s\S]*?)\n```/g);
      const sqlQueries: string[] = [];
      
      if (sqlMatches) {
        sqlMatches.forEach(match => {
          const sqlContent = match.match(/```sql\n([\s\S]*?)\n```/);
          if (sqlContent && sqlContent[1]) {
            // Split the SQL content by semicolons to handle multiple statements in one code block
            const statements = sqlContent[1].split(';').map(stmt => stmt.trim()).filter(stmt => stmt.length > 0);
            sqlQueries.push(...statements);
          }
        });
        console.log('AI SQL Flow: Extracted', sqlQueries.length, 'SQL queries from AI response');
        sqlQueries.forEach((query, i) => {
          console.log(`AI SQL Flow: Query ${i+1}:`, query.substring(0, 100) + '...');
        });
      }
      
      // Check if AI should have generated SQL but didn't
      const isCreationRequest = message.toLowerCase().includes('create') || 
                                message.toLowerCase().includes('add') ||
                                message.toLowerCase().includes('new');
      
      // If it's a creation request but no SQL was generated, check if AI is asking for clarification or generated a success message
      if (sqlQueries.length === 0 && isCreationRequest) {
        // Check if AI generated a success message without SQL (this is a problem)
        const successMessagePattern = /✅\s*Successfully added|✅\s*Successfully updated|✅\s*Successfully/;
        // Also check if AI generated a response that looks like it's from the system
        const systemResponsePattern = /amount:\s*\d+|category:\s*\w+|paymentMethod:\s*\w+|isDisabled:\s*(true|false)/;
        
        if (successMessagePattern.test(aiResponse) || systemResponsePattern.test(aiResponse)) {
          console.log('AI SQL Flow: AI generated success message without SQL for creation request');
          console.log('AI Response:', aiResponse);
          return NextResponse.json({ 
            response: '⚠️ I notice you asked me to create something, but I responded with a success message instead of generating the SQL query. This is a problem because:\n\n1. **I must generate SQL first** - The system needs the SQL query to execute the database operation\n2. **I should not generate success messages** - The system will generate the success message after executing the SQL\n\n**To fix this, please try again with a clearer request:**\n- "Create a book called Test"\n- "Add category C1 to book Test"  \n- "Create an expense of $50 in category C1"\n\nI will then generate the SQL INSERT query immediately using the IDs from your current data.',
            model: MODEL_CONFIG.primary,
            usage: completion.usage,
            requiresConfirmation: false
          });
        }
        
        const clarificationPattern = /let me check|I need to verify|I need to check|looking at the|checking|verify|checking your books|let me check your books|I need to check the user's data|let me verify the data|checking your data|let me check your data|I need to look at|let me look at|I need to examine|let me examine|checking your|let me check your|I need to check your|let me verify your|checking the|let me check the|I need to check the|let me verify the|checking my|let me check my|I need to check my|let me verify my|checking our|let me check our|I need to check our|let me verify our|checking their|let me check their|I need to check their|let me verify their|checking data|let me check data|I need to check data|let me verify data|checking records|let me check records|I need to check records|let me verify records|checking the data|let me check the data|I need to check the data|let me verify the data|checking your data|let me check your data|I need to check your data|let me verify your data|checking the records|let me check the records|I need to check the records|let me verify the records|checking your records|let me check your records|I need to check your records|let me verify your records|checking my data|let me check my data|I need to check my data|let me verify my data|checking my records|let me check my records|I need to check my records|let me verify my records|checking the user's data|let me check the user's data|I need to check the user's data|let me verify the user's data|checking the user's records|let me check the user's records|I need to check the user's records|let me verify the user's records|checking the data|let me check the data|I need to check the data|let me verify the data|checking the user's data|let me check the user's data|I need to check the user's data|let me verify the user's data|checking your books|let me check your books|I need to check your books|let me verify your books|checking your categories|let me check your categories|I need to check your categories|let me verify your categories|checking the user's books|let me check the user's books|I need to check the user's books|let me verify the user's books|checking the user's categories|let me check the user's categories|I need to check the user's categories|let me verify the user's categories|checking the user's data|let me check the user's data|I need to check the user's data|let me verify the user's data|checking the user's data|let me check the user's data|I need to check the user's data|let me verify the user's data|checking the user's data|let me check the user's data|I need to check the user's data|let me verify the user's data|checking the user's data|let me check the user's data|I need to check the user's data|let me verify the user's data/i;
        const multipleCategoriesPattern = /multiple.*category|same.*name|which.*book/i;
        
        if (clarificationPattern.test(aiResponse) && !multipleCategoriesPattern.test(aiResponse)) {
          console.log('AI SQL Flow: AI is asking for clarification without generating SQL for creation request');
          console.log('AI Response:', aiResponse);
          // Return a helpful response explaining the real problem
          return NextResponse.json({ 
            response: '⚠️ I notice you asked me to create something, but I responded with questions instead of generating the SQL query. This usually happens when:\n\n1. **I need more specific information** - For example, if you say "add a category" but don\'t give me the category name\n2. **I\'m confused about the context** - Even though you have books and categories, I might not understand which one you mean\n\n**To fix this, please be more specific:**\n- Instead of: "add a category C1 to the new book"\n- Try: "create a category called C1 in book Test" or "add category C1 to book Test"\n\nThe system has already provided your current books and categories with their IDs, so I should be able to generate the SQL immediately if you give me clear instructions.',
            model: MODEL_CONFIG.primary,
            usage: completion.usage,
            requiresConfirmation: false
          });
        }
        
        // Check if AI is asking about checking data or verifying IDs
        const checkPattern = /check.*data|verify.*id|look.*data|find.*id|checking.*data|verifying.*id|checking.*ids|verify.*ids|checking.*books|checking.*categories|checking.*records|checking.*existing|checking.*duplicate|checking.*same|check.*books|check.*categories|check.*records|check.*existing|check.*duplicate|check.*same|checking.*your|check.*your|verify.*your|verifying.*your|checking.*my|check.*my|verify.*my|verifying.*my|checking.*our|check.*our|verify.*our|verifying.*our|checking.*their|check.*their|verify.*their|verifying.*their|checking.*data|check.*data|verify.*data|verifying.*data|checking.*records|check.*records|verify.*records|verifying.*records|checking.*the data|check.*the data|verify.*the data|verifying.*the data|checking.*your data|check.*your data|verify.*your data|verifying.*your data|checking.*the records|check.*the records|verify.*the records|verifying.*the records|checking.*your records|check.*your records|verify.*your records|verifying.*your records|checking.*my data|check.*my data|verify.*my data|verifying.*my data|checking.*my records|check.*my records|verify.*my records|verifying.*my records|checking.*the user's data|check.*the user's data|verify.*the user's data|verifying.*the user's data|checking.*the user's records|check.*the user's records|verify.*the user's records|verifying.*the user's records|checking.*the data|check.*the data|verify.*the data|verifying.*the data|checking.*your books|check.*your books|verify.*your books|verifying.*your books|checking.*your categories|check.*your categories|verify.*your categories|verifying.*your categories|checking.*the user's books|check.*the user's books|verify.*the user's books|verifying.*the user's books|checking.*the user's categories|check.*the user's categories|verify.*the user's categories|verifying.*the user's categories|checking.*the user's data|check.*the user's data|verify.*the user's data|verifying.*the user's data|checking.*the user's data|check.*the user's data|verify.*the user's data|verifying.*the user's data|checking.*the user's data|check.*the user's data|verify.*the user's data|verifying.*the user's data|checking.*the user's data|check.*the user's data|verify.*the user's data|verifying.*the user's data|checking.*the user's data|check.*the user's data|verify.*the user's data|verifying.*the user's data/i;
        if (checkPattern.test(aiResponse)) {
          console.log('AI SQL Flow: AI is asking to check data without generating SQL for creation request');
          return NextResponse.json({ 
            response: '⚠️ I notice you asked me to create something, but I responded by saying I need to check data instead of generating the SQL query. This is a problem because:\n\n1. **The system has already provided your current data** - Your books and categories with their IDs are already in the context\n2. **I should use the provided IDs directly** - No need to check anything, just generate the INSERT query\n\n**To fix this, please try again with a clearer request:**\n- "Create a book called Test"\n- "Add category C1 to book Test"  \n- "Create an expense of $50 in category C1"\n\nI will then generate the SQL immediately using the IDs from your current data.',
            model: MODEL_CONFIG.primary,
            usage: completion.usage,
            requiresConfirmation: false
          });
        }
      }
      
   
      
      if (sqlQueries.length > 0) {
        console.log('AI SQL Flow: SQL found in response, processing', sqlQueries.length, 'queries');
        
        // Check if AI also generated a success message (which it shouldn't)
        const successMessagePattern = /✅\s*Successfully added|✅\s*Successfully updated|✅\s*Successfully/;
        const systemResponsePattern = /amount:\s*\d+|category:\s*\w+|paymentMethod:\s*\w+|isDisabled:\s*(true|false)/;
        if (successMessagePattern.test(aiResponse) || systemResponsePattern.test(aiResponse)) {
          console.log('AI SQL Flow: Warning - AI generated success message along with SQL');
          // Remove the success message from AI response since we'll generate our own
          aiResponse = aiResponse.replace(successMessagePattern, '').trim();
          aiResponse = aiResponse.replace(systemResponsePattern, '').trim();
        }
        
        // Process all SQL queries
        const results = [];
        let allSuccessful = true;
        const addedRecords = [];
        const updatedRecords = [];
        const selectResults = [];
        
        for (let i = 0; i < sqlQueries.length; i++) {
          const sqlQuery = sqlQueries[i];
          console.log(`AI SQL Flow: Processing query ${i + 1}/${sqlQueries.length}:`, sqlQuery);
          
          const trimmedQuery = sqlQuery.trim().toLowerCase();
          const isCreationRequest = message.toLowerCase().includes('create') || 
                                    message.toLowerCase().includes('add') ||
                                    message.toLowerCase().includes('new');
          
          if (isCreationRequest && trimmedQuery.startsWith('select')) {
            console.log('AI SQL Flow: Warning - AI generated SELECT query for creation request');
            allSuccessful = false;
            results.push({
              success: false,
              error: 'Generated SELECT query instead of INSERT for creation request'
            });
            continue;
          }
        
        // Check if AI is asking for clarification when it should have all the information
      // But allow clarification when there are multiple matching categories
      const clarificationPattern = /let me check|I need to verify|I need to check|looking at the|checking|verify|checking your books|let me check your books|I need to check the user's data|let me verify the data|checking your data|let me check your data|I need to look at|let me look at|I need to examine|let me examine|checking your|let me check your|I need to check your|let me verify your|checking the|let me check the|I need to check the|let me verify the|checking my|let me check my|I need to check my|let me verify my|checking our|let me check our|I need to check our|let me verify our|checking their|let me check their|I need to check their|let me verify their|checking data|let me check data|I need to check data|let me verify data|checking records|let me check records|I need to check records|let me verify records|checking the data|let me check the data|I need to check the data|let me verify the data|checking your data|let me check your data|I need to check your data|let me verify your data|checking the records|let me check the records|I need to check the records|let me verify the records|checking your records|let me check your records|I need to check your records|let me verify your records|checking my data|let me check my data|I need to check my data|let me verify my data|checking my records|let me check my records|I need to check my records|let me verify my records|checking the user's data|let me check the user's data|I need to check the user's data|let me verify the user's data|checking the user's records|let me check the user's records|I need to check the user's records|let me verify the user's records|checking the data|let me check the data|I need to check the data|let me verify the data|checking the user's data|let me check the user's data|I need to check the user's data|let me verify the user's data|checking your books|let me check your books|I need to check your books|let me verify your books|checking your categories|let me check your categories|I need to check your categories|let me verify your categories|checking the user's books|let me check the user's books|I need to check the user's books|let me verify the user's books|checking the user's categories|let me check the user's categories|I need to check the user's categories|let me verify the user's categories|checking the user's data|let me check the user's data|I need to check the user's data|let me verify the user's data|checking the user's data|let me check the user's data|I need to check the user's data|let me verify the user's data|checking the user's data|let me check the user's data|I need to check the user's data|let me verify the user's data|checking the user's data|let me check the user's data|I need to check the user's data|let me verify the user's data/i;
      const multipleCategoriesPattern = /multiple.*category|same.*name|which.*book/i;
      
      if (isCreationRequest && clarificationPattern.test(aiResponse) && !multipleCategoriesPattern.test(aiResponse)) {
          console.log('AI SQL Flow: AI is asking for clarification when it should generate SQL');
          console.log('AI Response:', aiResponse);
          // Don't execute, return error message
          return NextResponse.json({ 
            response: '⚠️ I notice you asked me to create something, but I responded with questions instead of generating the SQL query. This usually happens when:\n\n1. **I need more specific information** - For example, if you say "add a category" but don\'t give me the category name\n2. **I\'m confused about the context** - Even though you have books and categories, I might not understand which one you mean\n\n**To fix this, please be more specific:**\n- Instead of: "add a category C1 to the new book"\n- Try: "create a category called C1 in book Test" or "add category C1 to book Test"\n\nThe system has already provided your current books and categories with their IDs, so I should be able to generate the SQL immediately if you give me clear instructions.',
            model: MODEL_CONFIG.primary,
            usage: completion.usage,
            requiresConfirmation: false
          });
        }
        
        // Check if AI is asking about checking data or verifying IDs
        const checkPattern = /check.*data|verify.*id|look.*data|find.*id|checking.*data|verifying.*id|checking.*ids|verify.*ids|checking.*books|checking.*categories|checking.*records|checking.*existing|checking.*duplicate|checking.*same|check.*books|check.*categories|check.*records|check.*existing|check.*duplicate|check.*same|checking.*your|check.*your|verify.*your|verifying.*your|checking.*my|check.*my|verify.*my|verifying.*my|checking.*our|check.*our|verify.*our|verifying.*our|checking.*their|check.*their|verify.*their|verifying.*their|checking.*data|check.*data|verify.*data|verifying.*data|checking.*records|check.*records|verify.*records|verifying.*records|checking.*the data|check.*the data|verify.*the data|verifying.*the data|checking.*your data|check.*your data|verify.*your data|verifying.*your data|checking.*the records|check.*the records|verify.*the records|verifying.*the records|checking.*your records|check.*your records|verify.*your records|verifying.*your records|checking.*my data|check.*my data|verify.*my data|verifying.*my data|checking.*my records|check.*my records|verify.*my records|verifying.*my records|checking.*the user's data|check.*the user's data|verify.*the user's data|verifying.*the user's data|checking.*the user's records|check.*the user's records|verify.*the user's records|verifying.*the user's records|checking.*the data|check.*the data|verify.*the data|verifying.*the data|checking.*your books|check.*your books|verify.*your books|verifying.*your books|checking.*your categories|check.*your categories|verify.*your categories|verifying.*your categories|checking.*the user's books|check.*the user's books|verify.*the user's books|verifying.*the user's books|checking.*the user's categories|check.*the user's categories|verify.*the user's categories|verifying.*the user's categories|checking.*the user's data|check.*the user's data|verify.*the user's data|verifying.*the user's data|checking.*the user's data|check.*the user's data|verify.*the user's data|verifying.*the user's data|checking.*the user's data|check.*the user's data|verify.*the user's data|verifying.*the user's data|checking.*the user's data|check.*the user's data|verify.*the user's data|verifying.*the user's data|checking.*the user's data|check.*the user's data|verify.*the user's data|verifying.*the user's data/i;
        if (isCreationRequest && checkPattern.test(aiResponse)) {
          console.log('AI SQL Flow: Warning - AI is asking to check data when it should use provided IDs');
          // Don't execute, return error message
          return NextResponse.json({ 
            response: '⚠️ I notice you asked me to create something, but I responded by saying I need to check data instead of generating the SQL query. This is a problem because:\n\n1. **The system has already provided your current data** - Your books and categories with their IDs are already in the context\n2. **I should use the provided IDs directly** - No need to check anything, just generate the INSERT query\n\n**To fix this, please try again with a clearer request:**\n- "Create a book called Test"\n- "Add category C1 to book Test"  \n- "Create an expense of $50 in category C1"\n\nI will then generate the SQL immediately using the IDs from your current data.',
            model: MODEL_CONFIG.primary,
            usage: completion.usage,
            requiresConfirmation: false
          });
        }
        
          if (trimmedQuery.startsWith('insert')) {
            console.log('AI SQL Flow: INSERT query detected, executing with validation');
            
            let resolvedQuery = sqlQuery;
            let conversionInfo = null;
            
            // Check for currency conversion if this is an expense creation
            if (trimmedQuery.includes('into expenses')) {
              // Get user's books to check currency compatibility
              const books = await prisma.book.findMany({
                where: { userId: session.user.id, isArchived: false }
              });
              
              if (books.length > 0) {
                // Extract amount and currency from the original message
                const amountAndCurrency = extractAmountAndCurrency(message);
                
                if (amountAndCurrency.amount && amountAndCurrency.currency) {
                  const detectedCurrency = amountAndCurrency.currency;
                  const originalAmount = amountAndCurrency.amount;
                  
                  // Find the first book's currency (assuming single book for now)
                  const firstBook = books[0];
                  const bookCurrency = firstBook.currency;
                  
                  // If currencies don't match, convert the amount
                  if (detectedCurrency !== bookCurrency) {
                    console.log(`AI SQL Flow: Currency conversion needed: ${detectedCurrency} ${originalAmount} → ${bookCurrency}`);
                    
                    const conversionResult = await convertCurrency(originalAmount, detectedCurrency, bookCurrency);
                    
                    if (conversionResult.success) {
                      console.log(`AI SQL Flow: Converted ${originalAmount} ${detectedCurrency} to ${conversionResult.convertedAmount} ${bookCurrency} (rate: ${conversionResult.exchangeRate})`);
                      
                      // Update the SQL query with the converted amount
                      const amountPattern = new RegExp(`(\\b${originalAmount}\\b)`, 'g');
                      resolvedQuery = sqlQuery.replace(amountPattern, conversionResult.convertedAmount.toString());
                      
                      // Store conversion info for success message
                      conversionInfo = {
                        originalAmount,
                        detectedCurrency,
                        convertedAmount: conversionResult.convertedAmount,
                        bookCurrency,
                        exchangeRate: conversionResult.exchangeRate
                      };
                      
                    } else {
                      console.log('AI SQL Flow: Currency conversion failed, proceeding with original amount');
                      // If conversion fails, proceed with original amount but log the error
                      console.error('Currency conversion failed:', conversionResult.error);
                    }
                  }
                }
              }
            }
            
            // AI now generates SQL with correct IDs directly from RAG memory
            // No need to resolve book names - AI handles this through intelligence
            
            // Execute INSERT query directly with validation
            console.log('AI SQL Flow: Executing SQL query:', sqlQuery);
            const executionResult = await executeDirectSQLWithValidation(sqlQuery);
            console.log('AI SQL Flow: Execution result:', executionResult);
            
            results.push(executionResult);
            
            if (executionResult.success) {
              // Record was added successfully - format descriptive success message
              // Get user's books and categories for ID resolution in success message
              let userBooks: any[] = [];
              let categories: any[] = [];
              try {
                userBooks = await prisma.book.findMany({
                  where: { userId: session.user.id, isArchived: false }
                });

                const bookIds = userBooks.map(b => b.id);
                if (bookIds.length > 0) {
                  categories = await prisma.category.findMany({
                    where: { bookId: { in: bookIds }, isDisabled: false }
                  });
                }
              } catch (error) {
                console.log('Could not fetch user data for success message formatting:', error);
              }

              // Count how many INSERT statements are in this SQL query
              const insertStatements = sqlQuery.split(';').filter(stmt => stmt.trim().toLowerCase().includes('insert')).length;
              const numRecords = Math.max(insertStatements, 1); // At least 1 if no semicolons

              // Split the SQL query into individual statements for formatting
              const statements = sqlQuery.split(';').map(stmt => stmt.trim()).filter(stmt => stmt.length > 0 && stmt.toLowerCase().includes('insert'));

              // Add a success message for each record that was added
              for (let i = 0; i < numRecords; i++) {
                const statementSql = statements[i] || sqlQuery; // Use individual statement if available, otherwise whole query

                // Add conversion info if available for display (only for the first record if multiple)
                if (conversionInfo && i === 0) {
                  addedRecords.push(`${formatSuccessMessage(statementSql, executionResult, userBooks, categories)} (amount: ${conversionInfo.convertedAmount} converted from ${conversionInfo.originalAmount} ${conversionInfo.detectedCurrency})`);
                } else {
                  addedRecords.push(formatSuccessMessage(statementSql, executionResult, userBooks, categories));
                }
              }
            } else {
              allSuccessful = false;
            }
          } else if (trimmedQuery.startsWith('update')) {
            console.log('AI SQL Flow: UPDATE query detected, executing with validation');
            
            // AI now generates SQL with correct IDs directly from RAG memory
            // No need to resolve book names - AI handles this through intelligence
            
            // Execute UPDATE query directly with validation
            const executionResult = await executeUpdateSQLWithValidation(sqlQuery, session.user.id);
            
            results.push(executionResult);
            
            if (executionResult.success) {
              // Record was updated successfully - format descriptive success message
              // Get user's books and categories for context (though not needed for UPDATE success messages)
              let userBooks: any[] = [];
              let categories: any[] = [];
              try {
                userBooks = await prisma.book.findMany({
                  where: { userId: session.user.id, isArchived: false }
                });

                const bookIds = userBooks.map(b => b.id);
                if (bookIds.length > 0) {
                  categories = await prisma.category.findMany({
                    where: { bookId: { in: bookIds }, isDisabled: false }
                  });
                }
              } catch (error) {
                console.log('Could not fetch user data for UPDATE success message formatting:', error);
              }

              // Add success message for UPDATE operation
              updatedRecords.push(formatSuccessMessage(sqlQuery, executionResult, userBooks, categories));
            } else {
              allSuccessful = false;
            }
          } else if (trimmedQuery.startsWith('select')) {
            console.log('AI SQL Flow: SELECT query detected, executing');
            
            // For SELECT queries, do NOT resolve book names to IDs - keep them as names
            // The database has book names in the 'name' column, so queries like b.name = 'Office' should stay as-is
            
            // Execute SELECT query directly
            const executionResult = await executeSafeQuery(session.user.id, sqlQuery);
            
            results.push(executionResult);
            
            if (executionResult.success) {
              // Store SELECT results for display
              selectResults.push({
                query: sqlQuery,
                data: executionResult.data,
                rowCount: executionResult.rowCount
              });
            } else {
              allSuccessful = false;
            }
          } else {
            console.log('AI SQL Flow: Unsupported query type:', trimmedQuery);
            results.push({
              success: false,
              error: 'This request is not supported'
            });
            allSuccessful = false;
          }
        }
        
        // Generate comprehensive response
        if (allSuccessful) {
          let finalMessage = '';
          
          if (addedRecords.length > 0 && updatedRecords.length > 0) {
            finalMessage = `✅ Successfully executed operations:\n`;
            if (addedRecords.length > 0) {
              finalMessage += `Added ${addedRecords.length} record${addedRecords.length !== 1 ? 's' : ''}:\n`;
              addedRecords.forEach((record, index) => {
                finalMessage += `  ${index + 1}. ${record}\n`;
              });
            }
            if (updatedRecords.length > 0) {
              finalMessage += `Updated ${updatedRecords.length} record${updatedRecords.length !== 1 ? 's' : ''}:\n`;
              updatedRecords.forEach((record, index) => {
                finalMessage += `  ${index + 1}. ${record}\n`;
              });
            }
            finalMessage = finalMessage.trim();
          } else if (addedRecords.length > 0) {
            finalMessage = `✅ Successfully added ${addedRecords.length} record${addedRecords.length !== 1 ? 's' : ''}:\n`;
            addedRecords.forEach((record, index) => {
              finalMessage += `${index + 1}. ${record}\n`;
            });
            finalMessage = finalMessage.trim();
          } else if (updatedRecords.length > 0) {
            finalMessage = `✅ Successfully updated ${updatedRecords.length} record${updatedRecords.length !== 1 ? 's' : ''}:\n`;
            updatedRecords.forEach((record, index) => {
              finalMessage += `${index + 1}. ${record}\n`;
            });
            finalMessage = finalMessage.trim();
          } else if (selectResults.length > 0) {
            // For SELECT results, make another AI call to format them naturally
            finalMessage = await formatSelectResultsWithAI(selectResults, message, session.user.id, conversationHistory);
          } else {
            finalMessage = '✅ Successfully executed all operations';
          }
          
          // Save conversation to database
          try {
            await prisma.chatMessage.create({
              data: {
                role: 'user',
                content: message,
                userId: session.user.id
              }
            })
            
            await prisma.chatMessage.create({
              data: {
                role: 'assistant',
                content: finalMessage,
                userId: session.user.id
              }
            })
          } catch (error) {
            console.error('Error saving chat message:', error)
          }
          
          return NextResponse.json({ 
            response: finalMessage,
            model: MODEL_CONFIG.primary,
            usage: completion.usage,
            requiresConfirmation: false
          });
        } else {
          // Some operations failed
          const errorMessages = results
            .filter(r => !r.success)
            .map(r => r.error || 'Unknown error')
            .join('; ');
          
          const finalMessage = `❌ Some operations failed: ${errorMessages}`;
          
          // Save conversation to database
          try {
            await prisma.chatMessage.create({
              data: {
                role: 'user',
                content: message,
                userId: session.user.id
              }
            })
            
            await prisma.chatMessage.create({
              data: {
                role: 'assistant',
                content: finalMessage,
                userId: session.user.id
              }
            })
          } catch (error) {
            console.error('Error saving chat message:', error)
          }
          
          return NextResponse.json({ 
            response: finalMessage,
            model: MODEL_CONFIG.primary,
            usage: completion.usage,
            requiresConfirmation: false
          });
        }
        // But first, check if user explicitly asked for SQL generation
        if (message.toLowerCase().includes('sql') || 
            message.toLowerCase().includes('query') || 
            message.toLowerCase().includes('database') ||
            message.toLowerCase().includes('report') ||
            message.toLowerCase().includes('show') ||
            message.toLowerCase().includes('list')) {
          
          aiResponse += `\n\n❌  Please ask for a specific operation (e.g., "Create a book called Personal Budget" or "Show me all expenses from last month").`;
          
          // Save conversation to database
          try {
            await prisma.chatMessage.create({
              data: {
                role: 'user',
                content: message,
                userId: session.user.id
              }
            })
            
            await prisma.chatMessage.create({
              data: {
                role: 'assistant',
                content: aiResponse,
                userId: session.user.id
              }
            })
          } catch (error) {
            console.error('Error saving chat message:', error)
          }
          
          return NextResponse.json({ 
            response: aiResponse,
            model: MODEL_CONFIG.primary,
            usage: completion.usage,
            requiresConfirmation: false
          });
        }
      }
    }
    
    // Otherwise, proceed with RAG-enhanced AI processing
    // Get RAG context if user is authenticated
    let ragContext = null
    let systemPrompt = `You are an AI assistant for "Manage My Expenses" - a personal finance management application. Your role is to help users manage their expenses, budgets, and financial records.
    
CAPABILITIES:
1. Answer questions about expense management
2. Analyze spending patterns and provide insights
3. Generate SQL queries for data analysis
4. Explain database results in plain language
5. Provide budget optimization suggestions

DATABASE QUERY GUIDELINES:
- You can generate SQL SELECT queries to analyze user data
- Only generate queries for READ operations (SELECT)
- Use the user's context to create personalized queries
- Format queries clearly with proper SQL syntax
- Explain what the query does before executing

IMPORTANT: You will be given user context including their books, categories, and recent expenses. Use this to provide personalized responses.

Always maintain a supportive and educational tone.`

    if (session?.user?.id) {
      // Get RAG context for the user
      ragContext = await ragService.getContext(session.user.id, message)
      
      // Enhance system prompt with user context
      const userContext = JSON.stringify(ragContext.userContext, null, 2)
      systemPrompt += `\n\nUSER CONTEXT (for personalized responses and ID resolution):
${userContext}

Use this context to:
1. Provide personalized advice based on the user's actual financial data
2. Resolve IDs to names (e.g., bookId → book name, categoryId → category name)
3. Format responses in natural language with human-readable names`

      // Add RAG documents to the conversation
      if (ragContext.relevantDocs.length > 0) {
        const ragInfo = ragContext.relevantDocs.map(doc => doc.content).join('\n')
        systemPrompt += `\n\nRELEVANT DATA:\n${ragInfo}`
        
        // Add response format instructions from RAG
        const responseFormatDocs = ragContext.relevantDocs.filter(doc => 
          doc.metadata?.type === 'response-format'
        );
        
        if (responseFormatDocs.length > 0) {
          systemPrompt += `\n\nRESPONSE FORMAT INSTRUCTIONS (critical - follow these):`;
          responseFormatDocs.forEach(doc => {
            systemPrompt += `\n- ${doc.content}`;
          });
        }
      }

      // Check if user wants a database query
      const queryKeywords = ['show me', 'what is', 'how many', 'total', 'sum', 'average', 'list', 'find', 'query', 'sql', 'database', 'report', 'spending', 'expenses', 'categories', 'monthly', 'trend'];
      const wantsQuery = queryKeywords.some(keyword => message.toLowerCase().includes(keyword));

      if (wantsQuery) {
        systemPrompt += `\n\nQUERY GENERATION MODE:\nThe user is asking for data analysis. You should:\n1. Generate a SQL SELECT query to get the requested data\n2. Format it clearly with proper SQL syntax\n3. The system will execute it and return results\n\nCRITICAL RESPONSE FORMAT RULES:\n1. Your ONLY job is to generate SQL queries in code blocks - the system will handle response formatting\n2. For SELECT operations, generate proper SQL with JOINs and WHERE clauses\n3. Use the user's books and categories from context to ensure correct user filtering\n4. For INSERT operations, use the correct IDs from the user context in your SQL\n5. NEVER generate success messages - only generate SQL queries\n\nThis query will show: [explanation]`;
      }
    }

    // Build messages array with conversation history
    const messages = [
      { role: 'system', content: systemPrompt }
    ]
    
    // Add conversation history if provided
    // Filter out success messages from previous AI responses to prevent the AI from learning to generate them
    if (conversationHistory && Array.isArray(conversationHistory)) {
      const filteredHistory = conversationHistory.filter(msg => {
        if (msg.role === 'assistant') {
          // Filter out success messages from AI responses
          const successMessagePattern = /✅\s*Successfully added|✅\s*Successfully updated|✅\s*Successfully/;
          const systemResponsePattern = /amount:\s*\d+|category:\s*\w+|paymentMethod:\s*\w+|isDisabled:\s*(true|false)/;
          return !successMessagePattern.test(msg.content) && !systemResponsePattern.test(msg.content);
        }
        return true; // Keep all user messages
      });
      messages.push(...filteredHistory)
    }
    
    // Add current user message
    messages.push({ role: 'user', content: message })
    
    // Call OpenRouter API directly using helper function
    const completion = await callOpenRouterAPI(messages)
    
    aiResponse = completion.choices[0]?.message?.content || 'I apologize, but I could not generate a response.'

    // Additional safeguard: If AI generated a success message despite all instructions, strip it
    const successMessagePattern = /✅\s*Successfully added|✅\s*Successfully updated|✅\s*Successfully/;
    const systemResponsePattern = /amount:\s*\d+|category:\s*\w+|paymentMethod:\s*\w+|isDisabled:\s*(true|false)/;
    
    if (successMessagePattern.test(aiResponse) || systemResponsePattern.test(aiResponse)) {
      console.log('RAG Flow: AI generated success message despite instructions, stripping it');
      // Remove the success message part
      aiResponse = aiResponse.replace(successMessagePattern, '').trim();
      aiResponse = aiResponse.replace(systemResponsePattern, '').trim();
    }

    // Check if the AI response contains a SQL query (for read operations)
    const sqlMatch = aiResponse.match(/```sql\n([\s\S]*?)\n```/);
    if (sqlMatch) {
      const generatedQuery = sqlMatch[1].trim();
      
      // Execute the query
      const executionResult = await executeSafeQuery(session.user.id, generatedQuery);
      
      if (executionResult.success) {
        // Remove SQL from response and show results only
        aiResponse = aiResponse.replace(/```sql\n([\s\S]*?)\n```/g, '');
        
        // Get user's books and categories for ID resolution
        let userBooks: any[] = [];
        let categories: any[] = [];
        try {
          userBooks = await prisma.book.findMany({
            where: { userId: session.user.id, isArchived: false }
          });
          
          const bookIds = userBooks.map(b => b.id);
          if (bookIds.length > 0) {
            categories = await prisma.category.findMany({
              where: { bookId: { in: bookIds }, isDisabled: false }
            });
          }
        } catch (error) {
          console.log('Could not fetch user data for ID resolution:', error);
        }
        
        // Format results with ID resolution
        let cleanResponse = `📊 Found ${executionResult.rowCount} records`;
        
        if (executionResult.data && Array.isArray(executionResult.data) && executionResult.data.length > 0) {
          // Resolve IDs to names in the data
          const resolvedData = executionResult.data.map(item => {
            const resolved: any = { ...item };
            
            // Resolve bookId to book name
            if (resolved.bookId && userBooks.length > 0) {
              const book = userBooks.find(b => b.id === resolved.bookId);
              if (book) {
                resolved.book = book.name;
                delete resolved.bookId;
              }
            }
            
            // Resolve categoryId to category name
            if (resolved.categoryId && categories.length > 0) {
              const category = categories.find(c => c.id === resolved.categoryId);
              if (category) {
                resolved.category = category.name;
                delete resolved.categoryId;
              }
            }
            
            // Also handle common field names from JOINs
            if (resolved.book_name) {
              resolved.book = resolved.book_name;
              delete resolved.book_name;
            }
            if (resolved.category_name) {
              resolved.category = resolved.category_name;
              delete resolved.category_name;
            }
            
            // Remove internal fields
            delete resolved.id;
            delete resolved.userId;
            delete resolved.isDisabled;
            delete resolved.isArchived;
            delete resolved.createdAt;
            delete resolved.updatedAt;
            
            return resolved;
          });
          
          // Format the first few results
          const sampleData = resolvedData.slice(0, 3);
          cleanResponse += `:\n\`\`\`json\n${JSON.stringify(sampleData, null, 2)}\n\`\`\``;
        }
        
        aiResponse = cleanResponse;
      } else {
        aiResponse = aiResponse.replace(/```sql\n([\s\S]*?)\n```/g, '');
        aiResponse += `\n\n❌ ${executionResult.error}`;
      }
    }

    // Remove any SQL code blocks from the final response
    aiResponse = aiResponse.replace(/```sql\n([\s\S]*?)\n```/g, '');
    
    // Clean up any remaining SQL-related text
    aiResponse = aiResponse.replace(/SQL Query:/g, '');
    aiResponse = aiResponse.replace(/This query will show:/g, '');
    aiResponse = aiResponse.replace(/This query will do:/g, '');
    aiResponse = aiResponse.trim();
    
    // Save the conversation to database if user is authenticated
    if (session?.user?.id) {
      try {
        // Save user message
        await prisma.chatMessage.create({
          data: {
            role: 'user',
            content: message,
            userId: session.user.id
          }
        })
        
        // Save AI response
        await prisma.chatMessage.create({
          data: {
            role: 'assistant',
            content: aiResponse,
            userId: session.user.id
          }
        })
      } catch (error) {
        console.error('Error saving chat message:', error)
        // Don't fail the request if saving fails
      }
    }
    
    // Final safeguard: Check for fake success messages in the final response
    // If the AI generated a success message but no SQL was executed, warn the user
    const fakeSuccessPattern = /✅\s*Successfully added|✅\s*Successfully updated|✅\s*Successfully/;
    const fakeSystemResponsePattern = /amount:\s*\d+|category:\s*\w+|paymentMethod:\s*\w+|isDisabled:\s*(true|false)/;
    if ((fakeSuccessPattern.test(aiResponse) || fakeSystemResponsePattern.test(aiResponse)) && !sqlQuery) {
      console.log('AI SQL Flow: Fake success message detected in response');
      aiResponse = '⚠️ Warning: The AI generated a success message but no database operation was performed. Please ask for a specific operation (e.g., "Create a book called Test" or "Show me all expenses").';
    }
    
    // Also check if the AI generated a success message with SQL but the SQL was invalid
    if ((fakeSuccessPattern.test(aiResponse) || fakeSystemResponsePattern.test(aiResponse)) && sqlQuery) {
      console.log('AI SQL Flow: AI generated success message with SQL - this is unexpected');
      // Remove the success message from the response since we'll generate our own
      aiResponse = aiResponse.replace(fakeSuccessPattern, '').trim();
      aiResponse = aiResponse.replace(fakeSystemResponsePattern, '').trim();
    }
    
    return NextResponse.json({ 
      response: aiResponse,
      model: MODEL_CONFIG.primary,
      usage: completion.usage,
      ragContext: ragContext ? {
        relevantDocs: ragContext.relevantDocs,
        userContext: ragContext.userContext
      } : null,
      requiresConfirmation: false
    })
  
}

export async function GET() {
  let session = null
  try {
    session = await getServerSession(authOptions)
  } catch (error) {
    session = null
  }
  
  return NextResponse.json({
    status: 'AI Assistant is ready',
    model: MODEL_CONFIG.primary,
    fallback: MODEL_CONFIG.fallback,
    provider: 'OpenRouter',
    authenticated: !!session?.user?.id,
    userId: session?.user?.id || null
  })
}


  
