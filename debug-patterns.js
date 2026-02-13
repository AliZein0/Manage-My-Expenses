// Test the actual patterns from the code
const message = 'I spent $25 on lunch today';
console.log('Testing message:', message);

const expensePatterns = [
  /\b(i|we)\s+(spent|bought|paid|purchased|got)\s+.*?\$\s*[\d,]+/i,
  /\b(refueled?|refuelled?)\s+(the\s+)?car\s+with\s+.*?\$\s*[\d,]+/i,
  /\b[\d,]+\s*(dollars?|euros?|usd|eur|£|\$|€)\s+(for|on|at)\s+\w+/i,
  /\b(cost|costs|was|were)\s+.*?\$\s*[\d,]+/i,
  /\b(added|lunch|dinner|coffee|gas|fuel|grocery|groceries|movie|ticket|bill|parking|supplies)\b.*?\$\s*[\d,]+/i,
  /\b(paid|spent|bought)\s+.*?\$\s*[\d,]+\s+(for|on|at)/i
];

console.log('Testing patterns:');
expensePatterns.forEach((pattern, i) => {
  const match = pattern.test(message.toLowerCase());
  console.log(`Pattern ${i+1}: ${match ? 'MATCH' : 'no match'}`);
  if (match) {
    console.log('  Full match:', message.toLowerCase().match(pattern));
  }
});

const hasSpendingVerb = /\b(spent|bought|paid|purchased|got|cost|costs|refueled?|refuelled?)\b/i.test(message.toLowerCase());
const hasAmount = /\$[\d,]+(\.\d{2})?/i.test(message.toLowerCase());
const hasContext = /\b(car|gas|fuel|food|groceries|coffee|restaurant|lunch|dinner|movie|shopping|bill|electricity|utilities|parking|supplies|supermarket|tickets|phone|office)\b/i.test(message.toLowerCase());

console.log('Components:');
console.log('Has spending verb:', hasSpendingVerb);
console.log('Has amount:', hasAmount);
console.log('Has context:', hasContext);

const simpleCheck = /\b(spent|bought|paid|purchased|got|cost|costs)\b/i.test(message.toLowerCase()) && /\$[\d,]+/i.test(message.toLowerCase());
console.log('Simple check:', simpleCheck);