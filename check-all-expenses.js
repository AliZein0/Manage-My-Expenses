const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkAllExpenses() {
  try {
    const user = await prisma.user.findFirst();
    const expenses = await prisma.expense.findMany({
      where: { category: { book: { userId: user.id } } },
      include: { category: { include: { book: true } } }
    });

    console.log('All expenses for user:');
    let activeTotal = 0;
    let disabledTotal = 0;
    expenses.forEach(e => {
      const status = e.isDisabled ? 'disabled' : 'active';
      console.log(`  ${e.category.book.name}: ${e.description} - $${e.amount} (${status})`);
      if (e.isDisabled) disabledTotal += e.amount;
      else activeTotal += e.amount;
    });
    console.log('Total expenses:', expenses.length);
    console.log('Active total:', activeTotal);
    console.log('Disabled total:', disabledTotal);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAllExpenses();