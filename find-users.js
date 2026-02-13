const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const books = await prisma.book.findMany({ include: { user: true } });
  console.log('Users with books:');
  books.forEach(b => console.log(b.user.email + ' - ' + b.name));
  await prisma.$disconnect();
})();