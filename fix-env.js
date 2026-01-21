const fs = require('fs');

const content = `# Database (MySQL)
DATABASE_URL="mysql://root:@localhost:3306/manage_my_expenses"

# NextAuth
NEXTAUTH_SECRET="demo-secret-key-change-this-in-production"
NEXTAUTH_URL="http://localhost:3000"

# OpenRouter API Key (for free models)
OPENROUTER_API_KEY="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"
`;

fs.writeFileSync('.env', content, 'utf8');
console.log('✅ .env file created with UTF-8 encoding');
console.log('Content length:', content.length);