# Setup Instructions for Manage My Expenses

## Prerequisites

1. **Node.js 18+** - Download from [nodejs.org](https://nodejs.org/)
2. **MySQL Database** - Local MySQL server or cloud service (PlanetScale, Railway, etc.)
3. **npm** - Comes with Node.js

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Setup

Create a `.env` file in the root directory:

```env
# Database Connection
DATABASE_URL="mysql://username:password@localhost:3306/manage_my_expenses"

# NextAuth Configuration
NEXTAUTH_SECRET="your-super-secret-key-change-this-in-production"
NEXTAUTH_URL="http://localhost:3000"

# Optional: For email authentication
# EMAIL_SERVER="smtp://username:password@smtp.example.com:587"
# EMAIL_FROM="noreply@example.com"
```

**Generate a secure NEXTAUTH_SECRET:**
```bash
openssl rand -base64 32
```

### 3. Database Setup

1. **Create MySQL Database:**
```sql
CREATE DATABASE manage_my_expenses;
```

2. **Push Schema to Database:**
```bash
npx prisma db push
```

3. **Optional - View Database:**
```bash
npx prisma studio
```

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
Manage My Expenses/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/               # API routes (auth, health)
│   │   ├── login/             # Login page
│   │   ├── register/          # Registration page
│   │   ├── dashboard/         # Main dashboard
│   │   ├── books/             # Book management
│   │   ├── categories/        # Category management
│   │   ├── expenses/          # Expense management
│   │   ├── reports/           # Analytics
│   │   └── layout.tsx         # Root layout
│   ├── components/
│   │   ├── ui/                # Reusable UI components
│   │   ├── providers/         # React providers
│   │   └── layout/            # Layout components
│   ├── lib/                   # Utilities & configs
│   │   ├── auth.ts            # NextAuth config
│   │   ├── prisma.ts          # Prisma client
│   │   └── utils.ts           # Helper functions
│   ├── actions/               # Server Actions
│   │   ├── book-actions.ts
│   │   ├── category-actions.ts
│   │   ├── expense-actions.ts
│   │   └── report-actions.ts
│   └── types/                 # TypeScript types
├── prisma/
│   └── schema.prisma          # Database schema
├── .env.example
├── package.json
└── README.md
```

## Available Commands

```bash
# Development
npm run dev

# Production
npm run build
npm run start

# Linting
npm run lint

# Database
npm run db:push    # Push schema changes
npm run db:studio  # Open Prisma Studio
```

## Features Implemented

### ✅ Phase 1 - Core MVP
- User authentication (register/login)
- Book CRUD operations
- Category CRUD operations
- Expense CRUD operations
- Basic dashboard
- Protected routes

### 🚧 Phase 2 - Reporting (Next)
- Monthly expense summaries
- Category breakdown charts
- Date range filtering
- Export to CSV

### 📋 Phase 3 - Enhancements (Future)
- Recurring expenses
- Tags system
- Receipt uploads
- Budget limits
- Multi-currency support

## Data Model

### User
- Manages multiple Books
- Owns all data

### Book
- Logical container (e.g., "House", "Company")
- Has currency
- Can be archived

### Category
- Belongs to one Book
- Can have icon/color
- Cannot be deleted if expenses exist

### Expense
- Tied to Category
- Amount, date, description
- Optional payment method

## Security Features

- ✅ Secure password hashing (bcrypt)
- ✅ Session-based authentication
- ✅ Protected API routes
- ✅ User data isolation
- ✅ Input validation (Zod)
- ✅ CSRF protection (NextAuth)

## Next Steps

1. **Test the application:**
   - Register a new user
   - Create a Book
   - Add Categories
   - Record Expenses
   - View Reports

2. **Customize styling:**
   - Modify `tailwind.config.ts`
   - Update color schemes
   - Add custom themes

3. **Add features:**
   - Implement charts with Recharts
   - Add date range filters
   - Create export functionality

## Troubleshooting

### Database Connection Issues
- Verify MySQL is running
- Check DATABASE_URL format
- Ensure database exists

### Authentication Issues
- Verify NEXTAUTH_SECRET is set
- Check NEXTAUTH_URL matches your domain
- Clear browser cookies/cache

### Prisma Issues
- Run `npx prisma generate`
- Delete `node_modules` and reinstall
- Check schema syntax

## Production Deployment

### Vercel (Recommended)
1. Push code to GitHub
2. Connect repository to Vercel
3. Add environment variables
4. Deploy

### Other Platforms
- Ensure database is accessible
- Set proper environment variables
- Configure NEXTAUTH_URL for production

## Support

For issues or questions:
1. Check the README.md
2. Review error messages in console
3. Verify environment variables
4. Check database connection

---

**Happy expense tracking! 📊💰**