const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkExpenses() {
  try {
    const userId = 'cmkz8m4g10000806t6niikbxx';

    // Get expenses through the proper relationship: User -> Books -> Categories -> Expenses
    const expenses = await prisma.expense.findMany({
      where: {
        category: {
          book: {
            userId: userId,
            isArchived: false
          }
        }
      },
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        category: {
          include: {
            book: true
          }
        }
      }
    });

    console.log(`Recent expenses for user ${userId}:`, expenses);
    console.log('Total expenses:', expenses.length);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkExpenses();

checkExpenses();