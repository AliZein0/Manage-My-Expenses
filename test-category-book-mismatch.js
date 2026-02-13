// Test the category-book mismatch handling
const testMessage = "Car refuels on company way 50$ today morning, and I paid water bill for 50$ last month. We have done a dinner in the company also yesterday and its cost 100$.";

console.log('Testing category-book mismatch handling:');
console.log('Message:', testMessage);
console.log('');
console.log('Expected AI behavior:');
console.log('1. Parse 3 expenses: car refuel ($50), water bill ($50), company dinner ($100)');
console.log('2. Determine contexts: all "company" related');
console.log('3. Check if Company book has Transportation, Bills & Utilities, and Food & Dining categories');
console.log('4. If Food & Dining missing from Company book, ask for clarification instead of putting dinner in House book');
console.log('5. Do NOT generate SQL for any expenses until category availability is confirmed');