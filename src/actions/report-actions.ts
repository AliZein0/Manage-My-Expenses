"use server"

import { getAuthSessionEdge } from "@/lib/auth"
import { getPrismaClient } from "@/lib/prisma"
import { getMonthKey } from "@/lib/utils"

export async function getMonthlySummary(bookId?: string) {
  const session = await getAuthSessionEdge()
  if (!session?.user?.id) {
    return { error: "Unauthorized - Please log in first" }
  }

  const prisma = getPrismaClient()

  // Verify user exists in database
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  })

  if (!user) {
    return { error: "User not found in database" }
  }

  try {
    const expenses = await prisma.expense.findMany({
      where: {
        ...(bookId ? { category: { bookId } } : {}),
        isDisabled: false,
        category: {
          isDisabled: false,
          book: {
            userId: session.user.id,
            isArchived: false,
          },
        },
      },
      include: {
        category: {
          include: {
            book: true,
          },
        },
      },
      orderBy: { date: "desc" },
    })

    // Group by month
    const monthlyData = expenses.reduce((acc, expense) => {
      const monthKey = getMonthKey(expense.date)
      if (!acc[monthKey]) {
        acc[monthKey] = {
          total: 0,
          count: 0,
          expenses: [],
        }
      }
      acc[monthKey].total += expense.amount
      acc[monthKey].count += 1
      acc[monthKey].expenses.push(expense)
      return acc
    }, {} as Record<string, { total: number; count: number; expenses: typeof expenses }>)

    // Convert to array and sort by date
    const summary = Object.entries(monthlyData)
      .map(([month, data]) => ({
        month,
        total: data.total,
        count: data.count,
        expenses: data.expenses,
      }))
      .sort((a, b) => b.month.localeCompare(a.month))

    return { summary }
  } catch (error) {
    console.error("Monthly summary error:", error)
    return { error: "Failed to fetch monthly summary" }
  }
}

export async function getCategoryBreakdown(bookId?: string) {
  const session = await getAuthSessionEdge()
  if (!session?.user?.id) {
    return { error: "Unauthorized - Please log in first" }
  }

  const prisma = getPrismaClient()

  // Verify user exists in database
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  })

  if (!user) {
    return { error: "User not found in database" }
  }

  try {
    const categories = await prisma.category.findMany({
      where: {
        ...(bookId ? { bookId } : {}),
        isDisabled: false,
        book: {
          userId: session.user.id,
          isArchived: false,
        },
      },
      include: {
        expenses: {
          where: {
            isDisabled: false,
          },
        },
        book: true,
      },
    })

    // Group by case-insensitive category name
    const categoryMap = new Map<string, any>()

    categories.forEach((category) => {
      const expenses = category.expenses
      const total = expenses.reduce((sum, exp) => sum + exp.amount, 0)
      const count = expenses.length

      if (total > 0) {
        const normalizedName = category.name.toLowerCase()

        if (!categoryMap.has(normalizedName)) {
          categoryMap.set(normalizedName, {
            category: category.name, // Use first occurrence's name
            categoryId: normalizedName, // Use normalized name as ID for grouping
            total: 0,
            count: 0,
            books: new Set(),
          })
        }

        const entry = categoryMap.get(normalizedName)
        entry.total += total
        entry.count += count
        entry.books.add(category.book.name)
      }
    })

    // Convert to array and format
    const breakdown = Array.from(categoryMap.values())
      .map((entry) => ({
        category: entry.category,
        categoryId: entry.categoryId,
        total: entry.total,
        count: entry.count,
        book: Array.from(entry.books).join(", "), // Show all books that have this category
      }))
      .sort((a, b) => b.total - a.total)

    return { breakdown }
  } catch (error) {
    console.error("Category breakdown error:", error)
    return { error: "Failed to fetch category breakdown" }
  }
}

export async function getBookSummary(bookId: string) {
  const session = await getAuthSessionEdge()
  if (!session?.user?.id) {
    return { error: "Unauthorized - Please log in first" }
  }

  const prisma = getPrismaClient()

  // Verify user exists in database
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  })

  if (!user) {
    return { error: "User not found in database" }
  }

  try {
    const book = await prisma.book.findUnique({
      where: { id: bookId, userId: session.user.id, isArchived: false },
      include: {
        categories: {
          where: {
            isDisabled: false,
          },
          include: {
            expenses: {
              where: {
                isDisabled: false,
              },
            },
          },
        },
      },
    })

    if (!book) {
      return { error: "Book not found" }
    }

    const totalExpenses = book.categories.reduce(
      (sum, cat) => sum + cat.expenses.reduce((catSum, exp) => catSum + exp.amount, 0),
      0
    )

    const totalCategories = book.categories.length
    const totalTransactions = book.categories.reduce(
      (sum, cat) => sum + cat.expenses.length,
      0
    )

    return {
      summary: {
        bookName: book.name,
        totalExpenses,
        totalCategories,
        totalTransactions,
        currency: book.currency,
      },
    }
  } catch (error) {
    console.error("Book summary error:", error)
    return { error: "Failed to fetch book summary" }
  }
}

export async function getDetailedReport(filters: {
  bookId: string
  startDate?: string
  endDate?: string
  categories?: string[]
}) {
  const session = await getAuthSessionEdge()
  if (!session?.user?.id) {
    return { error: "Unauthorized - Please log in first" }
  }

  const prisma = getPrismaClient()

  // Verify user exists in database
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  })

  if (!user) {
    return { error: "User not found in database" }
  }

  try {
    // Build where clause based on filters
    const whereClause: any = {
      isDisabled: false,
      category: {
        isDisabled: false,
        book: {
          userId: session.user.id,
          isArchived: false,
        },
      },
    }

    // Apply book filter (required)
    whereClause.category.bookId = filters.bookId

    // Apply date range filter
    if (filters.startDate || filters.endDate) {
      whereClause.date = {}
      if (filters.startDate) {
        whereClause.date.gte = new Date(filters.startDate)
      }
      if (filters.endDate) {
        whereClause.date.lte = new Date(filters.endDate)
      }
    }

    // Apply categories filter (multiple categories)
    if (filters.categories && filters.categories.length > 0) {
      whereClause.category.id = {
        in: filters.categories,
      }
    }

    // Fetch expenses based on filter type
    let expenses = await prisma.expense.findMany({
      where: whereClause,
      include: {
        category: {
          include: {
            book: true,
          },
        },
      },
      orderBy: { date: "desc" },
    })

    // Calculate totals
    const totalAmount = expenses.reduce((sum, exp) => sum + exp.amount, 0)
    const currency = expenses.length > 0 ? expenses[0].category.book.currency : "USD"

    // Group by category for breakdown
    const categoryMap = new Map<string, any>()

    expenses.forEach((exp) => {
      const categoryName = exp.category.name
      if (!categoryMap.has(categoryName)) {
        categoryMap.set(categoryName, {
          name: exp.category.name,
          total: 0,
          count: 0,
          expenses: [],
        })
      }
      const cat = categoryMap.get(categoryName)
      cat.total += exp.amount
      cat.count += 1
      cat.expenses.push(exp)
    })

    return {
      expenses,
      totalAmount,
      currency,
      categories: Array.from(categoryMap.values()).sort((a, b) => b.total - a.total),
    }
  } catch (error) {
    console.error("Detailed report error:", error)
    return { error: "Failed to fetch detailed report" }
  }
}