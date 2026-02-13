// Test MariaDB compatibility fix for AI SQL generation
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function testElectricityBillExpense() {
  console.log('🧪 Testing MariaDB Compatibility Fix for Electricity Bill Expense\n');

  try {
    // Dynamic import of node-fetch
    const fetch = (await import('node-fetch')).default;

    // Test the problematic query that was failing
    const testMessage = "electricity bill for the company for 150$";

    console.log(`📝 Testing message: "${testMessage}"`);

    // Call the AI API
    const response = await fetch('http://localhost:3000/api/ai', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': 'next-auth.session-token=test-session-user123' // Mock session
      },
      body: JSON.stringify({
        message: testMessage,
        conversationHistory: []
      })
    });

    if (!response.ok) {
      console.log(`❌ API Error: ${response.status} ${response.statusText}`);
      const errorText = await response.text();
      console.log('Error details:', errorText);
      return;
    }

    const data = await response.json();
    const aiResponse = data.response || '';

    console.log(`🤖 AI Response: ${aiResponse}`);

    // Check if the response contains SQL
    if (aiResponse.includes('```sql')) {
      console.log('✅ AI generated SQL query');

      // Extract SQL from response
      const sqlMatch = aiResponse.match(/```sql\s*(.*?)\s*```/s);
      if (sqlMatch) {
        const sql = sqlMatch[1];
        console.log('📄 Generated SQL:');
        console.log(sql);

        // Check for problematic patterns
        if (sql.includes('LIMIT') && sql.includes('SELECT') && sql.includes('(')) {
          console.log('❌ WARNING: SQL still contains LIMIT in subqueries');
        } else {
          console.log('✅ SQL appears MariaDB-compatible (no LIMIT in subqueries)');
        }

        // Check if it uses direct IDs
        if (sql.includes('categoryId = \'')) {
          console.log('✅ SQL uses direct categoryId from context');
        } else {
          console.log('⚠️  SQL may be using subqueries for ID resolution');
        }
      }
    } else {
      console.log('⚠️  AI did not generate SQL query');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testElectricityBillExpense();