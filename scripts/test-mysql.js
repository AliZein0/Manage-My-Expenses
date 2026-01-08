#!/usr/bin/env node

const mysql = require('mysql2');
require('dotenv').config();

console.log('🔍 Testing MySQL connection...\n');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ DATABASE_URL not found in .env file');
  process.exit(1);
}

// Parse connection string
const match = connectionString.match(/mysql:\/\/([^:]+)(:([^@]+))?@([^:]+):(\d+)\/(.+)/);

if (!match) {
  console.error('❌ Invalid DATABASE_URL format');
  console.error('Expected format: mysql://user:password@host:port/database');
  process.exit(1);
}

const [, user, , password, host, port, database] = match;

const connection = mysql.createConnection({
  host: host,
  user: user,
  password: password || '',
  port: parseInt(port),
  database: database
});

connection.connect((err) => {
  if (err) {
    console.error('❌ Connection failed:', err.message);
    console.error('\nPlease check:');
    console.error('1. MySQL server is running');
    console.error('2. Database exists (run: CREATE DATABASE manage_my_expenses;)');
    console.error('3. Credentials in .env file are correct');
    process.exit(1);
  }

  console.log('✅ MySQL connection successful!');
  console.log(`   Server: ${host}:${port}`);
  console.log(`   Database: ${database}`);
  console.log(`   User: ${user}`);
  
  connection.end();
});