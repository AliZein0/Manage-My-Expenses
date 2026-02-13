const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkDefaults() {
  try {
    const defaults = await prisma.category.findMany({
      where: { isDefault: true }
    });
    console.log('Default categories:', defaults.length);
    console.log(defaults.map(d => ({ name: d.name, id: d.id, bookId: d.bookId })));
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkDefaults();