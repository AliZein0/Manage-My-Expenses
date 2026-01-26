const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function addCategoryToTestBook() {
  try {
    // Find the Test book
    const testBook = await prisma.book.findFirst({
      where: { name: 'Test' }
    });
    
    if (!testBook) {
      console.log('Test book not found');
      return;
    }
    
    console.log(`Test book ID: ${testBook.id}`);
    
    // Check if category C1 already exists
    const existingCategory = await prisma.category.findFirst({
      where: { 
        name: 'C1',
        bookId: testBook.id 
      }
    });
    
    if (existingCategory) {
      console.log(`Category C1 already exists: ${existingCategory.id}`);
      return;
    }
    
    // Create category C1
    const newCategory = await prisma.category.create({
      data: {
        name: 'C1',
        bookId: testBook.id
      }
    });
    
    console.log(`✅ Category C1 created successfully: ${newCategory.id}`);
    
    // Verify by checking all categories in Test book
    const categories = await prisma.category.findMany({
      where: { bookId: testBook.id }
    });
    
    console.log('\nCategories in Test book:');
    categories.forEach(cat => {
      console.log(`  - ${cat.name} (ID: ${cat.id})`);
    });
    
  } catch (error) {
    console.error('Error adding category:', error);
  } finally {
    await prisma.$disconnect();
  }
}

addCategoryToTestBook();
