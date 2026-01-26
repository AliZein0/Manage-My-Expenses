import { NextResponse } from 'next/server'
import { ragService } from '@/lib/rag/service'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// OpenRouter API client configuration
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1'
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY

// Model configuration with fallbacks
const MODEL_CONFIG = {
  primary: 'xiaomi/mimo-v2-flash:free',
  fallback: 'allenai/molmo-2-8b:free'
}

// Helper function to call OpenRouter API with fallback support
async function callOpenRouterAPI(messages: any[], model: string = MODEL_CONFIG.primary) {
  const apiResponse = await fetch(`${OPENROUTER_API_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://localhost:3000',
      'X-Title': 'Manage My Expenses',
    },
    body: JSON.stringify({
      model: model,
      messages: messages,
      temperature: 0.7,
      max_tokens: 1000,
    }),
  })

  if (!apiResponse.ok) {
    const errorData = await apiResponse.json()
    
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
          'HTTP-Referer': 'https://localhost:3000',
          'X-Title': 'Manage My Expenses',
        },
        body: JSON.stringify({
          model: MODEL_CONFIG.fallback,
          messages: messages,
          temperature: 0.7,
          max_tokens: 1000,
        }),
      })
      
      if (!fallbackResponse.ok) {
        const fallbackError = await fallbackResponse.json()
        throw new Error(`API Error: ${fallbackError.error?.message || 'Unknown error'}`)
      }
      
      return await fallbackResponse.json()
    }
    
    throw new Error(`API Error: ${errorMessage || apiResponse.statusText}`)
  }

  return await apiResponse.json()
}

// Helper function to resolve book names to IDs in SQL queries
function resolveBookNamesInQuery(query: string, userBooks: any[]): string {
  let resolvedQuery = query;
  for (const book of userBooks) {
    // Replace book name references in VALUES clauses
    const namePattern = new RegExp(`'${book.name}'`, 'g');
    const idReplacement = `'${book.id}'`;
    resolvedQuery = resolvedQuery.replace(namePattern, idReplacement);
    
    // Replace book name references in WHERE clauses
    const wherePattern = new RegExp(`name = '${book.name}'`, 'g');
    const idWhereReplacement = `id = '${book.id}'`;
    resolvedQuery = resolvedQuery.replace(wherePattern, idWhereReplacement);
  }
  return resolvedQuery;
}

// Helper function to detect currency from message
function detectCurrency(message: string): string | null {
  const currencySymbols: Record<string, string> = {
    '$': 'USD',
    '€': 'EUR',
    '£': 'GBP',
    '¥': 'JPY',
    '₹': 'INR',
    '₽': 'RUB',
    '₩': 'KRW',
    '₺': 'TRY',
    '₫': 'VND',
    '₪': 'ILS',
    'د.إ': 'AED',
    '﷼': 'SAR',
    'KD': 'KWD',
    'BD': 'BHD',
    'OMR': 'OMR',
    'JOD': 'JOD',
    'LBP': 'LBP',
    'EGP': 'EGP',
    '₦': 'NGN',
    '₱': 'PHP',
    'R$': 'BRL',
    'CHF': 'CHF',
    'C$': 'CAD',
    'A$': 'AUD',
    'NZ$': 'NZD',
    'kr': 'SEK',
    'Nkr': 'NOK',
    'Dkr': 'DKK',
    'zł': 'PLN',
    'Kč': 'CZK',
    'Ft': 'HUF',
    'NT$': 'TWD',
    '฿': 'THB',
    'Rp': 'IDR',
    'RM': 'MYR',
    'S$': 'SGD',
    'HK$': 'HKD',
    'CN¥': 'CNY',
    'MX$': 'MXN',
    'ARS$': 'ARS',
    'CLP$': 'CLP',
    'COP$': 'COP',
    'S/': 'PEN',
    'UYU$': 'UYU',
    'ZAR': 'ZAR'
  };

  // Check for currency symbols
  for (const [symbol, code] of Object.entries(currencySymbols)) {
    if (message.includes(symbol)) {
      return code;
    }
  }

  // Check for currency codes
  const codeMatch = message.match(/\b(USD|EUR|GBP|JPY|CAD|AUD|CHF|CNY|INR|MXN|BRL|ZAR|RUB|KRW|SGD|HKD|NZD|SEK|NOK|DKK|PLN|CZK|HUF|TRY|TWD|THB|IDR|MYR|PHP|VND|ILS|AED|SAR|QAR|KWD|BHD|OMR|JOD|LBP|EGP|NGN|CLP|COP|PEN|ARS|UYU)\b/i);
  if (codeMatch) {
    return codeMatch[1].toUpperCase();
  }

  return null;
}

// Helper function to check currency compatibility
function checkCurrencyCompatibility(message: string, books: any[]): { compatible: boolean; detectedCurrency?: string; bookCurrency?: string; bookName?: string; message: string } {
  const detectedCurrency = detectCurrency(message);
  
  if (!detectedCurrency) {
    return {
      compatible: true,
      message: 'No specific currency detected, using book default'
    };
  }

  // Check if detected currency matches any book's currency
  const matchingBook = books.find(book => book.currency === detectedCurrency);
  
  if (matchingBook) {
    return {
      compatible: true,
      detectedCurrency,
      bookCurrency: matchingBook.currency,
      bookName: matchingBook.name,
      message: `Currency ${detectedCurrency} matches book "${matchingBook.name}" (${matchingBook.currency})`
    };
  } else {
    // Find the first book's currency for reference
    const firstBook = books[0];
    return {
      compatible: false,
      detectedCurrency,
      bookCurrency: firstBook.currency,
      bookName: firstBook.name,
      message: `⚠️ Currency mismatch! You mentioned ${detectedCurrency}, but the book "${firstBook.name}" uses ${firstBook.currency}. Please use ${firstBook.currency} or specify a different book.`
    };
  }
}

// SQL execution function with validation
async function executeDirectSQLWithValidation(query: string, userBooks: any[] = [], categories: any[] = []) {
  try {
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
        
        // Extract bookId from the query to check for duplicates within the same book
        // The bookId is the 4th value in the VALUES clause (after id, name, description)
        // Pattern: VALUES (UUID(), 'category-name', '', 'book-id', ...)
        const valuesMatch = query.match(/VALUES\s*\(\s*UUID\(\)\s*,\s*'[^']+'\s*,\s*'[^']+'\s*,\s*'([^']+)'/);
        if (valuesMatch) {
          const bookId = valuesMatch[1];
          
          // Check if a category with the same name already exists in the same book
          const duplicateCategory = categories.find(cat => 
            cat.name.toLowerCase() === newCategoryName.toLowerCase() && cat.bookId === bookId
          );
          
          if (duplicateCategory) {
            throw new Error(`Category already exists in this book`);
          }
        }
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
        
        // Check if a book with the same name already exists
        const duplicateBook = userBooks.find(book => 
          book.name.toLowerCase() === newBookName.toLowerCase()
        );
        
        if (duplicateBook) {
          throw new Error(`Book already exists`);
        }
      }
    }

    // Execute the INSERT query with Prisma's raw query
    console.log('executeDirectSQLWithValidation: Executing query:', query);
    const result = await prisma.$executeRawUnsafe(query);
    console.log('executeDirectSQLWithValidation: Query executed successfully, rows affected:', result);
    
    return {
      success: true,
      message: `Successfully added`
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

// Helper function to extract record values from INSERT query (for display purposes)
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

// Helper function to format SELECT results as casual reports without IDs
function formatSelectResultsAsCasualReport(data: any[], userBooks: any[], categories: any[]): string {
  if (!data || data.length === 0) {
    return 'No records found';
  }
  
  // Check if this is expense data (has amount, categoryId, etc.)
  const firstItem = data[0];
  const isExpenseData = firstItem && ('amount' in firstItem || 'categoryId' in firstItem || 'category_name' in firstItem);
  const isBookData = firstItem && ('currency' in firstItem || ('name' in firstItem && !('bookId' in firstItem)));
  const isCategoryData = firstItem && ('bookId' in firstItem || 'category_name' in firstItem) && !('amount' in firstItem);
  
  let report = `📊 Found ${data.length} record${data.length !== 1 ? 's' : ''}:\n`;
  
  if (isExpenseData) {
    // Format as expense report
    data.forEach((item, index) => {
      const amount = item.amount || item.amount || 0;
      const date = item.date ? new Date(item.date).toISOString().split('T')[0] : '';
      const description = item.description || '';
      const paymentMethod = item.paymentMethod || '';
      
      // Resolve category ID to name
      let categoryName = '';
      if (item.category_name) {
        categoryName = item.category_name;
      } else if (item.category) {
        categoryName = item.category;
      } else if (item.categoryId) {
        const category = categories.find(c => c.id === item.categoryId);
        categoryName = category ? category.name : 'Unknown';
      }
      
      // Resolve book ID to name and get currency
      let bookName = '';
      let currency = 'USD'; // Default
      if (item.book_name) {
        bookName = item.book_name;
      } else if (item.book) {
        bookName = item.book;
      }
      if (item.book_currency) {
        currency = item.book_currency;
      } else if (item.currency) {
        currency = item.currency;
      } else if (item.bookId) {
        const book = userBooks.find(b => b.id === item.bookId);
        if (book) {
          bookName = book.name;
          currency = book.currency;
        }
      }
      
      // Format amount with appropriate currency symbol
      let amountStr = '';
      const currencySymbols: Record<string, string> = {
        'USD': '$',
        'EUR': '€',
        'GBP': '£',
        'JPY': '¥',
        'INR': '₹',
        'RUB': '₽',
        'KRW': '₩',
        'TRY': '₺',
        'VND': '₫',
        'ILS': '₪',
        'AED': 'د.إ',
        'SAR': '﷼',
        'KWD': 'KD',
        'BHD': 'BD',
        'OMR': 'OMR',
        'JOD': 'JOD',
        'LBP': 'LBP',
        'EGP': 'EGP',
        'NGN': '₦',
        'PHP': '₱',
        'BRL': 'R$',
        'CHF': 'CHF',
        'CAD': 'C$',
        'AUD': 'A$',
        'NZD': 'NZ$',
        'SEK': 'kr',
        'NOK': 'kr',
        'DKK': 'kr',
        'PLN': 'zł',
        'CZK': 'Kč',
        'HUF': 'Ft',
        'TWD': 'NT$',
        'THB': '฿',
        'IDR': 'Rp',
        'MYR': 'RM',
        'SGD': 'S$',
        'HKD': 'HK$',
        'CNY': 'CN¥',
        'MXN': 'MXN',
        'ARS': 'ARS$',
        'CLP': 'CLP$',
        'COP': 'COP$',
        'PEN': 'S/',
        'UYU': 'UYU$',
        'ZAR': 'ZAR'
      };
      
      const symbol = currencySymbols[currency] || currency;
      amountStr = `${symbol}${amount.toFixed(2)}`;
      
      // Build the line with more details
      let line = `${index + 1}. ${amountStr}`;
      if (description) {
        line += ` for "${description}"`;
      }
      if (categoryName) {
        line += ` [${categoryName}]`;
      }
      if (bookName) {
        line += ` in ${bookName}`;
      }
      if (paymentMethod) {
        line += ` via ${paymentMethod}`;
      }
      if (date) {
        line += ` on ${date}`;
      }
      
      report += `  ${line}\n`;
    });
  } else if (isBookData) {
    // Format as book report
    data.forEach((item, index) => {
      const name = item.name || item.book_name || 'Unknown';
      const currency = item.currency || '';
      
      let line = `${index + 1}. Book: ${name}`;
      if (currency) {
        line += ` with currency ${currency}`;
      }
      
      report += `  ${line}\n`;
    });
  } else if (isCategoryData) {
    // Format as category report
    data.forEach((item, index) => {
      const name = item.name || item.category_name || 'Unknown';
      
      // Try to resolve book ID to name
      let bookName = '';
      if (item.bookId) {
        const book = userBooks.find(b => b.id === item.bookId);
        bookName = book ? ` in ${book.name} book` : '';
      }
      
      let line = `${index + 1}. Category: ${name}${bookName}`;
      report += `  ${line}\n`;
    });
  } else {
    // Generic format - show key fields without IDs
    data.forEach((item, index) => {
      const entries = Object.entries(item)
        .filter(([key, value]) => {
          // Skip ID fields and internal fields
          const skipFields = ['id', 'userId', 'bookId', 'categoryId', 'isDisabled', 'isArchived', 'createdAt', 'updatedAt'];
          return !skipFields.includes(key) && value !== null && value !== undefined;
        })
        .map(([key, value]) => {
          // Format values nicely
          if (key === 'amount' && typeof value === 'number') {
            return `$${value.toFixed(2)}`;
          }
          if (key === 'date' && value && (typeof value === 'string' || typeof value === 'number' || value instanceof Date)) {
            return new Date(value).toISOString().split('T')[0];
          }
          return value;
        });
      
      if (entries.length > 0) {
        report += `  ${index + 1}. ${entries.join(', ')}\n`;
      }
    });
  }
  
  return report.trimEnd();
}

// UPDATE SQL execution function with validation
async function executeUpdateSQLWithValidation(query: string, userId: string) {
  try {
    // Security: Only allow UPDATE queries for this direct execution
    const trimmedQuery = query.trim().toLowerCase();
    if (!trimmedQuery.startsWith('update')) {
      throw new Error('Only UPDATE queries are allowed for direct execution');
    }

    // Security: Prevent dangerous SQL keywords
    const words = trimmedQuery.split(/\s+/);
    const dangerousKeywords = ['drop', 'delete', 'insert', 'alter', 'create', 'truncate', 'exec', 'select'];
    
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
      const updatedQuery = addUserFilterToUpdateQuery(query, userId);
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
  const trimmedQuery = query.trim().toLowerCase();
  
  if (trimmedQuery.includes('expenses')) {
    // For expenses, check if it's targeting a specific ID or needs to find the most recent
    if (trimmedQuery.includes('where id =')) {
      // Already has ID filter, add user filtering through JOIN
      const idMatch = query.match(/where\s+id\s*=\s*['"]([^'"]+)['"]/i);
      if (idMatch) {
        const expenseId = idMatch[1];
        return `UPDATE expenses e 
              JOIN categories c ON e.categoryId = c.id 
              JOIN books b ON c.bookId = b.id 
              SET e.isDisabled = true 
              WHERE e.id = '${expenseId}' AND b.userId = '${userId}'`;
      }
    } else {
      // No specific ID, assume we want to update the most recent expense
      // This is a fallback - ideally the AI should provide specific criteria
      return `UPDATE expenses e 
             JOIN categories c ON e.categoryId = c.id 
             JOIN books b ON c.bookId = b.id 
             SET e.isDisabled = true 
             WHERE b.userId = '${userId}' 
             ORDER BY e.createdAt DESC LIMIT 1`;
    }
  } else if (trimmedQuery.includes('categories')) {
    // For categories, check if it's targeting a specific ID
    if (trimmedQuery.includes('where id =')) {
      const idMatch = query.match(/where\s+id\s*=\s*['"]([^'"]+)['"]/i);
      if (idMatch) {
        const categoryId = idMatch[1];
        return `UPDATE categories c 
              JOIN books b ON c.bookId = b.id 
              SET c.isDisabled = true 
              WHERE c.id = '${categoryId}' AND b.userId = '${userId}'`;
      }
    } else {
      // No specific ID, update most recent category
      return `UPDATE categories c 
             JOIN books b ON c.bookId = b.id 
             SET c.isDisabled = true 
             WHERE b.userId = '${userId}' 
             ORDER BY c.createdAt DESC LIMIT 1`;
    }
  } else if (trimmedQuery.includes('books')) {
    // For books, direct WHERE clause
    if (trimmedQuery.includes('where id =')) {
      const idMatch = query.match(/where\s+id\s*=\s*['"]([^'"]+)['"]/i);
      if (idMatch) {
        const bookId = idMatch[1];
        return `UPDATE books SET isArchived = true WHERE id = '${bookId}' AND userId = '${userId}'`;
      }
    } else {
      // No specific ID, archive most recent book
      return `UPDATE books SET isArchived = true WHERE userId = '${userId}' ORDER BY createdAt DESC LIMIT 1`;
    }
  }
  
  // If we can't parse the query properly, return it as-is (it will likely fail security checks)
  return query;
}

// Safe query execution for SELECT operations
async function executeSafeQuery(userId: string, query: string) {
  try {
    // Security: Only allow SELECT queries
    const trimmedQuery = query.trim().toLowerCase();
   

    // Security: Prevent dangerous SQL keywords
    const words = trimmedQuery.split(/\s+/);
    const dangerousKeywords = ['drop', 'delete', 'update', 'alter', 'create', 'truncate', 'exec', 'insert'];
    
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

    // Auto-fix user filtering: If query references userId but doesn't have proper joins, add them
    let finalQuery = query;
    
    // Check if query mentions userId but doesn't have explicit joins to books table
    if (trimmedQuery.includes('userid') && !trimmedQuery.includes('join')) {
      // Determine which table is being queried
      if (trimmedQuery.includes('from expenses')) {
        // Add proper joins for expenses
        finalQuery = addExpensesJoins(query, userId);
      } else if (trimmedQuery.includes('from categories')) {
        // Add proper joins for categories
        finalQuery = addCategoriesJoins(query, userId);
      } else if (trimmedQuery.includes('from books')) {
        // Books already has userId, just add WHERE clause if missing
        if (!trimmedQuery.includes('where')) {
          finalQuery = query.replace(/from books/i, `FROM books WHERE userId = '${userId}'`);
        }
      }
    } else if (trimmedQuery.includes('from expenses')) {
      // For expense queries, always add proper joins for currency and user filtering
      finalQuery = addExpensesJoins(query, userId);
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

// Helper to add proper joins for expenses queries
function addExpensesJoins(originalQuery: string, userId: string): string {
  // Extract the SELECT part (everything before FROM)
  const selectMatch = originalQuery.match(/SELECT\s+(.+?)\s+FROM/i);
  if (!selectMatch) return originalQuery;
  
  const selectPart = selectMatch[1];
  
  // If SELECT part is *, replace with specific fields including book currency
  let finalSelectPart = selectPart;
  if (selectPart.trim() === '*') {
    // Include all expense fields plus category name, book name, and book currency
    finalSelectPart = 'e.*, c.name as category_name, b.name as book_name, b.currency as book_currency';
  } else if (!selectPart.includes('b.currency') && !selectPart.includes('book_currency') && !selectPart.includes('currency')) {
    // Add book currency if not already included
    // Use the same naming pattern as the AI (c.name as category, b.name as book)
    // Always use book_currency as the alias for consistency
    finalSelectPart = selectPart + ', b.currency as book_currency';
  }
  
  // Build new query with proper JOINs
  let newQuery = `SELECT ${finalSelectPart} FROM expenses e 
                  JOIN categories c ON e.categoryId = c.id 
                  JOIN books b ON c.bookId = b.id 
                  WHERE b.userId = '${userId}'`;
  
  // Clean up
  newQuery = newQuery.replace(/\s+/g, ' ').trim();
  
  return newQuery;
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
      let categories: any[] = [];
      try {
        userBooks = await prisma.book.findMany({
          where: { userId: session.user.id, isArchived: false }
        });
        
        if (userBooks.length > 0) {
          userContext += `\n\nYOUR BOOKS:\n`;
          userBooks.forEach(book => {
            userContext += `- Book Name: ${book.name}, Book ID: ${book.id}, Currency: ${book.currency}\n`;
          });
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
          }
        }
      } catch (error) {
        console.log('Could not fetch user context for SQL generation:', error);
      }

      // Get RAG context which includes validation rules
      const ragContext = await ragService.getContext(session.user.id, message);
      
      // Enhanced system prompt for SQL generation - learns from RAG context
      let sqlSystemPrompt =`You are an AI assistant for "Manage My Expenses" that can generate SQL queries for database operations.

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
- For archiving books: UPDATE books SET isArchived = true WHERE id = 'book-id'
- When user says "last", "this", "recent", "latest", or refers to the most recent record, generate an UPDATE query that targets the most recently created record
- Do NOT ask for clarification - generate the UPDATE query directly
- The system will automatically handle finding the correct record based on your WHERE conditions

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
When a user asks to VIEW, SHOW, LIST, or REPORT on data, you MUST generate a SQL SELECT query.
- For expenses: Use JOINs through categories to books for user filtering
  Example: SELECT * FROM expenses e JOIN categories c ON e.categoryId = c.id JOIN books b ON c.bookId = b.id WHERE b.userId = '${session.user.id}' ORDER BY e.date DESC LIMIT 10
- For categories: JOIN through books for user filtering
  Example: SELECT * FROM categories c JOIN books b ON c.bookId = b.id WHERE b.userId = '${session.user.id}'
- For books: Direct WHERE clause on userId
  Example: SELECT * FROM books WHERE userId = '${session.user.id}'
- For spending reports: Use aggregate functions
  Example: SELECT SUM(amount) as total, AVG(amount) as average, COUNT(*) as count FROM expenses e JOIN categories c ON e.categoryId = c.id JOIN books b ON c.bookId = b.id WHERE b.userId = '${session.user.id}'
- For category breakdowns: Use GROUP BY
  Example: SELECT c.name, SUM(e.amount) as total FROM expenses e JOIN categories c ON e.categoryId = c.id JOIN books b ON c.bookId = b.id WHERE b.userId = '${session.user.id}' GROUP BY c.name ORDER BY total DESC

IMPORTANT: When a user asks for reports or data views, generate the appropriate SELECT query immediately. Do NOT ask for clarification - generate the query based on what the user requested.

GUIDELINES FOR UPDATE QUERIES:
- Only generate UPDATE queries for modifying existing records (disabling expenses/categories, archiving books)
- Always include WHERE clauses to target specific records by ID
- For expenses: UPDATE expenses SET isDisabled = true WHERE id = 'specific-expense-id'
- For categories: UPDATE categories SET isDisabled = true WHERE id = 'specific-category-id'
- For books: UPDATE books SET isArchived = true WHERE id = 'specific-book-id' AND userId = '${session.user.id}'
- The system will automatically add proper user filtering for security

IMPORTANT: When a user wants to create a record, generate the complete SQL INSERT query and I will execute it directly.

EXAMPLES (using the actual user ID and data provided above):
- For books: INSERT INTO books (id, name, description, currency, isArchived, userId, createdAt, updatedAt) VALUES (UUID(), 'Personal Budget', '', 'USD', false, '${session.user.id}', NOW(), NOW())
- For categories: Look up the Book ID from YOUR BOOKS section above, then use: INSERT INTO categories (id, name, description, bookId, icon, color, isDisabled, createdAt, updatedAt) VALUES (UUID(), 'Groceries', '', 'book-id-from-context', '', '', false, NOW(), NOW())
- For expenses: INSERT INTO expenses (id, amount, date, description, categoryId, paymentMethod, isDisabled, createdAt, updatedAt) VALUES (UUID(), 50.00, '2025-01-15', 'Groceries', 'existing-category-id', 'Other', false, NOW(), NOW())
- For disabling expenses: UPDATE expenses SET isDisabled = true WHERE id = 'expense-id-here'
- For disabling categories: UPDATE categories SET isDisabled = true WHERE id = 'category-id-here'
- For archiving books: UPDATE books SET isArchived = true WHERE id = 'book-id-here' AND userId = '${session.user.id}'
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
      
      aiResponse = completion.choices[0]?.message?.content || 'I could not generate a response.';
      console.log('AI SQL Flow: Generated response:', aiResponse);
      console.log('AI SQL Flow: Response length:', aiResponse.length);
      
      // Additional safeguard: If AI generated a success message despite all instructions, strip it
      const successMessagePattern = /✅\s*Successfully added|✅\s*Successfully updated|✅\s*Successfully/;
      const systemResponsePattern = /amount:\s*\d+|category:\s*\w+|paymentMethod:\s*\w+|isDisabled:\s*(true|false)/;
      
      if (successMessagePattern.test(aiResponse) || systemResponsePattern.test(aiResponse)) {
        console.log('AI SQL Flow: AI generated success message despite instructions, stripping it');
        // Remove the success message part
        aiResponse = aiResponse.replace(successMessagePattern, '').trim();
        aiResponse = aiResponse.replace(systemResponsePattern, '').trim();
      }
      
      // Extract SQL query from AI response
      const sqlMatch = aiResponse.match(/```sql\n([\s\S]*?)\n```/);
      
      // Check if AI should have generated SQL but didn't
      const isCreationRequest = message.toLowerCase().includes('create') || 
                                message.toLowerCase().includes('add') ||
                                message.toLowerCase().includes('new');
      
      // If it's a creation request but no SQL was generated, check if AI is asking for clarification or generated a success message
      if (!sqlMatch && isCreationRequest) {
        // Check if AI generated a success message without SQL (this is a problem)
        const successMessagePattern = /✅\s*Successfully added|✅\s*Successfully updated|✅\s*Successfully/;
        // Also check if AI generated a response that looks like it's from the system
        const systemResponsePattern = /amount:\s*\d+|category:\s*\w+|paymentMethod:\s*\w+|isDisabled:\s*(true|false)/;
        
        if (successMessagePattern.test(aiResponse) || systemResponsePattern.test(aiResponse)) {
          console.log('AI SQL Flow: AI generated success message without SQL for creation request');
          console.log('AI Response:', aiResponse);
          return NextResponse.json({ 
            response: '⚠️ I notice you asked me to create something, but I responded with a success message instead of generating the SQL query. This is a problem because:\n\n1. **I must generate SQL first** - The system needs the SQL query to execute the database operation\n2. **I should not generate success messages** - The system will generate the success message after executing the SQL\n\n**To fix this, please try again with a clearer request:**\n- "Create a book called Test"\n- "Add category C1 to book Test"  \n- "Create an expense of $50 in category C1"\n\nI will then generate the SQL INSERT query immediately using the IDs from your current data.',
            model: 'xiaomi/mimo-v2-flash:free',
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
            model: 'xiaomi/mimo-v2-flash:free',
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
            model: 'xiaomi/mimo-v2-flash:free',
            usage: completion.usage,
            requiresConfirmation: false
          });
        }
      }
      
   
      
      if (sqlMatch) {
        console.log('AI SQL Flow: SQL found in response');
        sqlQuery = sqlMatch[1].trim();
        console.log('AI SQL Flow: Extracted SQL:', sqlQuery);
        
        // Check if AI also generated a success message (which it shouldn't)
        const successMessagePattern = /✅\s*Successfully added|✅\s*Successfully updated|✅\s*Successfully/;
        const systemResponsePattern = /amount:\s*\d+|category:\s*\w+|paymentMethod:\s*\w+|isDisabled:\s*(true|false)/;
        if (successMessagePattern.test(aiResponse) || systemResponsePattern.test(aiResponse)) {
          console.log('AI SQL Flow: Warning - AI generated success message along with SQL');
          // Remove the success message from AI response since we'll generate our own
          aiResponse = aiResponse.replace(successMessagePattern, '').trim();
          aiResponse = aiResponse.replace(systemResponsePattern, '').trim();
        }
        
        // Check if AI generated a SELECT query when user asked to create something
        const trimmedQuery = sqlQuery.trim().toLowerCase();
        const isCreationRequest = message.toLowerCase().includes('create') || 
                                  message.toLowerCase().includes('add') ||
                                  message.toLowerCase().includes('new');
        
        if (isCreationRequest && trimmedQuery.startsWith('select')) {
          console.log('AI SQL Flow: Warning - AI generated SELECT query for creation request');
          // Don't execute the SELECT query, return error message
          return NextResponse.json({ 
            response: '⚠️ Warning: The AI generated a SELECT query instead of creating the record. Please ask for a specific operation (e.g., "Create a book called Test" or "Add an expense of $100 to category C1").',
            model: 'xiaomi/mimo-v2-flash:free',
            usage: completion.usage,
            requiresConfirmation: false
          });
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
            model: 'xiaomi/mimo-v2-flash:free',
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
            model: 'xiaomi/mimo-v2-flash:free',
            usage: completion.usage,
            requiresConfirmation: false
          });
        }
        
        // Validate the query type
        
        if (trimmedQuery.startsWith('insert')) {
          console.log('AI SQL Flow: INSERT query detected, executing with validation');
          
          // Check for currency mismatch if this is an expense creation
          if (trimmedQuery.includes('into expenses')) {
            // Get user's books to check currency compatibility
            const books = await prisma.book.findMany({
              where: { userId: session.user.id, isArchived: false }
            });
            
            if (books.length > 0) {
              // Check if the message mentions a specific currency
              const currencyCheck = checkCurrencyCompatibility(message, books);
              
              if (!currencyCheck.compatible && currencyCheck.detectedCurrency) {
                console.log('AI SQL Flow: Currency mismatch detected');
                // Don't execute the query, return error message
                return NextResponse.json({ 
                  response: currencyCheck.message,
                  model: 'xiaomi/mimo-v2-flash:free',
                  usage: completion.usage,
                  requiresConfirmation: false
                });
              }
            }
          }
          
          // Resolve book names to IDs in the query
          sqlQuery = resolveBookNamesInQuery(sqlQuery, userBooks);
          
          // Execute INSERT query directly with validation
          console.log('AI SQL Flow: Executing SQL query:', sqlQuery);
          const executionResult = await executeDirectSQLWithValidation(sqlQuery, userBooks, categories);
          console.log('AI SQL Flow: Execution result:', executionResult);
          
          if (executionResult.success) {
            // Extract record values for display
            const recordValues = extractRecordValuesFromQuery(sqlQuery, userBooks, categories);
            
            // Create success message - AI will format this naturally based on RAG instructions
            let finalMessage = `✅ ${executionResult.message}`;
            
            if (recordValues) {
              finalMessage += `: ${recordValues}`;
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
              model: 'xiaomi/mimo-v2-flash:free',
              usage: completion.usage,
              requiresConfirmation: false
            });
          } else {
            // Create error message with more details
            const finalMessage = `❌ ${executionResult.error}`;
            
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
              model: 'xiaomi/mimo-v2-flash:free',
              usage: completion.usage,
              requiresConfirmation: false
            });
          }
          
        } else if (trimmedQuery.startsWith('update')) {
          console.log('AI SQL Flow: UPDATE query detected, executing with validation');
          
          // Resolve book names to IDs in the query
          sqlQuery = resolveBookNamesInQuery(sqlQuery, userBooks);
          
          // Execute UPDATE query directly with validation
          const executionResult = await executeUpdateSQLWithValidation(sqlQuery, session.user.id);
          
          if (executionResult.success) {
            // Create success message
            let finalMessage = `✅ ${executionResult.message}`;
            
            // Save conversation to database
            try {
              await prisma.chatMessage.create({
                data: {
                  role: 'user',
                  content: message,
                  userId: session.user.id
                }
              });
              
              await prisma.chatMessage.create({
                data: {
                  role: 'assistant',
                  content: finalMessage,
                  userId: session.user.id
                }
              });
            } catch (error) {
              console.error('Error saving chat message:', error)
            }
            
            return NextResponse.json({ 
              response: finalMessage,
              model: 'xiaomi/mimo-v2-flash:free',
              usage: completion.usage,
              requiresConfirmation: false
            });
          } else {
            // Create error message
            const finalMessage = `❌ ${executionResult.error}`;
            
            // Save conversation to database
            try {
              await prisma.chatMessage.create({
                data: {
                  role: 'user',
                  content: message,
                  userId: session.user.id
                }
              });
              
              await prisma.chatMessage.create({
                data: {
                  role: 'assistant',
                  content: finalMessage,
                  userId: session.user.id
                }
              });
            } catch (error) {
              console.error('Error saving chat message:', error)
            }
            
            return NextResponse.json({ 
              response: finalMessage,
              model: 'xiaomi/mimo-v2-flash:free',
              usage: completion.usage,
              requiresConfirmation: false
            });
          }
          
        } else if (trimmedQuery.startsWith('select')) {
          console.log('AI SQL Flow: SELECT query detected, executing');
          
          // Resolve book names to IDs in the query
          sqlQuery = resolveBookNamesInQuery(sqlQuery, userBooks);
          
          // Execute SELECT query
          const executionResult = await executeSafeQuery(session.user.id, sqlQuery);
          
          if (executionResult.success) {
            // Remove SQL from AI response and show results only
            aiResponse = aiResponse.replace(/```sql\n([\s\S]*?)\n```/g, '');
            
            // Format results as casual report without IDs
            let cleanResponse = '';
            if (executionResult.data && Array.isArray(executionResult.data) && executionResult.data.length > 0) {
              cleanResponse = formatSelectResultsAsCasualReport(executionResult.data, userBooks, categories);
            } else {
              cleanResponse = '📊 Found 0 records';
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
                  content: cleanResponse,
                  userId: session.user.id
                }
              })
            } catch (error) {
              console.error('Error saving chat message:', error)
            }
            
            return NextResponse.json({ 
              response: cleanResponse,
              model: 'xiaomi/mimo-v2-flash:free',
              usage: completion.usage,
              requiresConfirmation: false
            });
          } else {
            // Remove SQL from AI response and add error
            aiResponse = aiResponse.replace(/```sql\n([\s\S]*?)\n```/g, '');
            
            
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
              model: 'xiaomi/mimo-v2-flash:free',
              usage: completion.usage,
              executionResult: executionResult,
              requiresConfirmation: false
            });
          }
        } else {
          // Query type not supported
          console.log('AI SQL Flow: Unsupported query type:', trimmedQuery);
          aiResponse = aiResponse.replace(/```sql\n([\s\S]*?)\n```/g, '');
          
          // Save conversation and return immediately to prevent further processing
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
            model: 'xiaomi/mimo-v2-flash:free',
            usage: completion.usage,
            requiresConfirmation: false
          });
        }
        
        // This might be a general question, so proceed with normal RAG flow
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
            model: 'xiaomi/mimo-v2-flash:free',
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
      model: 'xiaomi/mimo-v2-flash:free',
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
  