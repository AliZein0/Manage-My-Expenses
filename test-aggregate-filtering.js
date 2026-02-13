const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testAggregateFiltering() {
  console.log('🧪 Testing aggregate query filtering...');

  try {
    // Get a test user
    const testUser = await prisma.user.findFirst();
    if (!testUser) {
      console.log('❌ No users found in database');
      return;
    }

    console.log(`✅ Using test user: ${testUser.id}`);

    // Get user's books
    const books = await prisma.book.findMany({
      where: { userId: testUser.id, isArchived: false }
    });

    if (books.length === 0) {
      console.log('❌ No active books found');
      return;
    }

    // Get categories for a book that has them
    const targetBook = books.find(b => b.name === 'my house expenses') || books.find(b => b.name === 'Office ') || books[0];
    console.log(`✅ Using book: ${targetBook.name} (${targetBook.id})`);

    const categories = await prisma.category.findMany({
      where: { bookId: targetBook.id, isDisabled: false }
    });

    if (categories.length === 0) {
      console.log('❌ No active categories found in target book');
      return;
    }

    // Get existing totals for ALL user's books (since the query sums across all books)
    const allExistingExpenses = await prisma.expense.findMany({
      where: { category: { book: { userId: testUser.id } } },
      include: { category: true }
    });

    const existingActiveTotal = allExistingExpenses.filter(e => !e.isDisabled).reduce((sum, e) => sum + e.amount, 0);
    const existingDisabledTotal = allExistingExpenses.filter(e => e.isDisabled).reduce((sum, e) => sum + e.amount, 0);

    console.log(`Existing active expenses total (all books): $${existingActiveTotal}`);
    console.log(`Existing disabled expenses total (all books): $${existingDisabledTotal}`);

    // Create test expenses - some active, some disabled
    const activeExpense = await prisma.expense.create({
      data: {
        amount: 100.00,
        date: new Date(),
        description: 'Test active expense',
        categoryId: categories[0].id,
        paymentMethod: 'Cash',
        isDisabled: false
      }
    });

    const disabledExpense = await prisma.expense.create({
      data: {
        amount: 200.00,
        date: new Date(),
        description: 'Test disabled expense',
        categoryId: categories[0].id,
        paymentMethod: 'Cash',
        isDisabled: true
      }
    });

    console.log(`✅ Created test expenses:`);
    console.log(`   - Active: $${activeExpense.amount} (ID: ${activeExpense.id})`);
    console.log(`   - Disabled: $${disabledExpense.amount} (ID: ${disabledExpense.id})`);

    // Test the aggregate query that should exclude disabled expenses
    const sumQuery = `SELECT SUM(e.amount) as total FROM expenses e JOIN categories c ON e.categoryId = c.id JOIN books b ON c.bookId = b.id WHERE b.userId = '${testUser.id}'`;

    console.log('\n🧪 Testing aggregate query:');
    console.log(sumQuery);

    // Simulate what executeSafeQuery should do
    const queryLower = sumQuery.toLowerCase();
    const isAskingForDisabled = queryLower.includes('disabled') || queryLower.includes('deleted') || queryLower.includes('archived');

    let finalQuery = sumQuery;
    if (!isAskingForDisabled) {
      if (queryLower.includes('from expenses') || queryLower.includes('expenses e')) {
        if (finalQuery.includes('WHERE') && !finalQuery.includes('e.isDisabled = false')) {
          finalQuery = finalQuery.replace(
            /WHERE\s+/i,
            'WHERE e.isDisabled = false AND c.isDisabled = false AND b.isArchived = false AND '
          );
        }
      }
    }

    console.log('Modified query (should exclude disabled):');
    console.log(finalQuery);

    // Execute the modified query
    const result = await prisma.$queryRawUnsafe(finalQuery);
    console.log('Query result:', result);

    const expectedTotal = existingActiveTotal + 100.00; // Only the active expense we added
    const actualTotal = result[0]?.total || 0;

    if (Math.abs(actualTotal - expectedTotal) < 0.01) {
      console.log(`✅ SUCCESS: Total is $${actualTotal} (expected $${expectedTotal})`);
    } else {
      console.log(`❌ FAILURE: Total is $${actualTotal} (expected $${expectedTotal})`);
    }

    // Test query that should include disabled expenses
    const disabledSumQuery = `SELECT SUM(e.amount) as total FROM expenses e JOIN categories c ON e.categoryId = c.id JOIN books b ON c.bookId = b.id WHERE b.userId = '${testUser.id}' AND e.isDisabled = true`;

    console.log('\n🧪 Testing query that asks for disabled expenses:');
    console.log(disabledSumQuery);

    const disabledResult = await prisma.$queryRawUnsafe(disabledSumQuery);
    console.log('Query result:', disabledResult);

    const expectedDisabledTotal = existingDisabledTotal + 200.00; // Only the disabled expense we added
    const actualDisabledTotal = disabledResult[0]?.total || 0;

    if (Math.abs(actualDisabledTotal - expectedDisabledTotal) < 0.01) {
      console.log(`✅ SUCCESS: Disabled total is $${actualDisabledTotal} (expected $${expectedDisabledTotal})`);
    } else {
      console.log(`❌ FAILURE: Disabled total is $${actualDisabledTotal} (expected $${expectedDisabledTotal})`);
    }

    // Clean up
    await prisma.expense.deleteMany({
      where: { id: { in: [activeExpense.id, disabledExpense.id] } }
    });
    console.log('\n🧹 Cleaned up test data');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testAggregateFiltering();