const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testSpecificScenario(userId, input) {
  console.log(`Testing: "${input}"`);

  try {
    const fetch = (await import('node-fetch')).default;

      const response = await fetch('http://localhost:3003/api/ai', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: input,
        conversationHistory: [],
        testUserId: userId
      })
    });

    if (!response.ok) {
      console.log(`❌ API Error: ${response.status} ${response.statusText}`);
      return;
    }

    const data = await response.json();
    const aiResponse = data.response || '';

    console.log(`🤖 AI Response: ${aiResponse.substring(0, 300)}${aiResponse.length > 300 ? '...' : ''}`);

  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }
}

async function main() {
  const userId = 'cmkz8m4g10000806t6niikbxx';

  // Test problematic scenarios
  await testSpecificScenario(userId, 'Spent 50 on maintenance for the office');
  await testSpecificScenario(userId, 'Spent 75 on utilities');
  await testSpecificScenario(userId, 'Paid 25 for food');

  await prisma.$disconnect();
}

main();