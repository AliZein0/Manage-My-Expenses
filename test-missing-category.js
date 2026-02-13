const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testMissingCategoryExpense() {
  try {
    // Get test user
    const testUser = await prisma.user.findFirst({ where: { email: 'test@example.com' } });
    if (!testUser) {
      console.log('❌ Test user not found. Run create-test-data.js first.');
      return;
    }

    console.log(`👤 Testing with user: ${testUser.email}`);

    // Get user's books
    const books = await prisma.book.findMany({
      where: { userId: testUser.id, isArchived: false }
    });

    console.log(`📚 User has ${books.length} books:`);
    books.forEach(book => console.log(`  - ${book.name} (ID: ${book.id})`));

    // Get existing categories
    const categories = await prisma.category.findMany({
      where: { bookId: { in: books.map(b => b.id) }, isDisabled: false }
    });

    console.log(`📁 Existing categories:`);
    categories.forEach(cat => console.log(`  - ${cat.name} in ${cat.bookId}`));

    // Test: Try to add expense to a category that doesn't exist
    const testExpense = {
      description: "internet bill",
      amount: 75,
      category: "Bills & Utilities", // This category doesn't exist yet
      paymentMethod: "Credit Card"
    };

    console.log(`\n🧪 Testing expense creation:`);
    console.log(`  Description: ${testExpense.description}`);
    console.log(`  Amount: $${testExpense.amount}`);
    console.log(`  Category: ${testExpense.category} (doesn't exist yet)`);
    console.log(`  Payment Method: ${testExpense.paymentMethod}`);

    // Check if category exists
    const existingCategory = categories.find(cat => cat.name === testExpense.category);
    if (existingCategory) {
      console.log(`❌ Category "${testExpense.category}" already exists - test won't work`);
      return;
    }

    console.log(`✅ Category "${testExpense.category}" doesn't exist - perfect for testing`);

    // Simulate what the AI should do:
    // 1. Recognize category doesn't exist
    // 2. Create the category first
    // 3. Then create the expense

    console.log(`\n🤖 AI should generate these SQL queries:`);

    // Use the first book for testing
    const targetBook = books[0];
    console.log(`Using book: ${targetBook.name} (ID: ${targetBook.id})`);

    // Category creation SQL
    const categorySql = `INSERT INTO categories (id, name, description, bookId, icon, color, isDisabled, isDefault, createdAt, updatedAt) VALUES (UUID(), '${testExpense.category}', 'Electricity, water, internet, phone bills, utilities', '${targetBook.id}', 'Zap', '#FFEAA7', false, false, NOW(), NOW())`;
    console.log(`1. Create category:\n${categorySql}`);

    // Expense creation SQL (would use the newly created category ID)
    const expenseSql = `INSERT INTO expenses (id, amount, date, description, categoryId, paymentMethod, isDisabled, createdAt, updatedAt) VALUES (UUID(), ${testExpense.amount}.00, CURDATE(), '${testExpense.description}', (SELECT id FROM categories WHERE name = '${testExpense.category}' AND bookId = '${targetBook.id}' LIMIT 1), '${testExpense.paymentMethod}', false, NOW(), NOW())`;
    console.log(`2. Create expense:\n${expenseSql}`);

    console.log(`\n⚠️  Note: The expense SQL above still uses a subquery, which would cause MariaDB errors.`);
    console.log(`✅ The AI should now create the category first, then use the direct category ID for the expense.`);

  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testMissingCategoryExpense();
