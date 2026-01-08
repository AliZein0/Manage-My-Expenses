# Quick Start Guide 🚀

Get your expense tracker running in 5 minutes!

## ⚡ One-Time Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Setup Environment
```bash
# Create .env file
cp .env.example .env

# Edit .env with your database info
# (Use a text editor or VS Code)
```

**Example .env for local MySQL:**
```env
DATABASE_URL="mysql://root:password@localhost:3306/manage_my_expenses"
NEXTAUTH_SECRET="your-secret-key-here"
NEXTAUTH_URL="http://localhost:3000"
```

### 3. Setup Database
```bash
# Create database in MySQL
# Then run:
npx prisma db push
```

### 4. Initialize with Demo Data (Optional)
```bash
npm run db:init
```

This creates a demo user: `demo@example.com` / `demo123`

## 🎯 Start Development

```bash
npm run dev
```

Visit: **http://localhost:3000**

## 📱 First Time User Flow

1. **Register** or **Login**
   - Use demo credentials if you ran `db:init`
   - Or create your own account

2. **Create a Book**
   - Click "Books" → "Create Book"
   - Try: "House", "Company", "Personal"

3. **Add Categories**
   - Go to "Categories"
   - Add: "Groceries", "Utilities", "Entertainment"

4. **Record Expenses**
   - Go to "Expenses"
   - Add transactions with amounts and dates

5. **View Reports**
   - Check your dashboard
   - See totals and summaries

## 🔧 Common Commands

```bash
# Development
npm run dev

# Database updates
npm run db:push    # After schema changes
npm run db:studio  # Visual database explorer

# Check setup
npm run setup:check
```

## 🎨 Customization

### Change Colors
Edit `tailwind.config.ts`:
```typescript
theme: {
  extend: {
    colors: {
      primary: {
        500: '#your-color',
      },
    },
  },
}
```

### Add New Features
1. Create server action in `src/actions/`
2. Create page in `src/app/`
3. Add UI components in `src/components/ui/`

## 🐛 Troubleshooting

**"Database connection failed"**
- Check MySQL is running
- Verify DATABASE_URL format
- Ensure database exists

**"Module not found"**
- Run `npm install`
- Check `node_modules/` exists

**"Port already in use"**
- Kill process: `npx kill-port 3000`
- Or change port: `npm run dev -- -p 3001`

## 📚 Next Steps

- Read `README.md` for project overview
- Check `SETUP.md` for detailed setup
- Review `PROJECT_SUMMARY.md` for all features

## 🎉 You're Ready!

Your expense tracker is now running. Start tracking your expenses today!

---

**Need help?** Check the documentation files in the project root.