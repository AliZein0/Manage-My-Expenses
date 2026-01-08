#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔍 Checking Manage My Expenses setup...\n');

const checks = [
  {
    name: 'package.json',
    file: 'package.json',
    required: true
  },
  {
    name: 'Next.js config',
    file: 'next.config.js',
    required: true
  },
  {
    name: 'TypeScript config',
    file: 'tsconfig.json',
    required: true
  },
  {
    name: 'Tailwind config',
    file: 'tailwind.config.ts',
    required: true
  },
  {
    name: 'Prisma schema',
    file: 'prisma/schema.prisma',
    required: true
  },
  {
    name: 'Environment example',
    file: '.env.example',
    required: true
  },
  {
    name: 'Auth library',
    file: 'src/lib/auth.ts',
    required: true
  },
  {
    name: 'Prisma client',
    file: 'src/lib/prisma.ts',
    required: true
  },
  {
    name: 'Main layout',
    file: 'src/app/layout.tsx',
    required: true
  },
  {
    name: 'Home page',
    file: 'src/app/page.tsx',
    required: true
  },
  {
    name: 'Dashboard page',
    file: 'src/app/dashboard/page.tsx',
    required: true
  }
];

let allPassed = true;

checks.forEach(check => {
  const filePath = path.join(process.cwd(), check.file);
  const exists = fs.existsSync(filePath);
  
  if (check.required && !exists) {
    console.log(`❌ ${check.name}: Missing (${check.file})`);
    allPassed = false;
  } else if (exists) {
    console.log(`✅ ${check.name}: Found`);
  } else {
    console.log(`⚠️  ${check.name}: Optional but missing`);
  }
});

console.log('\n📋 Summary:');
if (allPassed) {
  console.log('✅ All required files are present!');
  console.log('\nNext steps:');
  console.log('1. Create .env file from .env.example');
  console.log('2. Configure your database connection');
  console.log('3. Run: npm install');
  console.log('4. Run: npx prisma db push');
  console.log('5. Run: npm run dev');
} else {
  console.log('❌ Some required files are missing. Please check the errors above.');
  process.exit(1);
}