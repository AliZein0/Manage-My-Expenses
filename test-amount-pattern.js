const message = 'I spent $25 on lunch today';
const amountPattern = /(?:\$|£|€)\s*\d[\d,]*(?:\.\d{2})?|\d[\d,]*(?:\.\d{2})?\s*(?:dollars?|euros?|usd|eur|£|\$|€)/gi;
const matches = [...message.matchAll(amountPattern)];
console.log('Message:', message);
console.log('Matches found:', matches.length);
matches.forEach((match, i) => {
  console.log(`Match ${i+1}: '${match[0]}' at position ${match.index}`);
});