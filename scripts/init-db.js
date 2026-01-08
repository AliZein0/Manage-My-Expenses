#!/usr/bin/env node

/**
 * Database Initialization Script
 * This script helps you set up the database for Manage My Expenses
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Initializing Manage My Expenses database...\n');

  // Check if database is accessible
  try {
    await prisma.$connect();
    console.log('✅ Database connection successful');
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    console.error('\nPlease check your DATABASE_URL in .env file');
    process.exit(1);
  }

  // Count existing users
  const userCount = await prisma.user.count();
  console.log(`📊 Current users in database: ${userCount}`);

  if (userCount === 0) {
    console.log('\n📝 Creating demo user...');
    
    const hashedPassword = await bcrypt.hash('demo123', 12);
    
    const demoUser = await prisma.user.create({
      data: {
        email: 'demo@example.com',
        name: 'Demo User',
        password: hashedPassword,
      },
    });

    console.log('✅ Demo user created:');
    console.log('   Email: demo@example.com');
    console.log('   Password: demo123');
    console.log('   Name: Demo User');

    // Create a demo book
    const demoBook = await prisma.book.create({
      data: {
        name: 'Demo Book',
        description: 'A sample book to get you started',
        currency: 'USD',
        userId: demoUser.id,
      },
    });

    console.log('\n✅ Demo book created:', demoBook.name);

    // Create demo categories
    const groceries = await prisma.category.create({
      data: { name: 'Groceries', bookId: demoBook.id, color: '#10b981' },
    });
    const utilities = await prisma.category.create({
      data: { name: 'Utilities', bookId: demoBook.id, color: '#3b82f6' },
    });
    const entertainment = await prisma.category.create({
      data: { name: 'Entertainment', bookId: demoBook.id, color: '#f59e0b' },
    });

    console.log('✅ Demo categories created');

    // Create demo expenses
    await prisma.expense.create({
      data: {
        amount: 45.50,
        date: new Date(),
        description: 'Weekly groceries',
        categoryId: groceries.id,
      },
    });
    await prisma.expense.create({
      data: {
        amount: 120.00,
        date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        description: 'Electricity bill',
        categoryId: utilities.id,
      },
    });
    await prisma.expense.create({
      data: {
        amount: 15.99,
        date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        description: 'Movie tickets',
        categoryId: entertainment.id,
      },
    });

    console.log('✅ Demo expenses created');
    console.log('\n🎉 Database initialized successfully!');
    console.log('\nYou can now:');
    console.log('1. Run: npm run dev');
    console.log('2. Visit: http://localhost:3000');
    console.log('3. Login with: demo@example.com / demo123');
    console.log('4. Explore the demo data');
  } else {
    console.log('\nℹ️  Database already contains users');
    console.log('   Run "npm run dev" to start the application');
  }
}

main()
  .catch((e) => {
    console.error('❌ Error:', e.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });