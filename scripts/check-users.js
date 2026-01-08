const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkUsers() {
  try {
    const users = await prisma.user.findMany();
    console.log('Current users:', users);
    
    if (users.length === 0) {
      console.log('❌ No users found in database!');
    } else {
      console.log('✅ Users found:', users.length);
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkUsers();