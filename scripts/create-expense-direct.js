const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Simulate the extractExpenseData function
function extractExpenseData(message) {
  // Try to find amount
  const amountMatch = message.match(/\$?(\d+(?:\.\d{2})?)/);
  const amount = amountMatch ? parseFloat(amountMatch[1]) : null;

  // Try to find date
  const dateMatch = message.match(/(\d{4}-\d{2}-\d{2})/);
  const date = dateMatch ? dateMatch[1] : new Date().toISOString().split('T')[0];

  // Try to find description - look for the text between the amount and the category/book keywords
  let description = '';
  
  // For "new expenses 150$ to internet category in X book"
  // We want to extract "internet"
  
  // First, remove the amount and currency symbols
  let tempMsg = message.replace(/\$?\d+(?:\.\d{2})?/, '').trim();
  
  // Remove "new expenses" or "add expense" etc
  tempMsg = tempMsg.replace(/^(new|add|create)\s+expenses?\s+/i, '').trim();
  
  // Remove "to" at the start if present
  tempMsg = tempMsg.replace(/^to\s+/i, '').trim();
  
  // Remove category and book parts
  tempMsg = tempMsg.replace(/\s+in\s+the\s+['"]?[^'"]+['"]?\s+category/gi, '');
  tempMsg = tempMsg.replace(/\s+in\s+['"]?[^'"]+['"]?\s+category/gi, '');
  tempMsg = tempMsg.replace(/\s+in\s+the\s+['"]?[^'"]+['"]?\s+book/gi, '');
  tempMsg = tempMsg.replace(/\s+in\s+['"]?[^'"]+['"]?\s+book/gi, '');
  
  // Remove any trailing prepositions
  tempMsg = tempMsg.replace(/\s+(to|for|in|on|at|by)\s*$/i, '').trim();
  
  description = tempMsg;

  // Try to find category
  let category = 'General';
  const categoryPatterns = [
    /in\s+the\s+['"]([^'"]+)['"]\s+category/i,
    /in\s+['"]([^'"]+)['"]\s+category/i,
    /for\s+the\s+['"]([^'"]+)['"]\s+category/i,
    /for\s+['"]([^'"]+)['"]\s+category/i,
    /in\s+the\s+([^'"]+?)\s+category/i,
    /in\s+([^'"]+?)\s+category/i,
    /for\s+the\s+([^'"]+?)\s+category/i,
    /for\s+([^'"]+?)\s+category/i,
    /to\s+([^'"]+?)\s+category/i  // Added this pattern for "to internet category"
  ];

  for (const pattern of categoryPatterns) {
    const match = message.match(pattern);
    if (match) {
      category = match[1].trim();
      category = category.replace(/\s+book\s*$/i, '').trim();
      break;
    }
  }

  return { amount, description, date, category };
}

// Simulate extractBook function
function extractBook(message) {
  const quotedPatterns = [
    /in\s+the\s+['"]([^'"]+)['"]\s+book/i,
    /in\s+['"]([^'"]+)['"]\s+book/i,
    /to\s+the\s+['"]([^'"]+)['"]\s+book/i,
    /to\s+['"]([^'"]+)['"]\s+book/i,
    /for\s+the\s+['"]([^'"]+)['"]\s+book/i,
    /for\s+['"]([^'"]+)['"]\s+book/i,
  ];

  for (const pattern of quotedPatterns) {
    const match = message.match(pattern);
    if (match) return match[1].trim();
  }

  const lowerMessage = message.toLowerCase();
  const categoryIndex = lowerMessage.indexOf('category');
  
  let searchStart = 0;
  if (categoryIndex !== -1) {
    searchStart = categoryIndex + 'category'.length;
  }
  
  const bookIndex = lowerMessage.indexOf('book', searchStart);
  if (bookIndex === -1) return null;
  
  const textBeforeBook = message.substring(searchStart, bookIndex).trim();
  const lowerText = textBeforeBook.toLowerCase();
  const lastInIndex = lowerText.lastIndexOf(' in ');
  const lastToIndex = lowerText.lastIndexOf(' to ');
  const lastForIndex = lowerText.lastIndexOf(' for ');
  
  const startsWithIn = lowerText.startsWith('in ');
  const startsWithTo = lowerText.startsWith('to ');
  const startsWithFor = lowerText.startsWith('for ');
  
  let lastPrepIndex = Math.max(lastInIndex, lastToIndex, lastForIndex);
  let prepLength = 4;
  
  if (lastPrepIndex === -1) {
    if (startsWithIn) {
      lastPrepIndex = 0;
      prepLength = 3;
    } else if (startsWithTo) {
      lastPrepIndex = 0;
      prepLength = 3;
    } else if (startsWithFor) {
      lastPrepIndex = 0;
      prepLength = 4;
    }
  }
  
  if (lastPrepIndex >= 0) {
    let bookName = textBeforeBook.substring(lastPrepIndex + prepLength).trim();
    bookName = bookName.replace(/^the\s+/i, '').trim();
    if (bookName) return bookName;
  }

  if (categoryIndex === -1) {
    const lastBookIndex = lowerMessage.lastIndexOf('book');
    if (lastBookIndex === -1) return null;
    
    const textBeforeLastBook = message.substring(0, lastBookIndex).trim();
    const lastInIndex = textBeforeLastBook.toLowerCase().lastIndexOf(' in ');
    const lastToIndex = textBeforeLastBook.toLowerCase().lastIndexOf(' to ');
    const lastForIndex = textBeforeLastBook.toLowerCase().lastIndexOf(' for ');
    
    const lastPrepIndex = Math.max(lastInIndex, lastToIndex, lastForIndex);
    if (lastPrepIndex === -1) return null;
    
    const bookName = textBeforeLastBook.substring(lastPrepIndex + 4).trim();
    const finalBookName = bookName.replace(/^the\s+/i, '').trim();
    
    if (finalBookName && finalBookName.length > 0) {
      return finalBookName;
    }
  }

  return null;
}

async function createExpense(userId, message) {
  try {
    // Extract data from message
    const expenseData = extractExpenseData(message);
    const bookName = extractBook(message);
    
    console.log('Extracted data:', {
      amount: expenseData.amount,
      description: expenseData.description,
      date: expenseData.date,
      category: expenseData.category,
      book: bookName
    });
    
    if (!expenseData.amount || !expenseData.description) {
      throw new Error('Missing required expense data (amount and description)');
    }

    // Find book
    let bookId = null;
    if (bookName) {
      const book = await prisma.book.findFirst({
        where: { 
          userId, 
          isArchived: false,
          name: bookName
        }
      });
      if (book) {
        bookId = book.id;
      }
    }

    if (!bookId && bookName) {
      const userBooks = await prisma.book.findMany({
        where: { userId, isArchived: false }
      });
      
      if (userBooks.length === 0) {
        throw new Error(`Book "${bookName}" not found and you have no other books. Please create the book first.`);
      }
      
      const availableBooks = userBooks.map(b => `"${b.name}"`).join(', ');
      throw new Error(`Book "${bookName}" not found. Available books: ${availableBooks}. Please use an existing book or create it first.`);
    }
    
    if (!bookId) {
      const userBooks = await prisma.book.findMany({
        where: { userId, isArchived: false },
        take: 1
      });
      if (userBooks.length > 0) {
        bookId = userBooks[0].id;
      } else {
        throw new Error('No book found. Please create a book first.');
      }
    }

    // Find or create category
    let category = await prisma.category.findFirst({
      where: { 
        name: expenseData.category,
        bookId: bookId
      }
    });

    if (!category) {
      console.log(`Creating category "${expenseData.category}" in book ${bookId}...`);
      category = await prisma.category.create({
        data: {
          name: expenseData.category,
          description: `Auto-created for expense: ${expenseData.description}`,
          bookId: bookId,
          icon: '',
          color: ''
        }
      });
    }

    console.log(`Using category: ${category.name} (ID: ${category.id})`);

    // Generate SQL INSERT query
    const query = `INSERT INTO expenses (id, amount, date, description, categoryId, paymentMethod, isDisabled, createdAt, updatedAt) 
VALUES (UUID(), ${expenseData.amount}, '${expenseData.date}', '${expenseData.description.replace(/'/g, "''")}', '${category.id}', 'Other', false, NOW(), NOW())`;

    console.log('\nGenerated SQL Query:');
    console.log(query);

    // Execute the query
    console.log('\nExecuting query...');
    const result = await prisma.$executeRawUnsafe(query);
    
    console.log(`✅ Success! ${result} row(s) affected.`);

    // Verify the expense was created
    const newExpense = await prisma.expense.findFirst({
      where: { 
        amount: expenseData.amount,
        description: expenseData.description,
        categoryId: category.id
      },
      orderBy: { createdAt: 'desc' }
    });

    if (newExpense) {
      console.log('\n📊 Created expense:');
      console.log(`  ID: ${newExpense.id}`);
      console.log(`  Amount: $${newExpense.amount}`);
      console.log(`  Description: ${newExpense.description}`);
      console.log(`  Date: ${newExpense.date.toISOString().split('T')[0]}`);
      console.log(`  Category: ${category.name}`);
      console.log(`  Book: ${bookName}`);
    }

    return {
      success: true,
      expense: newExpense,
      query: query
    };

  } catch (error) {
    console.error('❌ Error:', error.message);
    return {
      success: false,
      error: error.message
    };
  } finally {
    await prisma.$disconnect();
  }
}

// Get the user who owns the X book
async function getCurrentUser() {
  try {
    const xBook = await prisma.book.findFirst({ where: { name: 'X' } });
    if (!xBook) {
      throw new Error('X book not found');
    }
    const user = await prisma.user.findUnique({ where: { id: xBook.userId } });
    if (!user) {
      throw new Error('User not found');
    }
    return user;
  } catch (error) {
    console.error('Error getting user:', error);
    return null;
  }
}

// Run the creation
async function run() {
  const user = await getCurrentUser();
  if (!user) {
    console.log('No user found. Please create a user first.');
    return;
  }

  console.log(`Creating expense for user: ${user.email} (ID: ${user.id})`);
  console.log('Message: "new expenses 150$ to internet category in X book"');
  console.log('─'.repeat(60));
  
  await createExpense(user.id, 'new expenses 150$ to internet category in X book');
}

run();