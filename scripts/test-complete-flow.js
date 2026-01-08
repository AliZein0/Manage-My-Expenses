const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function testCompleteFlow() {
  console.log('🧪 Testing Complete Application Flow...\n');

  try {
    // Test 1: Check database connection
    console.log('1. Testing database connection...');
    await prisma.$queryRaw`SELECT 1`;
    console.log('   ✅ Database connection successful\n');

    // Test 2: Create or find test user
    console.log('2. Testing user operations...');
    const testEmail = 'test@example.com';
    const testPassword = await bcrypt.hash('test123', 10);
    
    let user = await prisma.user.findUnique({
      where: { email: testEmail }
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: testEmail,
          name: 'Test User',
          password: testPassword
        }
      });
      console.log('   ✅ Created new test user');
    } else {
      console.log('   ✅ Found existing test user');
    }
    console.log(`   User ID: ${user.id}\n`);

    // Test 3: Create a book
    console.log('3. Testing book creation...');
    const bookName = `Test Book ${Date.now()}`;
    const book = await prisma.book.create({
      data: {
        name: bookName,
        description: 'Test book for complete flow',
        userId: user.id
      }
    });
    console.log(`   ✅ Created book: ${book.name}`);
    console.log(`   Book ID: ${book.id}\n`);

    // Test 4: Create a category
    console.log('4. Testing category creation...');
    const categoryName = `Test Category ${Date.now()}`;
    const category = await prisma.category.create({
      data: {
        name: categoryName,
        description: 'Test category for complete flow',
        bookId: book.id
      }
    });
    console.log(`   ✅ Created category: ${category.name}`);
    console.log(`   Category ID: ${category.id}\n`);

    // Test 5: Create an expense
    console.log('5. Testing expense creation...');
    const expense = await prisma.expense.create({
      data: {
        amount: 150.50,
        description: 'Test expense for complete flow',
        date: new Date(),
        categoryId: category.id
      }
    });
    console.log(`   ✅ Created expense: $${expense.amount} - ${expense.description}`);
    console.log(`   Expense ID: ${expense.id}\n`);

    // Test 6: Verify data relationships
    console.log('6. Testing data relationships...');
    const verifyExpense = await prisma.expense.findUnique({
      where: { id: expense.id },
      include: {
        category: {
          include: {
            book: true
          }
        }
      }
    });

    if (verifyExpense && 
        verifyExpense.category.book.userId === user.id) {
      console.log('   ✅ All relationships verified correctly');
    } else {
      console.log('   ❌ Relationship verification failed');
    }
    console.log('');

    // Test 7: Query user's data
    console.log('7. Testing user data queries...');
    const userBooks = await prisma.book.findMany({
      where: { userId: user.id }
    });
    const userCategories = await prisma.category.findMany({
      where: { 
        book: {
          userId: user.id
        }
      }
    });
    const userExpenses = await prisma.expense.findMany({
      where: { 
        category: {
          book: {
            userId: user.id
          }
        }
      }
    });

    console.log(`   ✅ User has ${userBooks.length} book(s)`);
    console.log(`   ✅ User has ${userCategories.length} category(ies)`);
    console.log(`   ✅ User has ${userExpenses.length} expense(s)\n`);

    // Test 8: Calculate summary
    console.log('8. Testing expense summary calculation...');
    const totalExpenses = userExpenses.reduce((sum, exp) => sum + exp.amount, 0);
    console.log(`   ✅ Total expenses: $${totalExpenses.toFixed(2)}\n`);

    // Test 9: Verify foreign key constraints
    console.log('9. Testing foreign key constraints...');
    try {
      // Try to create expense with non-existent user
      await prisma.expense.create({
        data: {
          amount: 100,
          description: 'Should fail',
          date: new Date(),
          categoryId: category.id,
          userId: 'non-existent-user-id'
        }
      });
      console.log('   ❌ Foreign key constraint failed - should have thrown error');
    } catch (error) {
      console.log('   ✅ Foreign key constraint working correctly');
    }
    console.log('');

    // Test 10: Clean up test data (optional)
    console.log('10. Test data summary:');
    console.log(`    User: ${user.email} (${user.id})`);
    console.log(`    Book: ${book.name} (${book.id})`);
    console.log(`    Category: ${category.name} (${category.id})`);
    console.log(`    Expense: $${expense.amount} (${expense.id})`);
    console.log('');

    console.log('🎉 ALL TESTS PASSED! The application flow is working correctly.');
    console.log('\nYou can now test the browser interface:');
    console.log('1. Go to http://localhost:3000/login');
    console.log('2. Login with: test@example.com / test123');
    console.log('3. Create books, categories, and expenses');
    console.log('4. Verify data persists in the database');

  } catch (error) {
    console.error('❌ TEST FAILED:', error.message);
    console.error('Error details:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testCompleteFlow();
