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
async function executeDirectSQLWithValidation(query: string, userBooks: any[] = []) {
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

    // Check for duplicate book names
    if (trimmedQuery.includes('into books')) {
      // Extract the book name from the INSERT query
      // Pattern: INSERT INTO books (...) VALUES (UUID(), 'book-name', ...)
      // Need to handle UUID() which contains parentheses
      // Match: VALUES\s*\(\s*UUID\(\)\s*,\s*'([^']+)'
      const bookNameMatch = query.match(/VALUES\s*\(\s*UUID\(\)\s*,\s*'([^']+)'/);
      if (bookNameMatch && bookNameMatch[1]) {
        const newBookName = bookNameMatch[1];
        
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
    const result = await prisma.$executeRawUnsafe(query);
    
    return {
      success: true,
      message: `Successfully added`
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Failed to execute INSERT query'
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
    if (!trimmedQuery.startsWith('select')) {
      throw new Error('Only SELECT queries are allowed');
    }

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
      if (conversationHistory && Array.isArray(conversationHistory)) {
        messages.push(...conversationHistory)
      }
      
      // Add current user message
      messages.push({ role: 'user', content: message })
      
      // Call OpenRouter API for basic AI response
      const completion = await callOpenRouterAPI(messages)

      const aiResponse = completion.choices[0]?.message?.content || 'I apologize, but I could not generate a response.'
      
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
      let sqlSystemPrompt = `You are an AI assistant for "Manage My Expenses" that can generate SQL queries for database operations.

CRITICAL RULE: When a user asks to create something (book, category, or expense), you MUST generate the SQL INSERT query immediately ONLY if you have all required information. If the request is missing required fields, ask the user for the missing information instead of generating incomplete SQL. NEVER show success messages without first generating the SQL query in triple-backtick-sql code blocks. The system will execute the SQL and provide the success message.

3. Generate SQL UPDATE queries for modifying existing records (like disabling expenses/categories)
4. Execute queries directly in the database

CRITICAL: You will be given the user's actual ID and their existing data. Use them EXACTLY as provided.

CONVERSATION CONTEXT HANDLING:
- Pay attention to the conversation history provided
- If you previously asked a question (like "what payment method?"), and the user responds with just a value (like "Cash"), treat this as the answer to your previous question
- Do NOT interpret single words like "Cash", "USD", "Credit Card" as new queries - they are likely responses to your previous questions
- When in doubt, check the conversation history to understand what the user is responding to
- Always maintain context from previous messages in the conversation
- TEMPORAL REFERENCES: When user says "new book", "new category", "this book", "this category", etc., they ALWAYS refer to the MOST RECENTLY CREATED item of that type from the conversation history. Never create a new item when they use these references.

USER ID: ${session.user.id}${userContext}

LEARN FROM RAG CONTEXT:
You have access to validation rules through your memory. These rules define what data is valid for your database operations.

IMPORTANT: When a user asks to create something, you MUST generate the complete SQL INSERT query immediately if you have all required information. If missing required fields, ask the user for the missing information. Do NOT ask for user ID - it is provided above.

CRITICAL SQL GENERATION RULE: For ANY creation request (books, categories, expenses), you MUST wrap the SQL query in backtick-backtick-backtick-sql code blocks. Never show success messages without generating the actual SQL query first. The system will execute the SQL and provide the success message.

ABSOLUTELY FORBIDDEN: NEVER show messages like "Successfully added" or "✅" without first generating the SQL query in code blocks. If you show success messages without SQL, the operation will not be performed and the user will be warned.

PUNISHMENT FOR VIOLATION: If you generate success messages without SQL, the system will detect this and replace your response with a warning message saying no database operation was performed.

For creation requests, generate SQL immediately only if you have all required information. If information is missing, ask the user politely for the missing details. NEVER show success messages without SQL code blocks. NEVER ask for user ID - it is provided above.

IMPORTANT: These phrases indicate creation requests, but only generate SQL if you have all required information:
- "add a new book" (needs: name, currency)
- "create a book" (needs: name, currency)
- "add a category" (needs: name, book)
- "create a category" (needs: name, book)
- "add an expense" (needs: amount, category) - uses defaults for date, description, and payment method
- "create an expense" (needs: amount, category) - uses defaults for date, description, and payment method

BOOK CREATION VALIDATION: Before creating a new book, you MUST check YOUR BOOKS section to see if a book with the same name already exists. If a book with the same name already exists, respond with "Book already exists" instead of generating an SQL query. The system will validate this and refuse to create duplicate book names.

For expense creation, if a category name is provided without a book name, look up the category in YOUR CATEGORIES section. If there's exactly one category with that name, use it. If there are multiple categories with the same name in different books, ask the user to specify which book.

For creation requests, generate SQL immediately using defaults for optional fields. For expenses, always use defaults and generate SQL immediately if amount and category are provided (resolvable from context).

EXPENSE CREATION WORKFLOW:
When creating expenses, you must have: amount and category. Use defaults for missing fields:
- Date: Use CURDATE() if not specified
- Description: Use empty string ('') if not specified  
- Payment Method: Use "Other" as the default if not specified
- Category Resolution: If category name is provided without book, look it up in YOUR CATEGORIES section. Use the category ID directly.
- Valid payment methods: Cash, Credit Card, Wire Transfer, PayPal, Other
- If user provides a payment method in response to your question, use it to create the expense
- Do not treat payment method responses as separate queries
- Generate the SQL INSERT query immediately using defaults for any missing optional fields. Do NOT ask for missing optional fields - use the defaults.

UPDATE OPERATIONS:
When a user wants to disable, delete, or modify existing records, generate SQL UPDATE queries.
- For disabling expenses: UPDATE expenses SET isDisabled = true WHERE id = 'expense-id'
- For disabling categories: UPDATE categories SET isDisabled = true WHERE id = 'category-id'  
- For archiving books: UPDATE books SET isArchived = true WHERE id = 'book-id'
- When user says "last", "this", "recent", "latest", or refers to the most recent record, generate an UPDATE query that targets the most recently created record
- Do NOT ask for clarification - generate the UPDATE query directly
- The system will automatically handle finding the correct record based on your WHERE conditions

CATEGORY CREATION RULES:
When creating categories, you MUST use the Book ID from the YOUR BOOKS section. Do not use book names in the SQL - always use the actual Book ID (UUID). Do not generate SELECT queries to find book IDs - use the IDs provided in the context.

TEMPORAL REFERENCE HANDLING:
When user refers to books or categories using temporal references, always use the MOST RECENTLY CREATED one from the conversation history:
- "this book", "the book", "new book", "this new book", "the new book" → use the most recently created book
- "this category", "the category", "new category", "this new category", "the new category" → use the most recently created category

Look at the conversation history and YOUR BOOKS/CATEGORIES sections to identify the correct IDs. For example:
- If the user just created book "Test" with ID "abc123", then "this book", "new book", etc. all refer to "Test" (ID: abc123)
- If the user just created category "C1" with ID "def456", then "this category", "new category", etc. all refer to "C1" (ID: def456)

For example:
- If user says "add category C1 to this book" and conversation shows they just created "Test" with ID "abc123", generate: INSERT INTO categories (id, name, description, bookId, icon, color, isDisabled, createdAt, updatedAt) VALUES (UUID(), 'C1', '', 'abc123', '', '', false, NOW(), NOW())
- If user says "add expense to this category" and conversation shows they just created "C1" with ID "def456", generate: INSERT INTO expenses (id, amount, date, description, categoryId, paymentMethod, isDisabled, createdAt, updatedAt) VALUES (UUID(), 300.00, CURDATE(), '', 'def456', 'Other', false, NOW(), NOW())
- If user says "add to this new category an expenses with value 130$" and conversation shows they just created "C1" with ID "def456", generate: INSERT INTO expenses (id, amount, date, description, categoryId, paymentMethod, isDisabled, createdAt, updatedAt) VALUES (UUID(), 130.00, CURDATE(), '', 'def456', 'Other', false, NOW(), NOW())
- If user says "add a new expenses to the new category with value 100$" and conversation shows they just created "C1" with ID "def456", generate: INSERT INTO expenses (id, amount, date, description, categoryId, paymentMethod, isDisabled, createdAt, updatedAt) VALUES (UUID(), 100.00, CURDATE(), '', 'def456', 'Other', false, NOW(), NOW())

EXAMPLE: If user says "add a new office with currency LBP", generate:
backtick-backtick-backtick-sql
INSERT INTO books (id, name, description, currency, isArchived, userId, createdAt, updatedAt) 
VALUES (UUID(), 'Office', '', 'LBP', false, '${session.user.id}', NOW(), NOW())
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
        '\n- IMPORTANT: When you need to show responses, resolve IDs to names using this context' +
        '\n- Example: If you see bookId \'b01ccdf3-f1ec-11f0-9c01-20bd1d505f09\', know it\'s \'B1\' and mention \'B1\' in your response'

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
1. NEVER show raw database IDs (UUIDs) in responses
2. ALWAYS use book names, category names, and human-readable descriptions
3. Responses must be in natural language, NOT JavaScript/JSON scripts
4. YOU are responsible for resolving IDs to names using the user context provided
5. For SELECT operations, provide clear summaries in natural language
6. Focus on what was added/found, not technical database details
7. Use the user's books and categories from context to replace IDs with names

SQL QUERY GENERATION RULES:
- For expenses: Use JOINs through categories to books for user filtering
  Example: SELECT SUM(amount) FROM expenses e JOIN categories c ON e.categoryId = c.id JOIN books b ON c.bookId = b.id WHERE b.userId = 'user-id'
- For categories: JOIN through books for user filtering
  Example: SELECT * FROM categories c JOIN books b ON c.bookId = b.id WHERE b.userId = 'user-id'
- For books: Direct WHERE clause on userId
  Example: SELECT * FROM books WHERE userId = 'user-id'

WARNING: Based on your validation memory, if the user requests invalid data, DO NOT generate the SQL query. Instead, explain what is wrong and provide the correct options from your memory.

IMPORTANT: The system will clean up your response to remove SQL code blocks before showing it to the user. Focus on explaining what will be created/added in natural language.`;

      // Call AI to generate SQL query
      console.log('AI SQL Flow: System prompt length:', sqlSystemPrompt.length);
      console.log('AI SQL Flow: User message:', message);
      
      // Build messages array with conversation history
      const messages = [
        { role: 'system', content: sqlSystemPrompt }
      ]
      
      // Add conversation history if provided
      if (conversationHistory && Array.isArray(conversationHistory)) {
        messages.push(...conversationHistory)
      }
      
      // Add current user message
      messages.push({ role: 'user', content: message })
      
      const completion = await callOpenRouterAPI(messages);
      
      aiResponse = completion.choices[0]?.message?.content || 'I could not generate a response.';
      console.log('AI SQL Flow: Generated response:', aiResponse);
      console.log('AI SQL Flow: Response length:', aiResponse.length);
      
      // Extract SQL query from AI response
      const sqlMatch = aiResponse.match(/```sql\n([\s\S]*?)\n```/);
      if (sqlMatch) {
        console.log('AI SQL Flow: SQL found in response');
        sqlQuery = sqlMatch[1].trim();
        
        // Validate the query type
        const trimmedQuery = sqlQuery.trim().toLowerCase();
        
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
          const executionResult = await executeDirectSQLWithValidation(sqlQuery, userBooks);
          
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
            aiResponse += `\n\n❌ Query execution failed: ${executionResult.error}`;
            
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
          
          aiResponse += `\n\n❌ **No SQL query found in response.** Please ask for a specific operation (e.g., "Create a book called Personal Budget" or "Show me all expenses from last month").`;
          
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
        systemPrompt += `\n\nQUERY GENERATION MODE:\nThe user is asking for data analysis. You should:\n1. Generate a SQL SELECT query to get the requested data\n2. Format it clearly with proper SQL syntax\n3. The system will execute it and return results\n\nCRITICAL RESPONSE FORMAT RULES:\n1. NEVER show raw database IDs (UUIDs) in responses\n2. ALWAYS use book names, category names, and human-readable descriptions\n3. Responses must be in natural language, NOT JavaScript/JSON scripts\n4. YOU are responsible for resolving IDs to names using the user context provided\n5. For SELECT operations, provide clear summaries in natural language\n6. Focus on what was found, not technical database details\n7. Use the user's books and categories from context to replace IDs with names\n\nThis query will show: [explanation]`;
      }
    }

    // Build messages array with conversation history
    const messages = [
      { role: 'system', content: systemPrompt }
    ]
    
    // Add conversation history if provided
    if (conversationHistory && Array.isArray(conversationHistory)) {
      messages.push(...conversationHistory)
    }
    
    // Add current user message
    messages.push({ role: 'user', content: message })
    
    // Call OpenRouter API directly using helper function
    const completion = await callOpenRouterAPI(messages)
    
    aiResponse = completion.choices[0]?.message?.content || 'I apologize, but I could not generate a response.'

    // Check if the AI response contains a SQL query (for read operations)
    const sqlMatch = aiResponse.match(/```sql\n([\s\S]*?)\n```/);
    if (sqlMatch) {
      const generatedQuery = sqlMatch[1].trim();
      
      // Execute the query
      const executionResult = await executeSafeQuery(session.user.id, generatedQuery);
      
      if (executionResult.success) {
        // Remove SQL from response and show results only
        aiResponse = aiResponse.replace(/```sql\n([\s\S]*?)\n```/g, '');
        
        // Create clean response with results
        let cleanResponse = `📊 Found ${executionResult.rowCount} records`;
        
        if (executionResult.data && Array.isArray(executionResult.data) && executionResult.data.length > 0) {
          // Format the first few results
          const sampleData = executionResult.data.slice(0, 3);
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
    const finalLowerResponse = aiResponse.toLowerCase();
    const finalCreationKeywords = ['successfully added', '✅', 'created', 'added'];
    const finalHasSuccessIndicators = finalCreationKeywords.some(keyword => finalLowerResponse.includes(keyword));
    
    if (finalHasSuccessIndicators && (message.toLowerCase().includes('add') || message.toLowerCase().includes('create')) && !aiResponse.includes('```sql')) {
      aiResponse = `⚠️ **No database operation performed.** The AI generated a success message without creating the required SQL query.\n\nFor creation requests, you must provide all required information and generate the SQL query in code blocks first. Please try your request again with complete details like "Add expense $50 for groceries in the Food category".`;
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
  