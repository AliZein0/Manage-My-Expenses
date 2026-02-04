const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkOfficeCategories() {
  try {
    const book = await prisma.book.findFirst({ where: { name: 'Office' } });
    if (book) {
      const cats = await prisma.category.findMany({ where: { bookId: book.id } });
      console.log('Categories in Office book:');
      cats.forEach(c => console.log('  - ' + c.name));
    } else {
      console.log('Office book not found');
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkOfficeCategories();