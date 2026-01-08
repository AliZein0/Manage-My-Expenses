# Manage My Expenses

A modern web application for tracking and analyzing expenses with a flexible Books → Categories → Expenses hierarchy.

## Technology Stack

- **Frontend**: Next.js 14 (App Router)
- **Backend**: Next.js API Routes & Server Actions
- **Database**: MySQL with Prisma ORM
- **Authentication**: NextAuth.js (Auth.js)
- **Styling**: Tailwind CSS
- **Charts**: Recharts
- **Type Safety**: TypeScript

## Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   ├── login/             # Login page
│   ├── register/          # Registration page
│   ├── dashboard/         # Main dashboard
│   ├── books/             # Book management
│   ├── categories/        # Category management
│   ├── expenses/          # Expense management
│   ├── reports/           # Analytics & reports
│   └── layout.tsx         # Root layout
├── components/
│   ├── ui/                # Reusable UI components
│   └── providers/         # React providers
├── lib/                   # Utility functions & configurations
├── actions/               # Server actions for CRUD operations
├── types/                 # TypeScript type definitions
└── prisma/                # Database schema
```

## Setup Instructions

### Prerequisites

- Node.js 18+ installed
- MySQL database (local or cloud)
- npm or yarn package manager

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Variables

Create a `.env` file in the root directory:

```env
# Database
DATABASE_URL="mysql://username:password@localhost:3306/manage_my_expenses"

# NextAuth
NEXTAUTH_SECRET="your-secret-key-here"
NEXTAUTH_URL="http://localhost:3000"
```

You can copy the example file:
```bash
cp .env.example .env
```

### 3. Database Setup

1. Start your MySQL server
2. Create a database:
```sql
CREATE DATABASE manage_my_expenses;
```

3. Run Prisma migrations:
```bash
npx prisma db push
```

4. (Optional) Open Prisma Studio to view your data:
```bash
npx prisma studio
```

### 4. Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

## Features

### Phase 1 - Core MVP ✅
- User authentication (register/login)
- Book CRUD operations
- Category CRUD operations
- Expense CRUD operations
- Basic dashboard

### Phase 2 - Reporting (Future)
- Monthly expense summaries
- Category breakdown charts
- Date range filtering
- Export functionality

### Phase 3 - Enhancements (Future)
- Recurring expenses
- Tags system
- Receipt uploads
- Budget limits per category
- Multi-currency support

## Available Scripts

```bash
# Development
npm run dev

# Build for production
npm run build

# Start production server
npm run start

# Lint code
npm run lint

# Database commands
npm run db:push    # Push schema to database
npm run db:studio  # Open Prisma Studio
```

## Data Model

### User
- Manages multiple Books
- Owns all data

### Book
- Logical container for expenses
- Has its own currency
- Can be archived (soft delete)

### Category
- Belongs to exactly one Book
- Can have icon and color
- Cannot be hard-deleted if expenses exist

### Expense
- Financial record tied to a Category
- Contains amount, date, description
- Optional payment method

## Business Rules

1. Users can only access their own data
2. Expense amounts must be positive
3. Categories with expenses cannot be hard-deleted
4. Expenses must belong to categories (not directly to books)
5. Books can be archived but not deleted

## Development Guidelines

- Use TypeScript for type safety
- Follow Next.js App Router conventions
- Use Server Actions for data mutations
- Implement proper error handling
- Keep components reusable and modular
- Use Tailwind CSS for styling
- Follow the Books → Categories → Expenses hierarchy

## Future Enhancements

- Mobile-first optimizations
- PWA support for offline usage
- Email notifications
- CSV/Excel export
- Integration with banking APIs
- AI-powered expense categorization
- Budget planning and alerts

## License

MIT License - feel free to use this project for learning or building your own expense tracker.