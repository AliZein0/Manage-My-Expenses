const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkDatabase() {
  try {
    const user = await prisma.user.findFirst();
    const books = await prisma.book.findMany({ where: { userId: user.id, isArchived: false } });

    console.log('Books:', books.length);
    console.log('Books details:', books.map(b => ({ name: b.name, id: b.id })));

    for (const book of books) {
      const categories = await prisma.category.findMany({ where: { bookId: book.id } });
      console.log(`Book "${book.name}" has ${categories.length} categories:`, categories.map(c => ({ name: c.name, isDisabled: c.isDisabled })));
    }

    // Find any book with categories
    const bookWithCategories = books.find(async (book) => {
      const cats = await prisma.category.findMany({ where: { bookId: book.id } });
      return cats.length > 0;
    });

    if (bookWithCategories) {
      console.log('Found book with categories:', bookWithCategories.name);
    } else {
      console.log('No books have categories. Let me create some test data.');

      // Create a test category
      const testCategory = await prisma.category.create({
        data: {
          name: 'Test Category',
          description: 'For testing',
          bookId: books[0].id,
          icon: 'Test',
          color: '#000000',
          isDisabled: false
        }
      });

      console.log('Created test category:', testCategory.name);
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkDatabase();