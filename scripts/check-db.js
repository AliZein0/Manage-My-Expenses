const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkTables() {
  try {
    await prisma.$connect();
    
    // Check if tables exist by trying to query each model
    const models = ['user', 'book', 'category', 'expense', 'account', 'session', 'verificationToken'];
    
    console.log('Checking database tables:');
    for (const model of models) {
      try {
        const count = await prisma[model].count();
        console.log(`✅ ${model}: ${count} records`);
      } catch (error) {
        console.log(`❌ ${model}: Not found or error`);
      }
    }
    
    await prisma.$disconnect();
  } catch (error) {
    console.error('Error:', error.message);
    await prisma.$disconnect();
  }
}

checkTables();