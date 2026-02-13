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
const OPENROUTER_MAX_TOKENS = parseInt(process.env.OPENROUTER_MAX_TOKENS || '4000', 10) // Increased for bulk operations like adding all default categories
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
  const results = extractAllAmountsAndCurrencies(message);
  return results.length > 0 ? results[0] : { amount: null, currency: null, originalText: '' };
}

// Helper function to extract ALL amounts and currencies from message (for multi-expense support)
function extractAllAmountsAndCurrencies(message: string): Array<{ amount: number; currency: string; originalText: string }> {
  const results: Array<{ amount: number; currency: string; originalText: string }> = [];
  
  // Currency word to code mapping
  const currencyWordMap: Record<string, string> = {
    'euro': 'EUR', 'euros': 'EUR',
    'dollar': 'USD', 'dollars': 'USD',
    'pound': 'GBP', 'pounds': 'GBP', 'sterling': 'GBP',
    'yen': 'JPY',
    'yuan': 'CNY', 'renminbi': 'CNY',
    'rupee': 'INR', 'rupees': 'INR',
    'ruble': 'RUB', 'rubles': 'RUB',
    'won': 'KRW',
    'lira': 'TRY',
    'dong': 'VND',
    'shekel': 'ILS', 'shekels': 'ILS',
    'dirham': 'AED', 'dirhams': 'AED',
    'riyal': 'SAR', 'riyals': 'SAR',
    'peso': 'MXN', 'pesos': 'MXN',
    'real': 'BRL', 'reais': 'BRL', 'reals': 'BRL',
    'rand': 'ZAR',
    'franc': 'CHF', 'francs': 'CHF',
    'krona': 'SEK', 'krone': 'NOK',
    'zloty': 'PLN',
    'koruna': 'CZK',
    'forint': 'HUF',
    'baht': 'THB',
    'ringgit': 'MYR',
    'rupiah': 'IDR'
  };

  const currencySymbolMap: Record<string, string> = {
    '$': 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY', '₹': 'INR', '₽': 'RUB', '₩': 'KRW', '₺': 'TRY', '₫': 'VND', '₪': 'ILS', 'د.إ': 'AED', '﷼': 'SAR'
  };

  // Pattern 1a: Currency symbol + number (€150, $50, £25)
  const symbolBeforePattern = /([$€£¥₹₽₩₺₫₪])([\d,]+\.?\d*)/g;
  let match;
  while ((match = symbolBeforePattern.exec(message)) !== null) {
    const symbol = match[1];
    const amountStr = match[2].replace(/,/g, '');
    const amount = parseFloat(amountStr);
    const currency = currencySymbolMap[symbol];
    if (!isNaN(amount) && currency) {
      results.push({ amount, currency, originalText: match[0] });
    }
  }

  // Pattern 1b: Number + currency symbol (200$, 50€, 25£) - common in some regions
  const symbolAfterPattern = /([\d,]+\.?\d*)([$€£¥₹₽₩₺₫₪])/g;
  while ((match = symbolAfterPattern.exec(message)) !== null) {
    const amountStr = match[1].replace(/,/g, '');
    const symbol = match[2];
    const amount = parseFloat(amountStr);
    const currency = currencySymbolMap[symbol];
    if (!isNaN(amount) && currency && !results.some(r => r.amount === amount && r.currency === currency)) {
      results.push({ amount, currency, originalText: match[0] });
    }
  }

  // Pattern 2: Number + currency code (150 EUR, 50 USD)
  const codeAfterPattern = /(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(USD|EUR|GBP|JPY|CAD|AUD|CHF|CNY|INR|MXN|BRL|ZAR|RUB|KRW|SGD|HKD|NZD|SEK|NOK|DKK|PLN|CZK|HUF|TRY|TWD|THB|IDR|MYR|PHP|VND|ILS|AED|SAR|QAR|KWD|BHD|OMR|JOD|LBP|EGP|NGN|CLP|COP|PEN|ARS|UYU)/gi;
  while ((match = codeAfterPattern.exec(message)) !== null) {
    const amountStr = match[1].replace(/,/g, '');
    const amount = parseFloat(amountStr);
    const currency = match[2].toUpperCase();
    if (!isNaN(amount) && !results.some(r => r.amount === amount && r.currency === currency)) {
      results.push({ amount, currency, originalText: match[0] });
    }
  }

  // Pattern 3: Currency code + number (EUR 150, USD 50)
  const codeBeforePattern = /(USD|EUR|GBP|JPY|CAD|AUD|CHF|CNY|INR|MXN|BRL|ZAR|RUB|KRW|SGD|HKD|NZD|SEK|NOK|DKK|PLN|CZK|HUF|TRY|TWD|THB|IDR|MYR|PHP|VND|ILS|AED|SAR|QAR|KWD|BHD|OMR|JOD|LBP|EGP|NGN|CLP|COP|PEN|ARS|UYU)\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/gi;
  while ((match = codeBeforePattern.exec(message)) !== null) {
    const currency = match[1].toUpperCase();
    const amountStr = match[2].replace(/,/g, '');
    const amount = parseFloat(amountStr);
    if (!isNaN(amount) && !results.some(r => r.amount === amount && r.currency === currency)) {
      results.push({ amount, currency, originalText: match[0] });
    }
  }

  // Pattern 4: Number + currency word (15 euros, 50 dollars, 25 pounds)
  const wordPattern = /(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(euros?|dollars?|pounds?|sterling|yen|yuan|renminbi|rupees?|rubles?|won|lira|dong|shekels?|dirhams?|riyals?|pesos?|reais?|reals?|rand|francs?|krona|krone|zloty|koruna|forint|baht|ringgit|rupiah)/gi;
  while ((match = wordPattern.exec(message)) !== null) {
    const amountStr = match[1].replace(/,/g, '');
    const amount = parseFloat(amountStr);
    const currencyWord = match[2].toLowerCase();
    const currency = currencyWordMap[currencyWord];
    if (!isNaN(amount) && currency && !results.some(r => r.amount === amount && r.currency === currency)) {
      results.push({ amount, currency, originalText: match[0] });
    }
  }

  return results;
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
function formatSuccessMessage(sqlQuery: string, executionResult: any, userBooks: any[] = [], categories: any[] = []): string | string[] {
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
    // Check if there are multiple VALUES clauses
    const valuesMatches = sqlQuery.match(/VALUES\s*\([^)]*\)/g);
    if (valuesMatches && valuesMatches.length > 1) {
      // Multiple books in one INSERT
      const bookMessages: string[] = [];
      for (const valuesMatch of valuesMatches) {
        // Extract book name from this VALUES clause
        const nameMatch = valuesMatch.match(/UUID\(\)\s*,\s*'([^']+)'/);
        const bookName = nameMatch ? nameMatch[1] : 'Book';
        // For books, we know the standard fields: name, description, currency, isArchived
        // Extract them from the VALUES clause
        const values = valuesMatch.match(/VALUES\s*\(\s*([^)]+)\)/);
        if (values) {
          const valueParts = values[1].split(',').map(v => v.trim());
          // valueParts[0] is UUID(), [1] is name, [2] is description, [3] is currency, [4] is isArchived
          const description = valueParts[2] ? valueParts[2].replace(/^['"]|['"]$/g, '') : '';
          const currency = valueParts[3] ? valueParts[3].replace(/^['"]|['"]$/g, '') : 'USD';
          const isArchived = valueParts[4] ? valueParts[4].replace(/^['"]|['"]$/g, '') : 'false';
          bookMessages.push(`${bookName} book created (name: ${bookName}, description: ${description}, currency: ${currency}, isArchived: ${isArchived})`);
        } else {
          bookMessages.push(`${bookName} book created`);
        }
      }
      return bookMessages;
    } else {
      // Single book
      const recordDetails = extractRecordValuesFromQuery(sqlQuery, userBooks, categories);
      const nameMatch = sqlQuery.match(/VALUES\s*\(\s*UUID\(\)\s*,\s*'([^']+)'/);
      const bookName = nameMatch ? nameMatch[1] : 'Book';
      return `${bookName} book created${recordDetails ? ` (${recordDetails})` : ''}`;
    }
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
      const bookIdMatch = query.match(/bookId\s*=\s*['"]([^'"]+)['"]/i) || 
                          query.match(/,\s*'([0-9a-f-]{20,})'\s*,/gi); // Also check VALUES format
      if (bookIdMatch) {
        const bookId = bookIdMatch[1] || (typeof bookIdMatch[0] === 'string' ? bookIdMatch[0].replace(/[',\s]/g, '') : '');
        
        // Check for known placeholder UUIDs that AI sometimes generates
        const placeholderUUIDs = [
          '550e8400-e29b-41d4-a716-446655440000',
          'test-book-123',
          'example-id',
          'book-id-here',
          'category-id-here'
        ];
        
        if (placeholderUUIDs.some(placeholder => query.includes(placeholder))) {
          throw new Error(`❌ Invalid Book ID: AI generated a placeholder UUID instead of using the actual Book ID from your data. Please try again - say "add default categories to [book name]" and I'll use the correct ID.`);
        }
        
        // UUID pattern: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (bookId && !uuidPattern.test(bookId) && !bookId.startsWith('cml')) {
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
      message: `Successfully added ${totalRowsAffected} record(s)`,
      rowCount: totalRowsAffected
    };
  } catch (error) {
    console.log('executeDirectSQLWithValidation: Query failed:', error);
    
    // Transform database errors into user-friendly messages
    let userFriendlyError = 'Unknown error';
    
    if (error instanceof Error) {
      const errorMessage = error.message;
      
      // MySQL error code 1062: Duplicate entry
      if (errorMessage.includes('Code: `1062`') && errorMessage.includes('Duplicate entry')) {
        // Extract the table and key information
        const duplicateMatch = errorMessage.match(/Duplicate entry '([^']+)' for key '([^']+)'/);
        if (duplicateMatch) {
          const entryValue = duplicateMatch[1];
          const keyName = duplicateMatch[2];
          
          // Parse the key name to determine what type of duplicate
          if (keyName.includes('books_userId_name_key')) {
            // Extract book name from the entry value (format: userId-bookName)
            const parts = entryValue.split('-');
            const bookName = parts.slice(1).join('-'); // Everything after the first dash
            userFriendlyError = `A book named "${bookName}" already exists. Please choose a different name.`;
          } else if (keyName.includes('categories_bookId_name_key')) {
            // Extract category name
            const parts = entryValue.split('-');
            const categoryName = parts.slice(1).join('-');
            userFriendlyError = `A category named "${categoryName}" already exists in this book. Please choose a different name.`;
          } else if (keyName.includes('userId_email_key')) {
            userFriendlyError = 'This email address is already registered.';
          } else {
            userFriendlyError = 'This record already exists. Please check your data and try again.';
          }
        } else {
          userFriendlyError = 'This record already exists. Please check your data and try again.';
        }
      } 
      // MySQL error code 1452: Foreign key constraint fails
      else if (errorMessage.includes('Code: `1452`') || errorMessage.includes('foreign key constraint')) {
        // Try to extract which constraint failed from the error message
        // MySQL format: "a foreign key constraint fails (`db`.`table`, CONSTRAINT `name` FOREIGN KEY (`column`) REFERENCES `parent_table`)"
        const constraintMatch = errorMessage.match(/FOREIGN KEY \(`([^`]+)`\) REFERENCES `([^`]+)`/i);
        
        if (constraintMatch) {
          const column = constraintMatch[1];
          const referencedTable = constraintMatch[2];
          
          if (column === 'categoryId' || referencedTable === 'categories') {
            // Try to extract the bad categoryId from the query
            const categoryIdMatch = query.match(/'([a-z0-9]{20,})'/gi);
            const categoryId = categoryIdMatch ? categoryIdMatch[categoryIdMatch.length - 1]?.replace(/'/g, '') : 'unknown';
            userFriendlyError = `❌ Cannot create this expense: The specified **category does not exist** (ID: ${categoryId}). Please verify the category exists or create it first.`;
          } else if (column === 'bookId' || referencedTable === 'books') {
            userFriendlyError = '❌ Cannot create this record: The specified **book does not exist**. Please check the book ID or create the book first.';
          } else if (column === 'userId' || referencedTable === 'users') {
            userFriendlyError = '❌ Cannot create this record: The specified **user does not exist**. Please check your authentication.';
          } else {
            userFriendlyError = `❌ Cannot create this record: The referenced ${referencedTable || 'item'} does not exist. Please verify your data.`;
          }
        } else {
          // Fallback: try to guess from the query context
          if (query.toLowerCase().includes('into expenses')) {
            userFriendlyError = '❌ Cannot create this expense: The specified **category does not exist**. Please verify the category exists in the target book.';
          } else if (query.toLowerCase().includes('into categories')) {
            userFriendlyError = '❌ Cannot create this category: The specified **book does not exist**. Please verify the book exists.';
          } else {
            userFriendlyError = '❌ Cannot create this record: A referenced book or category does not exist. Please ensure all required items exist first.';
          }
        }
      }
      // MySQL error code 1406: Data too long
      else if (errorMessage.includes('Code: `1406`') || errorMessage.includes('Data too long')) {
        userFriendlyError = 'The provided data is too long. Please use shorter names or descriptions.';
      }
      // MySQL error code 1264: Out of range value
      else if (errorMessage.includes('Code: `1264`') || errorMessage.includes('Out of range')) {
        userFriendlyError = 'The provided number is too large. Please use smaller values.';
      }
      else {
        // Keep the original error message for other cases
        userFriendlyError = errorMessage;
      }
    }
    
    return {
      success: false,
      error: userFriendlyError,
      message: 'Operation Failed',
      rowCount: 0
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
    const formatSystemPrompt = `You are a data formatting assistant for "Manage My Expenses". Your job is to format database query results into clean, readable responses.

CRITICAL INSTRUCTIONS:
- Provide DIRECT responses without introductory explanations or meta-commentary
- Do NOT say things like "Here are your results" or "Let me show you" or "Based on the data"
- Just give the formatted data immediately
- For expense lists: Use numbered lists with date, category, description, amount, and payment method
- For summaries: Show totals and key metrics clearly
- Keep responses concise and focused on the data
- Use proper date formatting (MM/DD/YYYY)
- Include currency symbols and proper formatting

EXAMPLE FORMAT FOR EXPENSES:
1. 02/11/2026 - Bills & Utilities: electricity bill - $200.00 USD (Wire Transfer)
2. 02/11/2026 - Food & Dining: groceries - $50.00 USD (Credit Card)

EXAMPLE FORMAT FOR SUMMARY:
Total expenses: $485.00 USD
Average per transaction: $97.00 USD

EXAMPLE FORMAT FOR BOOKS:
1. Personal Budget (USD)
2. Business Expenses (EUR)

EXAMPLE FORMAT FOR CATEGORIES:
1. Groceries
2. Transportation
3. Utilities

Present the data directly without any introductory text.`;

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
    const upperQuery = trimmedQuery.toUpperCase().replace(/\s+/g, ' ');
    const andIndex = upperQuery.indexOf(' AND ');
    const whereIndex = upperQuery.indexOf(' WHERE ');
    
    if (andIndex !== -1 && whereIndex === -1) {
      throw new Error('Query contains AND keyword but no WHERE clause');
    }
    
    if (andIndex !== -1 && andIndex < whereIndex) {
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
    console.log('addUserFilterToUpdateQuery: Processing expenses query:', trimmedQuery);
    
    // Check if query already has JOINs with categories and books and userId filter
    const hasJoinWithCategories = /join\s+categories\s+c\s+on/i.test(lowerQuery);
    const hasJoinWithBooks = /join\s+books\s+b\s+on/i.test(lowerQuery);
    const hasUserIdFilter = /b\.userid\s*=\s*'[^']+'/i.test(lowerQuery);
    
    if (hasJoinWithCategories && hasJoinWithBooks && hasUserIdFilter) {
      console.log('addUserFilterToUpdateQuery: Query already has JOINs and userId filter, returning as-is');
      return trimmedQuery;
    }
    
    // Check if userId is already present but we need to add JOINs
    if (hasUserIdFilter && (!hasJoinWithCategories || !hasJoinWithBooks)) {
      console.log('addUserFilterToUpdateQuery: Query has userId but missing JOINs, needs reconstruction');
      const setMatch = trimmedQuery.match(/set\s+(.+?)\s+where/i);
      if (setMatch) {
        let setClause = setMatch[1];
        
        // Ensure SET clause has proper table prefixes for expenses
        if (!setClause.includes('e.')) {
          // Add 'e.' prefix to fields that don't have it
          setClause = setClause.replace(/\b(isDisabled|updatedAt|amount|date|description|paymentMethod)\b/g, (match) => 'e.' + match);
        }
        
        const whereMatch = trimmedQuery.match(/where\s+(.+)$/i);
        const whereClause = whereMatch ? whereMatch[1] : '1=1';
        
        return `UPDATE expenses e 
               JOIN categories c ON e.categoryId = c.id 
               JOIN books b ON c.bookId = b.id 
               SET ${setClause} 
               WHERE ${whereClause}`;
      }
    }
    
    // Query needs JOINs and userId filter
    const setMatch = trimmedQuery.match(/set\s+(.+?)\s+where/i);
    console.log('addUserFilterToUpdateQuery: SET match:', setMatch);
    if (setMatch) {
      let setClause = setMatch[1];
      
      // Ensure SET clause has proper table prefixes for expenses
      if (!setClause.includes('e.')) {
        // Add 'e.' prefix to fields that don't have it
        setClause = setClause.replace(/\b(isDisabled|updatedAt|amount|date|description|paymentMethod)\b/g, (match) => 'e.' + match);
      }
      
      const whereMatch = trimmedQuery.match(/where\s+(.+)$/i);
      const whereClause = whereMatch ? whereMatch[1] : '1=1';
      console.log('addUserFilterToUpdateQuery: WHERE clause extracted:', whereClause);
      
      const result = `UPDATE expenses e 
             JOIN categories c ON e.categoryId = c.id 
             JOIN books b ON c.bookId = b.id 
             SET ${setClause} 
             WHERE ${whereClause} AND b.userId = '${userId}'`;
      return result;
    }
  } else if (lowerQuery.includes('categories')) {
    // For categories, add user filtering by joining with books
    console.log('addUserFilterToUpdateQuery: Processing categories query:', trimmedQuery);
    
    // Check if query already has JOIN with books and userId filter
    const hasJoinWithBooks = /join\s+books\s+b\s+on/i.test(lowerQuery);
    const hasUserIdFilter = /b\.userid\s*=\s*'[^']+'/i.test(lowerQuery);
    
    if (hasJoinWithBooks && hasUserIdFilter) {
      console.log('addUserFilterToUpdateQuery: Query already has JOIN and userId filter, returning as-is');
      return trimmedQuery;
    }
    
    // Check if userId is already present but we need to add JOIN
    if (hasUserIdFilter && !hasJoinWithBooks) {
      console.log('addUserFilterToUpdateQuery: Query has userId but missing JOIN, needs reconstruction');
      const setMatch = trimmedQuery.match(/set\s+(.+?)\s+where/i);
      if (setMatch) {
        let setClause = setMatch[1];
        
        // Ensure SET clause has proper table prefixes for categories
        if (!setClause.includes('c.')) {
          // Add 'c.' prefix to fields that don't have it
          setClause = setClause.replace(/\b(isDisabled|updatedAt|name|description|icon|color|isDefault)\b/g, (match) => 'c.' + match);
        }
        
        const whereMatch = trimmedQuery.match(/where\s+(.+)$/i);
        const whereClause = whereMatch ? whereMatch[1] : '1=1';
        
        return `UPDATE categories c 
               JOIN books b ON c.bookId = b.id 
               SET ${setClause} 
               WHERE ${whereClause}`;
      }
    }
    
    // Query needs both JOIN and userId filter
    const setMatch = trimmedQuery.match(/set\s+(.+?)\s+where/i);
    console.log('addUserFilterToUpdateQuery: SET match:', setMatch);
    if (setMatch) {
      let setClause = setMatch[1];
      
      // Ensure SET clause has proper table prefixes for categories
      if (!setClause.includes('c.')) {
        // Add 'c.' prefix to fields that don't have it
        setClause = setClause.replace(/\b(isDisabled|updatedAt|name|description|icon|color|isDefault)\b/g, (match) => 'c.' + match);
      }
      
      const whereMatch = trimmedQuery.match(/where\s+(.+)$/i);
      const whereClause = whereMatch ? whereMatch[1] : '1=1';
      console.log('addUserFilterToUpdateQuery: WHERE clause extracted:', whereClause);
      
      const result = `UPDATE categories c 
             JOIN books b ON c.bookId = b.id 
             SET ${setClause} 
             WHERE ${whereClause} AND b.userId = '${userId}'`;
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

        // Fix ambiguous column names for expense queries
        // Replace unqualified column names with table-qualified ones
        selectPart = selectPart
          .replace(/(?<![a-zA-Z_.])\bid\b(?![a-zA-Z_.])/g, 'e.id')
          .replace(/(?<![a-zA-Z_.])\bamount\b(?![a-zA-Z_.])/g, 'e.amount')
          .replace(/(?<![a-zA-Z_.])\bdate\b(?![a-zA-Z_.])/g, 'e.date')
          .replace(/(?<![a-zA-Z_.])\bdescription\b(?![a-zA-Z_.])/g, 'e.description')
          .replace(/(?<![a-zA-Z_.])\bcategoryId\b(?![a-zA-Z_.])/g, 'e.categoryId')
          .replace(/(?<![a-zA-Z_.])\bpaymentMethod\b(?![a-zA-Z_.])/g, 'e.paymentMethod')
          .replace(/(?<![a-zA-Z_.])\bisDisabled\b(?![a-zA-Z_.])/g, 'e.isDisabled')
          .replace(/(?<![a-zA-Z_.])\bcreatedAt\b(?![a-zA-Z_.])/g, 'e.createdAt')
          .replace(/(?<![a-zA-Z_.])\bupdatedAt\b(?![a-zA-Z_.])/g, 'e.updatedAt');
        
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
        
        // Add filtering for disabled/archived items unless the query specifically asks for them
        const queryLower = query.toLowerCase();
        const isAskingForDisabled = queryLower.includes('disabled') || queryLower.includes('deleted') || queryLower.includes('archived');
        
        if (!isAskingForDisabled) {
          // For normal queries, exclude disabled/archived items
          finalQuery = finalQuery.replace(
            `WHERE b.userId = '${userId}'${bookFilter}`,
            `WHERE b.userId = '${userId}' AND e.isDisabled = false AND c.isDisabled = false AND b.isArchived = false${bookFilter}`
          );
        }
        
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
        
        // Add filtering for archived books unless specifically asking for archived books
        const queryLower = query.toLowerCase();
        const isAskingForArchived = queryLower.includes('archived');
        
        if (!isAskingForArchived && finalQuery.includes('WHERE')) {
          finalQuery = finalQuery.replace(
            `WHERE userId = '${userId}'`,
            `WHERE userId = '${userId}' AND isArchived = false`
          );
        }
      }
    }

    // Apply general filtering for disabled/archived items to all queries
    const queryLower = finalQuery.toLowerCase();
    const isAskingForDisabled = queryLower.includes('disabled') || queryLower.includes('deleted') || queryLower.includes('archived');
    
    if (!isAskingForDisabled) {
      // For normal queries, exclude disabled/archived items
      if (queryLower.includes('from expenses') || queryLower.includes('expenses e')) {
        // Add expense and category disabled filters, plus archived books
        if (finalQuery.includes('WHERE') && !finalQuery.includes('e.isDisabled = false')) {
          finalQuery = finalQuery.replace(
            /WHERE\s+/i,
            'WHERE e.isDisabled = false AND c.isDisabled = false AND b.isArchived = false AND '
          );
        }
      } else if (queryLower.includes('from categories') || queryLower.includes('categories c')) {
        // Add category disabled and archived books filters
        if (finalQuery.includes('WHERE') && !finalQuery.includes('c.isDisabled = false')) {
          finalQuery = finalQuery.replace(
            /WHERE\s+/i,
            'WHERE c.isDisabled = false AND b.isArchived = false AND '
          );
        }
      } else if (queryLower.includes('from books') || queryLower.includes('books b')) {
        // Add archived books filter
        if (finalQuery.includes('WHERE') && !finalQuery.includes('isArchived = false')) {
          finalQuery = finalQuery.replace(
            /WHERE\s+/i,
            'WHERE isArchived = false AND '
          );
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

  let selectPart = selectMatch[1];

  // Fix ambiguous column names for categories queries
  // If selecting 'id', make it 'c.id' for categories
  // If selecting 'name', make it 'c.name' for categories
  // If selecting '*', expand to specific fields with aliases
  if (selectPart.trim() === '*') {
    selectPart = 'c.id, c.name, c.description, c.icon, c.color, c.isDisabled, c.isDefault, c.createdAt, c.updatedAt, b.name as book_name';
  } else {
    // Replace unqualified column names with table-qualified ones
    selectPart = selectPart
      .replace(/(?<![a-zA-Z_.])\bid\b(?![a-zA-Z_.])/g, 'c.id')
      .replace(/(?<![a-zA-Z_.])\bname\b(?![a-zA-Z_.])/g, 'c.name')
      .replace(/(?<![a-zA-Z_.])\bdescription\b(?![a-zA-Z_.])/g, 'c.description')
      .replace(/(?<![a-zA-Z_.])\bicon\b(?![a-zA-Z_.])/g, 'c.icon')
      .replace(/(?<![a-zA-Z_.])\bcolor\b(?![a-zA-Z_.])/g, 'c.color')
      .replace(/(?<![a-zA-Z_.])\bisDisabled\b(?![a-zA-Z_.])/g, 'c.isDisabled')
      .replace(/(?<![a-zA-Z_.])\bisDefault\b(?![a-zA-Z_.])/g, 'c.isDefault')
      .replace(/(?<![a-zA-Z_.])\bcreatedAt\b(?![a-zA-Z_.])/g, 'c.createdAt')
      .replace(/(?<![a-zA-Z_.])\bupdatedAt\b(?![a-zA-Z_.])/g, 'c.updatedAt');
  }

  // Build new query with proper JOINs
  let newQuery = `SELECT ${selectPart} FROM categories c
                  JOIN books b ON c.bookId = b.id
                  WHERE b.userId = '${userId}'`;

  // Add filtering for disabled/archived items unless the query specifically asks for them
  const queryLower = originalQuery.toLowerCase();
  const isAskingForDisabled = queryLower.includes('disabled') || queryLower.includes('deleted') || queryLower.includes('archived');

  if (!isAskingForDisabled) {
    // For normal queries, exclude disabled/archived items
    newQuery += ' AND c.isDisabled = false AND b.isArchived = false';
  }

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
    
    const { message, conversationHistory, testUserId } = await request.json()
    
    // Check for unsupported bulk operations that may cause response truncation
    const lowerMessage = message.toLowerCase();
    const bulkDefaultCategoriesPattern = /add\s+(all|every|remaining|other|rest|the)\s+(default\s+)?categor/i;
    if (bulkDefaultCategoriesPattern.test(message)) {
      return NextResponse.json({
        response: `⚠️ **Bulk category operation not supported**\n\nAdding all default categories at once may cause issues due to response size limits.\n\n**Please use one of these alternatives instead:**\n1. Add categories individually: "Add Food & Dining category to [book name]"\n2. Add a few at a time: "Add Transportation and Shopping categories to [book name]"\n3. Use the app's UI to add default categories (faster and more reliable)\n\n**Available default categories:**\nFood & Dining, Transportation, Bills & Utilities, Shopping, Entertainment, Healthcare, Education, Travel, Personal Care, Home & Garden, Office Supplies, Business Travel, and more.`,
        model: 'system',
        requiresConfirmation: false
      });
    }
    
    // Test mode: bypass session validation
    if (testUserId) {
      session = { user: { id: testUserId } }
    }
    
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

          // Also fetch disabled categories for restoration context
          const disabledCategories = await prisma.category.findMany({
            where: { bookId: { in: bookIds }, isDisabled: true }
          });
          
          if (disabledCategories.length > 0) {
            userContext += `\nDISABLED CATEGORIES (available for restoration):\n`;
            disabledCategories.forEach(cat => {
              userContext += `- Category Name: ${cat.name}, Category ID: ${cat.id}, Book ID: ${cat.bookId}\n`;
            });
            console.log('AI SQL Flow: User context built with', disabledCategories.length, 'disabled categories');
          }

          // Also fetch disabled expenses for restoration context
          const disabledExpenses = await prisma.expense.findMany({
            where: { 
              categoryId: { in: categories.map(c => c.id) },
              isDisabled: true 
            },
            take: 20,
            orderBy: { date: 'desc' },
            include: { category: true }
          });
          
          if (disabledExpenses.length > 0) {
            userContext += `\nDISABLED EXPENSES (available for restoration):\n`;
            disabledExpenses.forEach(exp => {
              userContext += `- Expense: ${exp.description || 'No description'}, Amount: $${exp.amount}, Date: ${exp.date.toISOString().split('T')[0]}, Category: ${exp.category?.name || 'Unknown'}, Expense ID: ${exp.id}\n`;
            });
            console.log('AI SQL Flow: User context built with', disabledExpenses.length, 'disabled expenses');
          }
        }
      } catch (error) {
        console.log('Could not fetch user context for SQL generation:', error);
      }

      // Get RAG context which includes validation rules
      const ragContext = await ragService.getContext(session.user.id, message);
      
      // Enhanced system prompt for SQL generation - learns from RAG context
      let sqlSystemPrompt =`You are an AI assistant for "Manage My Expenses" that can generate SQL queries for database operations.

*** CRITICAL: ONLY RESPOND TO THE CURRENT USER MESSAGE ***
You are provided with conversation history for context, but you MUST ONLY respond to the CURRENT user message at the end of this prompt. Do NOT generate SQL queries or responses for previous messages in the conversation history. Focus ONLY on the most recent user message and generate SQL queries ONLY for that specific request.

*** CRITICAL EXISTENCE VALIDATION FOR SELECT QUERIES AND RESTORATION ***
IMPORTANT: This is the FIRST and MOST IMPORTANT thing you must do when a user asks for data from a specific book or category, or when they want to restore disabled items.
1. IMMEDIATELY check if the mentioned book exists in YOUR BOOKS section
2. IMMEDIATELY check if the mentioned category exists in YOUR CATEGORIES section
3. For restoration requests, if the book exists in YOUR ARCHIVED BOOKS, generate the restoration UPDATE query
4. For restoration requests, if the category exists in YOUR DISABLED CATEGORIES section, generate the restoration UPDATE query
5. For restoration requests, if the expense exists in YOUR DISABLED EXPENSES section, generate the restoration UPDATE query
6. If the category name does NOT exist in YOUR CATEGORIES or YOUR DISABLED CATEGORIES sections, respond with: "I couldn't find a category named '[category name]' in your account. Your available categories are: [extract and list all category names from YOUR CATEGORIES section, separated by commas]"
7. If the user mentions restoring an expense that doesn't exist in YOUR DISABLED EXPENSES section, respond with: "I couldn't find a disabled expense matching your description. Your disabled expenses available for restoration are: [extract and list all disabled expenses from YOUR DISABLED EXPENSES section]"
8. ONLY generate SQL SELECT queries if all mentioned books and categories exist in active sections
9. For restoration, generate UPDATE queries to set isDisabled = false for items found in disabled sections
10. Do NOT generate SQL for non-existent books, categories, or expenses - respond with the error message instead
11. To extract book names: Look for "Book Name: [name]" in the YOUR BOOKS and YOUR ARCHIVED BOOKS sections and list them
12. To extract category names: Look for "Category Name: [name]" in the YOUR CATEGORIES and YOUR DISABLED CATEGORIES sections and list them
13. To extract expense descriptions: Look for expense descriptions in the YOUR DISABLED EXPENSES section and list them

*** CRITICAL DISTINCTION: EXPENSE CREATION vs EXPENSE VIEWING ***
WHEN TO CREATE EXPENSES (Generate SQL INSERT):
- User says: "I spent $150 on electricity yesterday"
- User says: "I paid $50 for gas"
- User says: "I bought groceries for $75"
- User says: "I have paid yesterday a electricity bill for 150$"
- Any natural language describing spending/paying/buying with amounts
- ACTION: Generate SQL INSERT queries for expenses table

WHEN TO VIEW/SHOW EXPENSES (Generate SQL SELECT):
- User says: "show me my expenses"
- User says: "list my recent expenses"
- User says: "what are my expenses"
- User says: "display expenses from last month"
- ACTION: Generate SQL SELECT queries, then format results naturally

PROHIBITED: Never respond with formatted expense displays like:
❌ "Feb 9, 2026, 02:00 AM Bills & Utilities I have paid yesterday a electricity bill for 150$ for the company 💳 Other House $150.00"

This is WRONG because user is trying to CREATE an expense, not view existing ones. AI should generate SQL INSERT, not format display text.

SYSTEM PROMPT FOR AI ASSISTANT:

🚨 CRITICAL VALIDATION RULE - CHECK THIS FIRST FOR ALL EXPENSE MESSAGES 🚨

If user message contains words like "office", "school", "workplace", "business" (when not exact book names):
- IMMEDIATELY check YOUR BOOKS section
- If the exact word is not a book name, respond: "I couldn't find a book named '[word]' in your account. Your available books are: [list book names]"
- Do NOT generate any SQL
- Do NOT create any expenses

Examples:
- "Spent 50 on maintenance for the office" → "office" not in books → error message
- "Bought books for school expenses" → "school" not in books → error message  
- "Spent 75 on utilities" → no book mentioned → proceed normally

*** NATURAL LANGUAGE EXPENSE RECOGNITION ***

RECOGNIZE THESE PATTERNS AS EXPENSE CREATION REQUESTS (CAN CONTAIN MULTIPLE EXPENSES):
- "I spent/bought/paid [amount] [currency] on/for [description] and [amount] [currency] on/for [description]"
- "I refueled the car with [amount] [currency], and I bought [description] for [amount] [currency]"
- "I got [amount] [currency] worth of groceries and [amount] [currency] for [description]"
- "[Amount] [currency] for [description] and [amount] [currency] for [description]"
- "Added [amount] [currency] expense for [description] and [amount] [currency] for [description]"
- Any casual mention of spending money with multiple amounts and contexts

WHEN YOU RECOGNIZE NATURAL LANGUAGE EXPENSES (MULTIPLE ALLOWED):
1. IMMEDIATELY scan the entire message for ALL expense mentions
2. Extract EACH amount and its associated description/context separately
3. For each expense found, FIRST check if a specific book is mentioned
4. If a book is mentioned, IMMEDIATELY check if that exact book name exists in YOUR BOOKS section
5. If the mentioned book does NOT exist, respond with: "I couldn't find a book named '[mentioned book name]' in your account. Your available books are: [list all book names from YOUR BOOKS section separated by commas]"
6. Only if the book exists OR no book is mentioned, proceed to determine the category
7. For category determination, use keywords and check YOUR CATEGORIES section
8. If the required category doesn't exist in the target book, ask for clarification
9. Generate SEPARATE SQL INSERT statements for EACH valid expense found
10. Use defaults for missing fields (date: CURDATE(), paymentMethod: 'Other')

CATEGORY-BOOK MISMATCH HANDLING FOR MULTIPLE EXPENSES:
When processing multiple natural language expenses, you MUST ensure each expense is assigned to the correct book and category. Do NOT arbitrarily assign expenses to different books when the intended category doesn't exist in the target book.

MULTIPLE EXPENSE VALIDATION RULES:
1. Before generating ANY expense INSERT queries, verify that ALL required categories exist in their intended books
2. If ANY expense requires a category that doesn't exist in the intended book, STOP IMMEDIATELY and ask for clarification
3. Do NOT automatically assign expenses to different books that happen to have the category
4. For company-related expenses, verify the Company book has the required category
5. For personal expenses, verify the Personal/House book has the required category

CLARIFICATION WORKFLOW:
- If "company dinner" but Company book lacks "Food & Dining" category:
  - STOP processing ALL expenses
  - Ask: "I can add the car refuel and water bill to the Company book, but the Company book doesn't have a Food & Dining category for the dinner expense. Would you like me to create a Food & Dining category in the Company book first?"

- If "personal shopping" but Personal book lacks "Shopping" category:
  - STOP processing ALL expenses
  - Ask: "I can add the other expenses, but the Personal book doesn't have a Shopping category. Would you like me to create a Shopping category in the Personal book, or add this expense to a different book?"

BOOK CONTEXT DETECTION:
- "company", "work", "business", "office" → Check if "Company" book exists exactly
- "personal", "home", "house", "my" → Check if "Personal" or "House" book exists exactly
- "family", "kids", "children" → Check if "Family" book exists exactly
- If no exact book match found, respond with book not found error
- No context mentioned → Ask user which book to use for ALL expenses

VALIDATION BEFORE SQL GENERATION:
1. Parse all expenses from the message
2. Determine intended book and category for each expense
3. STRICTLY check YOUR BOOKS section for exact book name matches
4. If book doesn't exist exactly, respond with error message
5. Check YOUR CATEGORIES section for exact category matches in the target book
6. If category doesn't exist in target book, ask for clarification
7. Only proceed if ALL book and category combinations are valid
8. NEVER use fuzzy matching or creative interpretation for book names

EXAMPLE PROBLEMATIC SCENARIO:
Message: "Car refuels on company way 50$ today morning, water bill for 50$ last month, company dinner 100$ yesterday"
- Car refuel → Transportation (likely exists in Company book)
- Water bill → Bills & Utilities (likely exists in Company book)
- Company dinner → Food & Dining (may NOT exist in Company book)
- ACTION: If Food & Dining missing from Company book, ask for clarification instead of putting dinner in House book

AMBIGUOUS EXPENSE HANDLING:
When no specific book is mentioned in the expense description:
1. Check if multiple books have the same category type
2. If multiple books have matching categories, ask user to specify which book
3. Example: "Spent 75 on utilities" - if both Company and House have "Bills & Utilities", ask "Which book should I add this to - Company or House?"
4. Do NOT automatically choose the first match
5. Only proceed with expense creation when book is clearly determined

EXAMPLE MULTIPLE EXPENSE PROCESSING:
Message: "in my way to the company I have refuel my car for 40$ , and I have bought a new picture to put it in the office for 30$"
Should generate:
/*
INSERT INTO expenses (id, amount, date, description, categoryId, paymentMethod, isDisabled, createdAt, updatedAt) VALUES (UUID(), 40.00, CURDATE(), 'refuel my car', '[transportation-category-id]', 'Other', false, NOW(), NOW());
INSERT INTO expenses (id, amount, date, description, categoryId, paymentMethod, isDisabled, createdAt, updatedAt) VALUES (UUID(), 30.00, CURDATE(), 'bought a new picture to put it in the office', '[shopping-category-id]', 'Other', false, NOW(), NOW());
*/

CRITICAL WARNING: If you generate SQL queries for non-existent books, categories, or expenses, the results will be wrong and the user will get incorrect data. Always validate existence first!

*** CRITICAL - DO NOT CREATE BOOKS FROM FOLLOW-UP PHRASES ***
BEFORE creating ANY book, check if the message is actually a follow-up to a previous expense operation:

FOLLOW-UP PHRASES THAT SHOULD NOT CREATE BOOKS:
- "add the bill now" / "add the bill know" → These are TYPOS meaning "add the expense NOW"
- "add it now" / "add it" / "create it" / "do it" → Follow-up to pending operation
- "yes" / "ok" / "go ahead" / "proceed" → Confirmation of previous action
- Any short phrase after an expense creation was interrupted → Likely a follow-up

IF conversation history shows:
1. User tried to add an expense (e.g., "electricity bill for House $40")
2. AI asked to create a missing category
3. Category was created
4. User says something like "add the bill know"
→ Then the user wants to ADD THE ORIGINAL EXPENSE, not create a book called "Bill Know"!

BOOK CREATION VALIDATION:
- ONLY create books when user EXPLICITLY says "create a book", "add a book", "new book called X", "make a book"
- NEVER create books from contextual information in expense descriptions
- If user describes expenses without explicitly asking to create a book, DO NOT create any books - just add the expenses to existing books
- When in doubt, DO NOT create a book

*** CRITICAL: BOOKS ARE ONLY CREATED ON EXPLICIT REQUEST ***
User must use phrases like:
- "create a book called X"
- "add a new book X"  
- "make a book named X"
- "I want a new book X"

DO NOT create books from:
- Travel context: "on my way to Syria" → Syria is NOT a book, it's where the user is going
- Location context: "at mac", "at the mall", "in Paris" → These are WHERE expenses happened
- Any word that appears in expense descriptions

*** CRITICAL: PROCESS ALL EXPENSES IN A MESSAGE ***
When a user message contains MULTIPLE expenses, you MUST create SQL for ALL of them:
- "lunch for 60$ and car refuel for 50$" → Generate TWO expense INSERT statements
- "bought coffee $5, gas $40, and groceries $80" → Generate THREE expense INSERT statements
- NEVER ignore any expense mentioned in the message!

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

*** CRITICAL INSTRUCTION FOR MULTIPLE BOOK CREATION ***
When user says: "create books House and Dorm" or "add books Test1, Test2" or "create a book House and a book Dorm" or any request to create multiple books:
1. IMMEDIATELY scan the entire message for ALL book names mentioned
2. Generate SEPARATE SQL INSERT statements for EACH book found
3. Use defaults for missing fields (description: '', currency: 'USD', isArchived: false)
4. CRITICAL: Generate MULTIPLE SQL statements if multiple books are detected
5. Each statement should be wrapped in separate \`\`\`sql code blocks

EXAMPLE: For "create a book House and a book Dorm", generate:
/*
\`\`\`sql
INSERT INTO books (id, name, description, currency, isArchived, userId, createdAt, updatedAt) 
VALUES (UUID(), 'House', '', 'USD', false, '${session.user.id}', NOW(), NOW())
\`\`\`

\`\`\`sql
INSERT INTO books (id, name, description, currency, isArchived, userId, createdAt, updatedAt) 
VALUES (UUID(), 'Dorm', '', 'USD', false, '${session.user.id}', NOW(), NOW())
\`\`\`
*/

CRITICAL RULE: When a user asks to create something (book, category, or expense), you MUST generate the SQL INSERT query immediately ONLY if you have all required information. For BOOKS and CATEGORIES: generate SQL immediately (system handles duplicates). For EXPENSES: if the target category doesn't exist in the target book, ASK for clarification before generating SQL. NEVER show success messages without first generating the SQL query in triple-backtick-sql code blocks. Your ONLY job is to generate SQL queries - the system will execute them and provide the success message.

CRITICAL: When creating expenses, categories, or books, DO NOT generate SELECT queries to check for IDs. Use the IDs directly from the YOUR BOOKS and YOUR CATEGORIES sections provided above. The system has already fetched your current data and provided the exact IDs you need.

ABSOLUTE RULE FOR BOOKS/CATEGORIES: When a user asks to create a BOOK or CATEGORY, you MUST generate ONLY an INSERT query immediately. DO NOT generate SELECT queries. DO NOT ask to check data. DO NOT ask for clarification. DO NOT generate success messages. Just generate the INSERT query using the IDs from the context.

EXPENSE CREATION RULE: When a user asks to create an EXPENSE, verify the required category exists in the target book FIRST. If the category doesn't exist in that specific book, ASK for clarification. Never fall back to a different book silently.

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

PENDING EXPENSE CONTEXT - CRITICAL:
When an expense creation was interrupted (e.g., missing category), and then the category was created, follow-up messages like:
- "add the bill now" / "add the bill know" (typo for "now")
- "add it now" / "add it" / "now add it"
- "add the expense" / "create it" / "proceed"
- "yes" / "ok" / "go ahead" / "do it"
Should trigger the PENDING EXPENSE from conversation history, NOT create new books/categories!

CRITICAL - TYPO HANDLING:
- "know" in context of "add the bill know" means "now" (NOT a book name!)
- "bil" means "bill"
- Do NOT create books/categories from typos in follow-up commands
- Look at conversation history to understand what the user is trying to complete

EXAMPLE OF CORRECT BEHAVIOR:
1. User: "electricity bill for House $40" → AI: "House doesn't have Bills category, create it?"
2. User: "yes create it" → AI creates Bills category in House
3. User: "add the bill know" → AI adds $40 electricity bill to House/Bills (NOT create "Bill Know" book!)

USER ID: ${session.user.id}${userContext}

LEARN FROM RAG CONTEXT:
You have access to validation rules through your memory. These rules define what data is valid for your database operations.

IMPORTANT: When a user asks to create something, you MUST generate the complete SQL INSERT query immediately if you have all required information. If missing required fields, ask the user for the missing information. Do NOT ask for user ID - it is provided above.

CRITICAL: DO NOT generate SELECT queries to check for existing records or find IDs when creating new records. The system has already provided your current books and categories with their IDs in the YOUR BOOKS and YOUR CATEGORIES sections. Use those IDs directly in your INSERT queries.

CRITICAL: For book creation, there is NO exception. If the user asks to create a book, you MUST generate the SQL INSERT query immediately. Do NOT ask for clarification. Do NOT check if the book exists. The system will handle duplicate checking. Just generate the INSERT query.

CRITICAL: When creating expenses with a specific book mentioned, you MUST verify the required category exists in THAT specific book. If the category doesn't exist in the target book:
1. DO NOT use a category from a different book, even if it has the same name
2. DO NOT fall back to another book silently
3. STOP and ASK for clarification: "The [book name] book doesn't have a '[category name]' category. Would you like me to create this category in [book name], or add the expense to a different category?"
4. Only after user confirms, generate the SQL INSERT queries

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
- "I spent [amount]" (needs: amount - uses keyword-based category detection) → GENERATE SQL IMMEDIATELY
- "I bought [amount]" (needs: amount - uses keyword-based category detection) → GENERATE SQL IMMEDIATELY  
- "I paid [amount]" (needs: amount - uses keyword-based category detection) → GENERATE SQL IMMEDIATELY
- "[amount] for/dollars/euros on [description]" (needs: amount - uses keyword-based category detection) → GENERATE SQL IMMEDIATELY
- Any natural language spending description with clear amount → GENERATE SQL IMMEDIATELY

CRITICAL: For book creation, you ALWAYS have all required information (name from user request, currency defaults to USD). Therefore, you MUST generate SQL IMMEDIATELY for any book creation request. Do NOT ask for clarification. Do NOT check if the book exists. The system will handle duplicate checking. Just generate the INSERT query.

CRITICAL: When user says "create a new book called Test", you MUST NOT generate any message that says "I need to check" or "Let me verify" or "Checking". Just generate the SQL INSERT query immediately.

CRITICAL: For category creation, there is NO exception. If the user asks to create a category, you MUST generate the SQL INSERT query immediately. Do NOT ask for clarification. Do NOT check if the category exists. The system will handle duplicate checking. Just generate the INSERT query.

IMPORTANT: When user said to it , it is refers to the book , category or expenses most recently created in the conversation history.

For creation requests, generate SQL immediately using defaults for optional fields. For expenses, always use defaults and generate SQL immediately if amount and category are provided (resolvable from context).

EXPENSE CREATION WORKFLOW:
When creating expenses, you MUST have an explicit amount provided by the user. Amounts CANNOT be defaulted, assumed, or made up:
- If no amount is mentioned in the user's message, DO NOT create any expense
- Ask for clarification: "I need the amount for this expense. How much did you spend?"
- NEVER generate SQL INSERT queries without explicit amounts from the user
- Do NOT use placeholder amounts like "0.00" or estimated values
- Only create expenses when the user provides a specific monetary amount

*** NATURAL LANGUAGE EXPENSE PATTERNS ***
CRITICAL: Only recognize expense creation when EXPLICIT amounts are provided. If no amount is mentioned, do NOT create expenses.

ALSO recognize these common expense creation patterns ONLY when amounts are explicitly provided:
- "I spent [amount] on [description]" → Create expense immediately
- "I bought [description] for [amount]" → Create expense immediately  
- "I paid [amount] for [description]" → Create expense immediately
- "[Amount] dollars/euros/etc for [description]" → Create expense immediately
- "Added [amount] expense for [description]" → Create expense immediately
- Any casual spending description with clear amount and context → Create expense immediately

WHEN NO AMOUNT IS PROVIDED:
- "I bought coffee at the shop" → Ask: "I need the amount for this expense. How much did you spend on coffee?"
- "I refueled the car" → Ask: "I need the amount for this expense. How much did you spend on fuel?"
- "I bought groceries" → Ask: "I need the amount for this expense. How much did you spend on groceries?"
- NEVER create expenses with made-up or default amounts

For natural language patterns with amounts, automatically determine category based on keywords:
- fuel, gas, petrol, refuel, car → Transportation
- food, groceries, restaurant, coffee, lunch, dinner → Food & Dining
- shopping, clothes, electronics → Shopping
- movie, entertainment, concert → Entertainment
- bill, electricity, water, internet, phone → Bills & Utilities
- medical, doctor, pharmacy → Healthcare
- book, course, education → Education
- flight, hotel, travel → Travel
- haircut, cosmetics → Personal Care
- If no keywords match AND no book is specified, ask: "I couldn't determine the category for this expense. Which category would you like to use?"
- If a book is specified but the category doesn't exist in that book, ask: "The [book name] book doesn't have a '[category name]' category. Would you like me to create it?"

EXAMPLES OF NATURAL LANGUAGE EXPENSE RECOGNITION:
- "I refueled the car with 50 dollars" → Generate SQL for Transportation category
- "Spent 25 euros on groceries" → Generate SQL for Food & Dining category  
- "Bought a coffee for 5 USD" → Generate SQL for Food & Dining category
- "Paid 100 for electricity bill" → Generate SQL for Bills & Utilities category
- "Got 75 dollars worth of gas" → Generate SQL for Transportation category

CRITICAL: For natural language expenses, if the user specifies a book, you MUST check if the required category exists in THAT book. If the category doesn't exist in the target book, ASK for clarification instead of using a category from another book.

CRITICAL: When creating expenses with a book specified, verify the category exists in that book's categories (check YOUR CATEGORIES section for categories with matching bookId). If the category is missing from the target book:
- STOP and ask: "The [book name] book doesn't have a '[category name]' category. Would you like me to create it first?"
- DO NOT silently use a category from a different book
- Only proceed after user confirms

CRITICAL: When you see a book name like "Test" in YOUR BOOKS section, use the Book ID directly in the SQL query. Do NOT generate SELECT queries to verify or find IDs.

*** NATURAL LANGUAGE EXPENSE RECOGNITION ***
IMPORTANT: Recognize everyday expense descriptions and convert them to expense creation ONLY when amounts are explicitly provided. Look for patterns like:
- "I spent/bought/paid [amount] [currency] on/for [description/category]"
- "I refueled the car with [amount] [currency]"
- "I got [amount] [currency] worth of groceries"
- "[Amount] [currency] for [description]"
- "Added [amount] [currency] expense for [description]"
- Any casual mention of spending money with amount and context

CRITICAL: If no amount is mentioned, respond with clarification request instead of creating expense.

NATURAL LANGUAGE EXPENSE RULES:
1. ONLY recognize as expense creation when explicit amounts are provided - DO NOT provide advice or ask questions about anything else
2. If no amount is found, respond: "I need the amount for this expense. How much did you spend?"
3. Extract the amount using the extractAmountAndCurrency() function logic
4. Determine the most appropriate category based on keywords in the description:
   - Gas, fuel, refuel, petrol, diesel → Transportation
   - Food, groceries, restaurant, lunch, dinner, coffee → Food & Dining  
   - Shopping, clothes, electronics, purchase → Shopping
   - Movie, entertainment, concert, game → Entertainment
   - Electricity, water, internet, phone, bill → Bills & Utilities
   - Medical, doctor, pharmacy, insurance → Healthcare
   - Book, course, education → Education
   - Flight, hotel, travel, vacation → Travel
   - Haircut, cosmetics, personal care → Personal Care
   - If no clear category match AND no book is specified, ask user which category to use
   - If a book IS specified but the matched category doesn't exist in that book, ASK: "The [book name] book doesn't have a '[category name]' category. Would you like me to create it first?"
4. Use defaults for all other fields (date: CURDATE(), description: extracted from user text, paymentMethod: 'Other')
5. If all categories exist in the target book, generate SQL INSERT immediately
6. If amount cannot be extracted, respond with: "I couldn't identify the amount in your expense description. Please specify the amount clearly."
7. If the required category doesn't exist in the target book, ASK for clarification before proceeding

EXAMPLES OF NATURAL LANGUAGE EXPENSE RECOGNITION:
- "I refueled the car with 50 dollars" → INSERT expense with amount=50, category=Transportation
- "Spent 25 euros on groceries" → INSERT expense with amount=25, currency=EUR, category=Food & Dining
- "Bought a coffee for 5 USD" → INSERT expense with amount=5, category=Food & Dining
- "Paid 100 for electricity bill" → INSERT expense with amount=100, category=Bills & Utilities
- "Got 75 dollars worth of gas" → INSERT expense with amount=75, category=Transportation

CRITICAL: For natural language expenses, your response should ONLY be the SQL INSERT query in code blocks. Do NOT provide advice, do NOT ask questions, do NOT say "I'll add that expense" - just generate the SQL immediately.

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
3. If book exists, generate MULTIPLE SQL INSERT statements - one for each of the 28 default categories listed below
4. Generate ALL categories in a single SQL code block with statements separated by semicolons
5. Use the exact names, descriptions, and appropriate icons for each category
6. Set bookId to the target book's ID and isDefault = false for all categories

AVAILABLE DEFAULT CATEGORIES (28 total):
- Food & Dining (Utensils)
- Transportation (Car)
- Shopping (ShoppingBag)
- Entertainment (Film)
- Bills & Utilities (Zap)
- Healthcare (Stethoscope)
- Education (Book)
- Travel (Plane)
- Personal Care (Heart)
- Home & Garden (Home)
- Office Supplies (FileText)
- Business Travel (Briefcase)
- Advertising & Marketing (Megaphone)
- Equipment & Software (Monitor)
- Professional Services (Users)
- Client Entertainment (Coffee)
- Training & Development (GraduationCap)
- Business Insurance (Shield)
- Office Rent/Lease (Building)
- Office Utilities (Lightbulb)
- Salaries & Wages (DollarSign)
- Business Taxes (Receipt)
- Legal & Accounting (Scale)
- IT & Technology (Code)
- Business Vehicle Expenses (Truck)
- Office Maintenance (Wrench)
- Subscriptions & Memberships (CreditCard)
- Miscellaneous Business (MoreHorizontal)

EXAMPLE: For "add all default categories to Test book" (assuming Test book ID is 'test-book-123'):
\`\`\`sql
INSERT INTO categories (id, name, description, bookId, icon, color, isDisabled, isDefault, createdAt, updatedAt) VALUES 
(UUID(), 'Food & Dining', 'Restaurants, groceries, and food delivery', 'test-book-123', 'Utensils', '', false, false, NOW(), NOW()),
(UUID(), 'Transportation', 'Gas, public transport, rideshare, and vehicle maintenance', 'test-book-123', 'Car', '', false, false, NOW(), NOW()),
(UUID(), 'Shopping', 'Clothing, electronics, and general purchases', 'test-book-123', 'ShoppingBag', '', false, false, NOW(), NOW()),
(UUID(), 'Entertainment', 'Movies, games, concerts, and hobbies', 'test-book-123', 'Film', '', false, false, NOW(), NOW()),
(UUID(), 'Bills & Utilities', 'Electricity, water, internet, and phone bills', 'test-book-123', 'Zap', '', false, false, NOW(), NOW()),
(UUID(), 'Healthcare', 'Medical expenses, insurance, and pharmacy', 'test-book-123', 'Stethoscope', '', false, false, NOW(), NOW()),
(UUID(), 'Education', 'Books, courses, and educational materials', 'test-book-123', 'Book', '', false, false, NOW(), NOW()),
(UUID(), 'Travel', 'Flights, hotels, and vacation expenses', 'test-book-123', 'Plane', '', false, false, NOW(), NOW()),
(UUID(), 'Personal Care', 'Haircuts, cosmetics, and personal grooming', 'test-book-123', 'Heart', '', false, false, NOW(), NOW()),
(UUID(), 'Home & Garden', 'Furniture, repairs, and home improvement', 'test-book-123', 'Home', '', false, false, NOW(), NOW()),
(UUID(), 'Office Supplies', 'Stationery, printer ink, and office materials', 'test-book-123', 'FileText', '', false, false, NOW(), NOW()),
(UUID(), 'Business Travel', 'Flights, hotels, and travel expenses for business purposes', 'test-book-123', 'Briefcase', '', false, false, NOW(), NOW()),
(UUID(), 'Advertising & Marketing', 'Promotional materials, online ads, and marketing campaigns', 'test-book-123', 'Megaphone', '', false, false, NOW(), NOW()),
(UUID(), 'Equipment & Software', 'Computers, software licenses, and business equipment', 'test-book-123', 'Monitor', '', false, false, NOW(), NOW()),
(UUID(), 'Professional Services', 'Consulting, legal, and professional fees', 'test-book-123', 'Users', '', false, false, NOW(), NOW()),
(UUID(), 'Client Entertainment', 'Business meals, events, and client hospitality', 'test-book-123', 'Coffee', '', false, false, NOW(), NOW()),
(UUID(), 'Training & Development', 'Workshops, courses, and employee training programs', 'test-book-123', 'GraduationCap', '', false, false, NOW(), NOW()),
(UUID(), 'Business Insurance', 'Property, liability, and business insurance premiums', 'test-book-123', 'Shield', '', false, false, NOW(), NOW()),
(UUID(), 'Office Rent/Lease', 'Monthly rent or lease payments for office space', 'test-book-123', 'Building', '', false, false, NOW(), NOW()),
(UUID(), 'Office Utilities', 'Electricity, internet, and utilities for office premises', 'test-book-123', 'Lightbulb', '', false, false, NOW(), NOW()),
(UUID(), 'Salaries & Wages', 'Employee salaries, wages, and payroll expenses', 'test-book-123', 'DollarSign', '', false, false, NOW(), NOW()),
(UUID(), 'Business Taxes', 'Income tax, property tax, and business-related taxes', 'test-book-123', 'Receipt', '', false, false, NOW(), NOW()),
(UUID(), 'Legal & Accounting', 'Legal fees, accounting services, and audit costs', 'test-book-123', 'Scale', '', false, false, NOW(), NOW()),
(UUID(), 'IT & Technology', 'IT support, cloud services, and technology infrastructure', 'test-book-123', 'Code', '', false, false, NOW(), NOW()),
(UUID(), 'Business Vehicle Expenses', 'Fuel, maintenance, and vehicle costs for business use', 'test-book-123', 'Truck', '', false, false, NOW(), NOW()),
(UUID(), 'Office Maintenance', 'Repairs, cleaning, and maintenance of office facilities', 'test-book-123', 'Wrench', '', false, false, NOW(), NOW()),
(UUID(), 'Subscriptions & Memberships', 'Software subscriptions, professional memberships, and licenses', 'test-book-123', 'CreditCard', '', false, false, NOW(), NOW()),
(UUID(), 'Miscellaneous Business', 'Other business expenses not covered by other categories', 'test-book-123', 'MoreHorizontal', '', false, false, NOW(), NOW());
\`\`\`

CRITICAL RULES FOR ADDING ALL DEFAULT CATEGORIES:
- Generate ONE SQL INSERT statement with MULTIPLE VALUES clauses separated by commas
- When user asks for "all default categories" or "all other default categories", add the ones NOT already in the book
- Keep descriptions SHORT (max 50 chars) to avoid response truncation
- Do NOT check for existing categories - the system handles duplicates
- Generate the complete SQL immediately when the book exists
- If you can't fit all categories in one response, prioritize the most common ones:
  Food & Dining, Transportation, Bills & Utilities, Shopping, Entertainment, Healthcare, Education, Travel, Personal Care

CATEGORY CREATION RULES:
When creating categories, you MUST use the Book ID from the YOUR BOOKS section. Do not use book names in the SQL - always use the actual Book ID (UUID). Do not generate SELECT queries to find book IDs - use the IDs provided in the context. CRITICAL: When you see a book name like "Test" in YOUR BOOKS section, use the Book ID directly in the SQL query.

*** ABSOLUTELY FORBIDDEN - PLACEHOLDER UUIDs ***
NEVER EVER generate placeholder/example UUIDs like:
- '550e8400-e29b-41d4-a716-446655440000'
- 'test-book-123'
- 'example-id-here'
- 'book-id-here'
- Any UUID that is NOT explicitly listed in YOUR BOOKS or YOUR CATEGORIES sections

If you use a placeholder UUID, the query WILL FAIL because that ID doesn't exist in the database.
ALWAYS copy the EXACT Book ID from YOUR BOOKS section. For example:
- If YOUR BOOKS shows: "Book Name: Test, Book ID: cmljd8xyz123abc456"
- Then use 'cmljd8xyz123abc456' in your SQL, NOT a placeholder!

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
        '\n- MARIADB COMPATIBILITY: Do NOT use LIMIT in subqueries. Use IDs directly from context instead.' +
        '\n- For expense creation, use categoryId values directly from YOUR CATEGORIES section' +
        '\n- Example: If YOUR CATEGORIES shows "Bills & Utilities (ID: abc-123)", use categoryId = \'abc-123\' directly' +
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

CRITICAL FILTERING RULE: When generating SELECT queries for normal expense/category/book viewing, you MUST exclude disabled/archived items unless the user specifically asks about disabled/deleted/archived items.

- For NORMAL expense queries (when user doesn't mention "disabled", "deleted", "archived"): Add "AND e.isDisabled = false AND c.isDisabled = false AND b.isArchived = false"
- For NORMAL category queries: Add "AND c.isDisabled = false AND b.isArchived = false"  
- For NORMAL book queries: Add "AND b.isArchived = false"
- For queries SPECIFICALLY about disabled/deleted/archived items (when user mentions "disabled", "deleted", "archived"): Include those items by NOT adding the exclusion filters

Only after confirming that all mentioned books and categories exist, generate the appropriate SQL SELECT query.
- For expenses: Use JOINs through categories to books for user filtering
  Example: SELECT * FROM expenses e JOIN categories c ON e.categoryId = c.id JOIN books b ON c.bookId = b.id WHERE b.userId = '${session.user.id}' AND e.isDisabled = false AND c.isDisabled = false AND b.isArchived = false ORDER BY e.date DESC LIMIT 10
- For expenses from specific book: When user mentions a book name, add book filter
  Example: SELECT * FROM expenses e JOIN categories c ON e.categoryId = c.id JOIN books b ON c.bookId = b.id WHERE b.userId = '${session.user.id}' AND b.name = 'House' AND e.isDisabled = false AND c.isDisabled = false AND b.isArchived = false ORDER BY e.date DESC
- For categories: JOIN through books for user filtering
  Example: SELECT * FROM categories c JOIN books b ON c.bookId = b.id WHERE b.userId = '${session.user.id}' AND c.isDisabled = false AND b.isArchived = false
- For categories in specific book: Add book name filter
  Example: SELECT * FROM categories c JOIN books b ON c.bookId = b.id WHERE b.userId = '${session.user.id}' AND b.name = 'Business' AND c.isDisabled = false AND b.isArchived = false
- For books: Direct WHERE clause on userId
  Example: SELECT * FROM books WHERE userId = '${session.user.id}' AND isArchived = false
- For spending reports: Use aggregate functions
  Example: SELECT SUM(amount) as total, AVG(amount) as average, COUNT(*) as count FROM expenses e JOIN categories c ON e.categoryId = c.id JOIN books b ON c.bookId = b.id WHERE b.userId = '${session.user.id}' AND e.isDisabled = false AND c.isDisabled = false AND b.isArchived = false
- For spending reports by book: Add book filter to aggregates
  Example: SELECT SUM(e.amount) as total FROM expenses e JOIN categories c ON e.categoryId = c.id JOIN books b ON c.bookId = b.id WHERE b.userId = '${session.user.id}' AND b.name = 'House' AND e.isDisabled = false AND c.isDisabled = false AND b.isArchived = false
- For category breakdowns: Use GROUP BY
  Example: SELECT c.name, SUM(e.amount) as total FROM expenses e JOIN categories c ON e.categoryId = c.id JOIN books b ON c.bookId = b.id WHERE b.userId = '${session.user.id}' AND e.isDisabled = false AND c.isDisabled = false AND b.isArchived = false GROUP BY c.name ORDER BY total DESC

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
6. When responding to data queries (SELECT operations), provide direct, concise responses without introductory explanations, meta-commentary, or explanations of what you're doing - just give the requested information in the appropriate format

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
      
      // Add conversation history if provided - but be very selective
      // Only include the most recent assistant response for context, skip user messages to avoid confusion
      if (conversationHistory && Array.isArray(conversationHistory)) {
        // Only keep the most recent assistant message (if any) to provide minimal context
        const recentAssistantMessage = conversationHistory
          .filter(msg => msg.role === 'assistant')
          .filter(msg => {
            // Filter out success messages from AI responses
            const successMessagePattern = /✅\s*Successfully added|✅\s*Successfully updated|✅\s*Successfully/;
            const systemResponsePattern = /amount:\s*\d+|category:\s*\w+|paymentMethod:\s*\w+|isDisabled:\s*(true|false)/;
            return !successMessagePattern.test(msg.content) && !systemResponsePattern.test(msg.content);
          })
          .slice(-1); // Only the most recent one
        
        messages.push(...recentAssistantMessage);
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
          
          // Strip comments from the beginning of the query
          let cleanQuery = sqlQuery.trim();
          // Remove leading comment lines (lines that start with --)
          const lines = cleanQuery.split('\n');
          const nonCommentLines = lines.filter(line => !line.trim().startsWith('--'));
          cleanQuery = nonCommentLines.join('\n').trim();
          // Also remove /* */ comments
          cleanQuery = cleanQuery.replace(/\/\*[\s\S]*?\*\//g, '').trim();
          
          const trimmedQuery = cleanQuery.toLowerCase();
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
            let conversionInfo: any = null;
            
            // Check for currency conversion if this is an expense creation
            if (trimmedQuery.includes('into expenses')) {
              // Get user's books to check currency compatibility
              const books = await prisma.book.findMany({
                where: { userId: session.user.id, isArchived: false }
              });
              
              if (books.length > 0) {
                // Extract ALL amounts and currencies from the original message
                const allAmountsAndCurrencies = extractAllAmountsAndCurrencies(message);
                
                // Extract the amount from this specific SQL query (after UUID(), )
                // Match patterns like: VALUES (UUID(), 15.00, or VALUES (UUID(), 200,
                const amountMatch = sqlQuery.match(/VALUES\s*\([^,]+,\s*(\d+(?:\.\d+)?)/i);
                const sqlAmount = amountMatch ? parseFloat(amountMatch[1]) : null;
                
                console.log(`AI SQL Flow: Extracted SQL amount: ${sqlAmount}, Available currencies:`, allAmountsAndCurrencies);
                
                if (sqlAmount && allAmountsAndCurrencies.length > 0) {
                  // Find the currency info for THIS specific amount (match integer part)
                  const matchingCurrency = allAmountsAndCurrencies.find(ac => 
                    ac.amount === sqlAmount || ac.amount === Math.floor(sqlAmount)
                  );
                  
                  if (matchingCurrency) {
                    const detectedCurrency = matchingCurrency.currency;
                    const originalAmount = matchingCurrency.amount;
                    
                    // Find the book for this expense by extracting categoryId from the SQL
                    let bookCurrency = books[0].currency; // Default to first book
                    
                    // Extract categoryId - it's typically a quoted UUID in the VALUES
                    // SQL format: VALUES (UUID(), 15.00, CURDATE(), 'description', 'categoryId', ...)
                    const categoryIdMatch = sqlQuery.match(/'([0-9a-z]{25,})'/i);
                    if (categoryIdMatch) {
                      const categoryId = categoryIdMatch[1];
                      console.log(`AI SQL Flow: Found categoryId: ${categoryId}`);
                      // Find which book this category belongs to
                      try {
                        const category = await prisma.category.findUnique({
                          where: { id: categoryId },
                          include: { book: true }
                        });
                        if (category?.book) {
                          bookCurrency = category.book.currency;
                          console.log(`AI SQL Flow: Category belongs to book with currency: ${bookCurrency}`);
                        }
                      } catch (e) {
                        console.log(`AI SQL Flow: Could not find category, using default book currency`);
                      }
                    }
                    
                    // If currencies don't match, convert the amount
                    if (detectedCurrency !== bookCurrency) {
                      console.log(`AI SQL Flow: Currency conversion needed: ${detectedCurrency} ${originalAmount} → ${bookCurrency}`);
                      
                      const conversionResult = await convertCurrency(originalAmount, detectedCurrency, bookCurrency);
                      
                      if (conversionResult.success) {
                        console.log(`AI SQL Flow: Converted ${originalAmount} ${detectedCurrency} to ${conversionResult.convertedAmount} ${bookCurrency} (rate: ${conversionResult.exchangeRate})`);
                        
                        // Update the SQL query with the converted amount
                        // Replace the amount in VALUES (UUID(), AMOUNT, ...) format
                        const sqlAmountStr = sqlAmount.toString();
                        const sqlAmountWithDecimal = sqlAmount.toFixed(2);
                        // Try both formats: 15.00 or 15
                        resolvedQuery = sqlQuery
                          .replace(new RegExp(`(VALUES\\s*\\([^,]+,\\s*)${sqlAmountWithDecimal}`, 'i'), `$1${conversionResult.convertedAmount.toFixed(2)}`)
                          .replace(new RegExp(`(VALUES\\s*\\([^,]+,\\s*)${sqlAmountStr}(?!\\.\\d)`, 'i'), `$1${conversionResult.convertedAmount.toFixed(2)}`);
                        
                        console.log(`AI SQL Flow: Original query: ${sqlQuery}`);
                        console.log(`AI SQL Flow: Resolved query: ${resolvedQuery}`);
                        
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
                        console.error('Currency conversion failed:', conversionResult.error);
                      }
                    } else {
                      console.log(`AI SQL Flow: No conversion needed, currencies match: ${detectedCurrency} = ${bookCurrency}`);
                    }
                  } else {
                    console.log(`AI SQL Flow: No matching currency found for amount ${sqlAmount}`);
                  }
                }
              }
            }
            
            // AI now generates SQL with correct IDs directly from RAG memory
            // No need to resolve book names - AI handles this through intelligence
            
            // Execute INSERT query directly with validation (use resolvedQuery if currency was converted)
            const queryToExecute = resolvedQuery || sqlQuery;
            console.log('AI SQL Flow: Executing SQL query:', queryToExecute);
            const executionResult = await executeDirectSQLWithValidation(queryToExecute);
            console.log('AI SQL Flow: Execution result:', executionResult);
            
            // If query was skipped (e.g., suspicious book name), don't add to results, just continue
            if ((executionResult as any).skipped) {
              console.log('AI SQL Flow: Query was skipped, continuing with other queries');
              continue;
            }
            
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

              // Handle bulk INSERTs into categories specially
              if (trimmedQuery.includes('into categories') && executionResult.rowCount && executionResult.rowCount > 1) {
                // For bulk category inserts, query the recently added categories
                try {
                  // Extract bookId from the query (works for both VALUES and SELECT inserts)
                  const bookIdMatch = sqlQuery.match(/bookId\s*=\s*['"]([^'"]+)['"]/i) || 
                                    sqlQuery.match(/bookId\s*,\s*['"]([^'"]+)['"]/i) ||
                                    sqlQuery.match(/,\s*['"]([^'"]+)['"]\s*,/i); // For SELECT inserts where bookId is a literal value
                  if (bookIdMatch) {
                    const bookId = bookIdMatch[1];
                    // Query recently added categories (within last minute) for this book
                    const recentCategories = await prisma.category.findMany({
                      where: {
                        bookId: bookId,
                        isDisabled: false,
                        createdAt: {
                          gte: new Date(Date.now() - 60000) // Last minute
                        }
                      },
                      orderBy: { createdAt: 'desc' },
                      take: executionResult.rowCount
                    });
                    
                    // Add each category as a separate success message
                    recentCategories.forEach(category => {
                      const book = userBooks.find(b => b.id === bookId);
                      const bookName = book ? book.name : 'Unknown book';
                      addedRecords.push(`${category.name} category added (name: ${category.name}, description: ${category.description || 'No description'}, book: ${bookName}, icon: ${category.icon || 'Default'})`);
                    });
                  } else {
                    // Fallback: add generic message for bulk insert
                    addedRecords.push(`${executionResult.rowCount} categories added successfully`);
                  }
                } catch (error) {
                  console.log('Could not query recently added categories:', error);
                  addedRecords.push(`${executionResult.rowCount} categories added successfully`);
                }
              } else {
                // Add one success message per executed SQL query
                // Each query in sqlQueries array is already a separate INSERT statement
                const successMessage = formatSuccessMessage(sqlQuery, executionResult, userBooks, categories);
                
                // Handle both single messages and arrays of messages
                const messages = Array.isArray(successMessage) ? successMessage : [successMessage];
                
                // Add conversion info if available for display
                if (conversionInfo) {
                  messages.forEach(msg => {
                    addedRecords.push(`${msg} (converted from ${conversionInfo.originalAmount} ${conversionInfo.detectedCurrency} at rate ${conversionInfo.exchangeRate})`);
                  });
                } else {
                  addedRecords.push(...messages);
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
              const updateMessage = formatSuccessMessage(sqlQuery, executionResult, userBooks, categories);
              const updateMessages = Array.isArray(updateMessage) ? updateMessage : [updateMessage];
              updatedRecords.push(...updateMessages);
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
          
          const finalMessage = ` ${errorMessages}`;
          
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
    
    // Add conversation history if provided - but be very selective
    // Only include the most recent assistant response for context, skip user messages to avoid confusion
    if (conversationHistory && Array.isArray(conversationHistory)) {
      // Only keep the most recent assistant message (if any) to provide minimal context
      const recentAssistantMessage = conversationHistory
        .filter(msg => msg.role === 'assistant')
        .filter(msg => {
          // Filter out success messages from AI responses
          const successMessagePattern = /✅\s*Successfully added|✅\s*Successfully updated|✅\s*Successfully/;
          const systemResponsePattern = /amount:\s*\d+|category:\s*\w+|paymentMethod:\s*\w+|isDisabled:\s*(true|false)/;
          return !successMessagePattern.test(msg.content) && !systemResponsePattern.test(msg.content);
        })
        .slice(-1); // Only the most recent one
      
      messages.push(...recentAssistantMessage);
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
        
        // Format results with natural language using AI
        if (executionResult.data && Array.isArray(executionResult.data) && executionResult.data.length > 0) {
          // Use the same formatting function as the main flow
          const selectResults = [{
            query: generatedQuery,
            data: executionResult.data,
            rowCount: executionResult.rowCount
          }];
          
          aiResponse = await formatSelectResultsWithAI(selectResults, message, session.user.id, conversationHistory);
        } else {
          aiResponse = `📊 Found ${executionResult.rowCount} records, but no data to display.`;
        }
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


  
