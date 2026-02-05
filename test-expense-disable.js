const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testExpenseDisableAPI() {
  console.log('🧪 Testing expense disable API call...');

  try {
    // Get a test user
    const testUser = await prisma.user.findFirst();
    if (!testUser) {
      console.log('❌ No users found in database');
      return;
    }

    // Get a category
    const testCategory = await prisma.category.findFirst({
      where: { isDisabled: false }
    });

    if (!testCategory) {
      console.log('❌ No active categories found');
      return;
    }

    // Create a test expense
    const testExpense = await prisma.expense.create({
      data: {
        amount: 400.00,
        date: new Date(),
        description: 'Test 400 dollar expense for disable test',
        categoryId: testCategory.id,
        paymentMethod: 'Credit Card',
        isDisabled: false
      }
    });

    console.log(`✅ Created test expense: "${testExpense.description}" - $${testExpense.amount} (ID: ${testExpense.id})`);

    // Test the SQL query that should work
    const sqlQuery = `UPDATE expenses e
JOIN categories c ON e.categoryId = c.id
JOIN books b ON c.bookId = b.id
SET e.isDisabled = true, e.updatedAt = NOW()
WHERE c.name = '${testCategory.name}'
  AND e.amount = 400.00
  AND b.userId = '${testUser.id}'`;

    console.log('🧪 Testing SQL validation with query:');
    console.log(sqlQuery);

    // Simulate the validation
    const trimmedQuery = sqlQuery.trim().toLowerCase();
    const upperQuery = trimmedQuery.toUpperCase().replace(/\s+/g, ' ');
    const andIndex = upperQuery.indexOf(' AND ');
    const whereIndex = upperQuery.indexOf(' WHERE ');

    console.log('Validation check:');
    console.log('AND index:', andIndex, 'WHERE index:', whereIndex);

    if (andIndex !== -1 && whereIndex === -1) {
      console.log('❌ FAIL: AND found but no WHERE');
    } else if (andIndex !== -1 && andIndex < whereIndex) {
      console.log('❌ FAIL: AND before WHERE');
    } else {
      console.log('✅ PASS: Query should be accepted');
    }

    // Clean up
    await prisma.expense.delete({ where: { id: testExpense.id } });
    console.log('🧹 Cleaned up test data');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testExpenseDisableAPI();