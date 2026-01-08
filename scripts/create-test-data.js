const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function createTestData() {
  try {
    // Create a test user
    const hashedPassword = await bcrypt.hash('test123', 12);
    const user = await prisma.user.upsert({
      where: { email: 'test@example.com' },
      update: {},
      create: {
        email: 'test@example.com',
        name: 'Test User',
        password: hashedPassword,
      },
    });
    console.log('✅ User created:', user.email);

    // Create a test book
    const book = await prisma.book.upsert({
      where: { id: 'test-book-123' },
      update: {},
      create: {
        id: 'test-book-123',
        name: 'Test Book',
        description: 'A test book for testing',
        currency: 'USD',
        userId: user.id,
      },
    });
    console.log('✅ Book created:', book.name);

    // Create a test category
    const category = await prisma.category.upsert({
      where: { id: 'test-category-123' },
      update: {},
      create: {
        id: 'test-category-123',
        name: 'Test Category',
        description: 'A test category',
        color: '#3b82f6',
        bookId: book.id,
      },
    });
    console.log('✅ Category created:', category.name);

    console.log('\n🎉 Test data created successfully!');
    console.log('You can now log in with:');
    console.log('Email: test@example.com');
    console.log('Password: test123');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

createTestData();