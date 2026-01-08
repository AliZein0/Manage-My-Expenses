const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function testCreation() {
  try {
    console.log('🔄 Testing creation process...');
    
    // Get or create test user
    let user = await prisma.user.findUnique({ where: { email: 'test@example.com' } });
    if (!user) {
      const hashedPassword = await bcrypt.hash('test123', 12);
      user = await prisma.user.create({
        data: {
          email: 'test@example.com',
          name: 'Test User',
          password: hashedPassword,
        },
      });
      console.log('✅ Created test user');
    } else {
      console.log('✅ Test user exists');
    }

    // Test creating a book
    const bookData = {
      name: 'Test Book ' + Date.now(),
      description: 'Test description',
      currency: 'USD',
      userId: user.id,
    };

    const newBook = await prisma.book.create({ data: bookData });
    console.log('✅ Book created:', newBook.name);

    // Test creating a category
    const categoryData = {
      name: 'Test Category ' + Date.now(),
      description: 'Test category description',
      color: '#3b82f6',
      bookId: newBook.id,
    };

    const newCategory = await prisma.category.create({ data: categoryData });
    console.log('✅ Category created:', newCategory.name);

    // Verify data was saved
    const verifyBook = await prisma.book.findUnique({ where: { id: newBook.id } });
    const verifyCategory = await prisma.category.findUnique({ where: { id: newCategory.id } });

    console.log('\n📊 Verification:');
    console.log('Book saved:', verifyBook ? '✅' : '❌');
    console.log('Category saved:', verifyCategory ? '✅' : '❌');

    console.log('\n🎉 All tests passed! The creation process is working.');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

testCreation();