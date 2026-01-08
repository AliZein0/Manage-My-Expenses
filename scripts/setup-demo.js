#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function setup() {
  try {
    await prisma.$connect();
    console.log('Connected to database');
    
    const userCount = await prisma.user.count();
    console.log('Current users:', userCount);
    
    if (userCount === 0) {
      const hashedPassword = await bcrypt.hash('demo123', 12);
      const user = await prisma.user.create({
        data: {
          email: 'demo@example.com',
          name: 'Demo User',
          password: hashedPassword,
        }
      });
      console.log('✅ Demo user created:', user.email);
      
      const book = await prisma.book.create({
        data: {
          name: 'Demo Book',
          description: 'Sample book for testing',
          currency: 'USD',
          userId: user.id,
        }
      });
      console.log('✅ Demo book created:', book.name);
      
      const category = await prisma.category.create({
        data: {
          name: 'Groceries',
          bookId: book.id,
          color: '#10b981',
        }
      });
      console.log('✅ Demo category created:', category.name);
      
      const expense = await prisma.expense.create({
        data: {
          amount: 45.50,
          date: new Date(),
          description: 'Weekly groceries',
          categoryId: category.id,
        }
      });
      console.log('✅ Demo expense created: $', expense.amount);
      
      console.log('\n🎉 Database initialized with demo data!');
      console.log('\nLogin with:');
      console.log('Email: demo@example.com');
      console.log('Password: demo123');
    } else {
      console.log('Database already has users, skipping initialization');
    }
    
    await prisma.$disconnect();
  } catch (error) {
    console.error('Error:', error.message);
    await prisma.$disconnect();
  }
}

setup();