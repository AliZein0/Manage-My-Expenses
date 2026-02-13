const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const user = await prisma.user.findFirst({ where: { email: 'ali@gmail.com' } });
  console.log('User ID:', user.id);
  await prisma.$disconnect();
})();