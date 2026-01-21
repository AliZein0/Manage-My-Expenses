const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function createTestUser() {
  try {
    await prisma.$connect();
    
    // Create a test user with known password
    const hashedPassword = await bcrypt.hash('demo123', 12);
    const user = await prisma.user.create({
      data: {
        email: 'newtest@example.com',
        name: 'New Test User',
        password: hashedPassword,
      }
    });
    
    console.log('✅ Created test user:', user.email);
    console.log('Password: demo123');
    console.log('Try logging in with these credentials!');
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

createTestUser();