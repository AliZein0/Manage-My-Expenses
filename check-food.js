const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkFoodCategory() {
  try {
    const categories = await prisma.category.findMany({
      where: { name: 'food' },
      include: { book: true }
    });

    if (categories.length > 0) {
      console.log('Food categories found:');
      categories.forEach(cat => {
        console.log('  - Book: ' + cat.book.name + ', Category ID: ' + cat.id);
      });
    } else {
      console.log('No food category found');
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkFoodCategory();