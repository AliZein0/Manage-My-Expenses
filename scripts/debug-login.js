const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function testLoginFlow() {
  try {
    await prisma.$connect();
    
    // Get all users
    const users = await prisma.user.findMany();
    console.log('=== DATABASE CHECK ===');
    console.log('Total users:', users.length);
    
    if (users.length > 0) {
      console.log('\nUsers:');
      users.forEach((user, index) => {
        console.log(`${index + 1}. ${user.email} (ID: ${user.id.substring(0, 8)}...)`);
      });
      
      // Test the first user's password
      const testUser = users[0];
      console.log('\n=== PASSWORD TEST ===');
      console.log('Testing user:', testUser.email);
      
      // Test common passwords
      const testPasswords = ['demo123', 'password', '123456', ''];
      
      for (const pass of testPasswords) {
        const isValid = await bcrypt.compare(pass, testUser.password || '');
        console.log(`Password '${pass}': ${isValid ? '✅ VALID' : '❌ INVALID'}`);
      }
      
      // Show what password was actually used (hashed)
      console.log('\nStored password hash:', testUser.password?.substring(0, 20) + '...');
    }
    
    await prisma.$disconnect();
  } catch (error) {
    console.error('Error:', error.message);
    await prisma.$disconnect();
  }
}

testLoginFlow();