const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function createCategoryInWorkBook() {
  try {
    // Get the user ID (using ali@gmail.com)
    const users = await prisma.user.findMany({
      where: { email: 'ali@gmail.com' }
    });
    if (users.length === 0) {
      console.log('User ali@gmail.com not found');
      return;
    }
    
    const userId = users[0].id;
    console.log('User ID:', userId);
    
    // Check if Work book exists
    const workBook = await prisma.book.findFirst({
      where: { 
        name: 'Work',
        userId: userId
      }
    });
    
    if (!workBook) {
      console.log('Work book not found. Creating it first...');
      
      // Create the Work book
      const newBook = await prisma.book.create({
        data: {
          name: 'Work',
          description: '',
          currency: 'USD',
          isArchived: false,
          userId: userId
        }
      });
      
      console.log('Created Work book:', newBook);
      workBook = newBook;
    } else {
      console.log('Found Work book:', workBook);
    }
    
    // Check if category W2 already exists in Work book
    const existingCategory = await prisma.category.findFirst({
      where: {
        name: 'W2',
        bookId: workBook.id
      }
    });
    
    if (existingCategory) {
      console.log('Category W2 already exists:', existingCategory);
      return;
    }
    
    // Generate SQL query for creating category
    const sqlQuery = `INSERT INTO categories (name, bookId) VALUES ('W2', '${workBook.id}')`;
    
    console.log('\n=== SQL QUERY FOR CREATING CATEGORY ===');
    console.log(sqlQuery);
    console.log('======================================\n');
    
    // Execute the query
    const result = await prisma.$executeRawUnsafe(sqlQuery);
    
    console.log('Category created successfully!');
    console.log('Rows affected:', result);
    
    // Verify the category was created
    const createdCategory = await prisma.category.findFirst({
      where: {
        name: 'W2',
        bookId: workBook.id
      }
    });
    
    console.log('\nCreated category details:', createdCategory);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createCategoryInWorkBook();
