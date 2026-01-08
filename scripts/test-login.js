const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function testLogin() {
  try {
    await prisma.$connect();
    
    // Check users
    const users = await prisma.user.findMany();
    console.log('Users in database:', users.length);
    
    if (users.length === 0) {
      console.log('No users found. Creating demo user...');
      
      const hashedPassword = await bcrypt.hash('demo123', 12);
      const user = await prisma.user.create({
        data: {
          email: 'demo@example.com',
          name: 'Demo User',
          password: hashedPassword,
        }
      });
      
      console.log('✅ Demo user created:', user.email);
      console.log('Password: demo123');
    } else {
      console.log('Existing users:');
      users.forEach(user => {
        console.log(`- ${user.email} (${user.name})`);
      });
    }
    
    await prisma.$disconnect();
  } catch (error) {
    console.error('Error:', error.message);
    await prisma.$disconnect();
  }
}

testLogin();