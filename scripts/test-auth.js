const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function testAuth() {
  try {
    await prisma.$connect();
    
    // Get a user
    const user = await prisma.user.findFirst();
    
    if (user && user.password) {
      // Test password verification
      const testPassword = 'demo123';
      const isValid = await bcrypt.compare(testPassword, user.password);
      
      console.log('User found:', user.email);
      console.log('Password test (demo123):', isValid ? '✅ VALID' : '❌ INVALID');
      console.log('User ID:', user.id);
      
      if (!isValid) {
        console.log('\n⚠️  Password mismatch! The user password might be different.');
        console.log('Try logging in with the password you used during registration.');
      }
    } else {
      console.log('No users found or user has no password');
    }
    
    await prisma.$disconnect();
  } catch (error) {
    console.error('Error:', error.message);
    await prisma.$disconnect();
  }
}

testAuth();