// Test the validation logic
function testValidation(query) {
  const trimmedQuery = query.trim().toLowerCase();
  const upperQuery = trimmedQuery.toUpperCase().replace(/\s+/g, ' ');
  const andIndex = upperQuery.indexOf(' AND ');
  const whereIndex = upperQuery.indexOf(' WHERE ');

  console.log('Query:', query);
  console.log('Trimmed:', trimmedQuery);
  console.log('Upper normalized:', upperQuery.substring(0, 200) + '...');
  console.log('AND index:', andIndex, 'WHERE index:', whereIndex);

  if (andIndex !== -1 && whereIndex === -1) {
    console.log('❌ REJECTED: AND found but no WHERE');
    return false;
  }

  if (andIndex !== -1 && andIndex < whereIndex) {
    console.log('❌ REJECTED: AND before WHERE');
    return false;
  }

  console.log('✅ ACCEPTED');
  return true;
}

// Test the problematic query
const testQuery = `UPDATE expenses e
JOIN categories c ON e.categoryId = c.id
JOIN books b ON c.bookId = b.id
SET e.isDisabled = true, e.updatedAt = NOW()
WHERE c.name = 'Travel'
  AND e.amount = 400.00
  AND b.userId = 'cmkz8m4g10000806t6niikbxx'`;

testValidation(testQuery);