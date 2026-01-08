const mysql = require('mysql2');
require('dotenv').config();

console.log('🔧 Creating database tables...\n');

// Try different connection scenarios
const connectionStrings = [
  'mysql://root@localhost:3306/', // No password
  'mysql://root:password@localhost:3306/', // Common default
  'mysql://root:@localhost:3306/', // Empty password
];

async function tryConnection(connectionString) {
  return new Promise((resolve, reject) => {
    const connection = mysql.createConnection(connectionString);
    
    connection.connect((err) => {
      if (err) {
        reject(err);
      } else {
        resolve(connection);
      }
    });
  });
}

async function createDatabase() {
  for (const connStr of connectionStrings) {
    try {
      console.log(`Trying: ${connStr}`);
      const connection = await tryConnection(connStr);
      
      // Create database
      await new Promise((resolve, reject) => {
        connection.query('CREATE DATABASE IF NOT EXISTS manage_my_expenses', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      console.log('✅ Database created successfully!');
      
      // Use the database
      await new Promise((resolve, reject) => {
        connection.query('USE manage_my_expenses', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      connection.end();
      
      // Update .env file
      const fs = require('fs');
      const envContent = `# Database (MySQL)
DATABASE_URL="${connStr}manage_my_expenses"

# NextAuth
NEXTAUTH_SECRET="demo-secret-key-change-this-in-production"
NEXTAUTH_URL="http://localhost:3000"
`;
      
      fs.writeFileSync('.env', envContent);
      console.log('✅ .env file updated!');
      
      return;
    } catch (error) {
      console.log(`❌ Failed: ${error.message}`);
    }
  }
  
  console.log('\n❌ Could not connect to MySQL with any credentials');
  console.log('Please check your MySQL setup and try again.');
}

createDatabase();