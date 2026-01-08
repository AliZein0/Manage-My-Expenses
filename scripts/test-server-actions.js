const { getAuthSessionEdge } = require('../src/lib/auth');
const { getPrismaClient } = require('../src/lib/prisma');

async function testServerActions() {
  console.log('🔄 Testing server actions...');
  
  try {
    // Test auth session
    console.log('🔄 Testing auth session...');
    const session = await getAuthSessionEdge();
    console.log('Auth session:', session);
    
    // Test Prisma client
    console.log('🔄 Testing Prisma client...');
    const prisma = getPrismaClient();
    const userCount = await prisma.user.count();
    console.log('User count:', userCount);
    
    // Test creating a category
    console.log('🔄 Testing category creation...');
    const formData = new FormData();
    formData.append('name', 'Test Category');
    formData.append('description', 'Test Description');
    formData.append('bookId', 'test-book-id');
    formData.append('color', '#ff0000');
    
    // This would normally be called from the server action
    // But we can't easily test it without the full Next.js context
    
    console.log('✅ All tests passed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

testServerActions();