# MySQL Setup Guide for Manage My Expenses

## Step 1: Create the Database

### Option A: Using MySQL Workbench
1. Open MySQL Workbench
2. Connect to your MySQL server
3. Open a new query tab
4. Run:
```sql
CREATE DATABASE manage_my_expenses;
```

### Option B: Using MySQL Command Line
```bash
mysql -u root -p
```
Then enter your password and run:
```sql
CREATE DATABASE manage_my_expenses;
EXIT;
```

## Step 2: Update Environment Variables

Edit your `.env` file:

```env
# If you have a password
DATABASE_URL="mysql://root:yourpassword@localhost:3306/manage_my_expenses"

# If you don't have a password
DATABASE_URL="mysql://root@localhost:3306/manage_my_expenses"
```

**Replace `yourpassword` with your actual MySQL root password.**

## Step 3: Push Database Schema

Run these commands in your terminal:

```bash
# Generate Prisma client
npx prisma generate

# Push schema to database
npx prisma db push
```

## Step 4: Initialize with Demo Data (Optional)

```bash
npm run db:init
```

This will create a demo user:
- Email: `demo@example.com`
- Password: `demo123`

## Step 5: Start Development Server

```bash
npm run dev
```

Visit: http://localhost:3000

## Troubleshooting

### "Access denied" error
- Make sure MySQL server is running
- Check your password in `.env`
- Try without password: `mysql://root@localhost:3306/manage_my_expenses`

### "Unknown database" error
- Make sure you ran `CREATE DATABASE manage_my_expenses;`
- Check the database exists in MySQL Workbench

### Connection refused
- Verify MySQL is running on port 3306
- Check Windows Services for "MySQL" service

## MySQL Installation Links

- **MySQL Installer**: https://dev.mysql.com/downloads/installer/
- **MySQL Workbench**: https://dev.mysql.com/downloads/workbench/
- **XAMPP**: https://www.apachefriends.org/download.html (includes MySQL + phpMyAdmin)

## Next Steps

Once MySQL is set up, you can:
1. Create Books (House, Company, Personal)
2. Add Categories (Groceries, Utilities, etc.)
3. Record Expenses
4. View Reports and Analytics

Your project is now ready to use MySQL! 🚀