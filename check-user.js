const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const user = await prisma.user.findFirst({ where: { email: 'test@example.com' } });
  console.log(user ? 'User exists: ' + user.id : 'User not found');
  await prisma.$disconnect();
})();