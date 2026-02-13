const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const expenses = await prisma.expense.findMany({
    include: { category: { include: { book: true } } },
    orderBy: { createdAt: 'desc' },
    take: 10
  });
  console.log('Recent expenses:');
  expenses.forEach(e => console.log(`Amount: ${e.amount}, Desc: '${e.description}', Category: ${e.category.name}, Book: ${e.category.book.name}`));
  await prisma.$disconnect();
})();