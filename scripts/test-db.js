const { PrismaClient } = require('@prisma/client');

async function testDatabase() {
  const prisma = new PrismaClient();
  
  try {
    console.log('🔄 Testing database connection...');
    await prisma.$connect();
    console.log('✅ Database connected successfully!');
    
    // Test creating a simple record
    console.log('🔄 Testing write operation...');
    const testUser = await prisma.user.create({
      data: {
        email: `test-${Date.now()}@example.com`,
        name: 'Test User'
      }
    });
    console.log('✅ Write operation successful!');
    console.log('Created user:', testUser);
    
    // Clean up
    await prisma.user.delete({ where: { id: testUser.id } });
    console.log('✅ Cleanup successful!');
    
  } catch (error) {
    console.error('❌ Database error:', error.message);
    if (error.code) {
      console.error('Error code:', error.code);
    }
  } finally {
    await prisma.$disconnect();
    console.log('🔌 Database connection closed');
  }
}

testDatabase();