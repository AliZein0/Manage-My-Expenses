"use server"

import { getAuthSessionEdge } from "@/lib/auth"
import { getPrismaClient } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { z } from "zod"

const expenseSchema = z.object({
  amount: z.string().min(1, "Amount is required").transform((val) => parseFloat(val)),
  date: z.string().min(1, "Date is required").transform((val) => new Date(val)),
  description: z.string().optional(),
  paymentMethod: z.string().optional(),
  categoryId: z.string().min(1, "Category is required"),
})

export async function createExpense(formData: FormData) {
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

  const validatedFields = expenseSchema.safeParse({
    amount: formData.get("amount"),
    date: formData.get("date"),
    description: formData.get("description"),
    paymentMethod: formData.get("paymentMethod"),
    categoryId: formData.get("categoryId"),
  })

  if (!validatedFields.success) {
    return { error: "Invalid fields", issues: validatedFields.error.issues }
  }

  // Verify user owns the category
  const category = await prisma.category.findUnique({
    where: { id: validatedFields.data.categoryId },
    include: { book: true },
  })

  if (!category) {
    return { error: "Category not found" }
  }

  // Default categories don't have books, so they can't be used for expenses
  if (!category.book) {
    return { error: "Invalid category selected" }
  }

  if (category.book.userId !== session.user.id) {
    return { error: "Category not found or access denied" }
  }

  if (category.book.isArchived) {
    return { error: "Cannot create expenses for archived books" }
  }

  // Validate amount is positive
  if (validatedFields.data.amount <= 0) {
    return { error: "Amount must be positive" }
  }

  // Validate date is not in the future
  const today = new Date()
  const expenseDate = new Date(validatedFields.data.date)
  
  // Compare only the date part (year, month, day) to avoid timezone issues
  const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const expenseDateOnly = new Date(expenseDate.getFullYear(), expenseDate.getMonth(), expenseDate.getDate())
  
  if (expenseDateOnly > todayDateOnly) {
    return { error: "Expense date cannot be in the future" }
  }

  try {
    await prisma.expense.create({
      data: {
        amount: validatedFields.data.amount,
        date: validatedFields.data.date,
        description: validatedFields.data.description,
        paymentMethod: validatedFields.data.paymentMethod,
        categoryId: validatedFields.data.categoryId,
      },
    })

    revalidatePath("/expenses")
    revalidatePath(`/books/${category.bookId}`)
    revalidatePath(`/categories`)
    return { success: true }
  } catch (error) {
    console.error("Expense creation error:", error)
    return { error: "Failed to create expense" }
  }
}

export async function getExpenses(categoryId?: string, bookId?: string) {
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
        ...(categoryId ? { categoryId } : {}),
        ...(bookId
          ? {
              category: {
                bookId: bookId,
              },
            }
          : {}),
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

    return { expenses }
  } catch (error) {
    console.error("Expenses fetch error:", error)
    return { error: "Failed to fetch expenses" }
  }
}

export async function deleteExpense(id: string) {
  const session = await getAuthSessionEdge()
  if (!session?.user?.id) {
    return { error: "Unauthorized" }
  }
  const prisma = getPrismaClient()

  const expense = await prisma.expense.findUnique({
    where: { id },
    include: {
      category: {
        include: {
          book: true,
        },
      },
    },
  })

  if (!expense) {
    return { error: "Expense not found" }
  }

  // Check if category has a book (should always be true for user expenses)
  if (!expense.category.book) {
    return { error: "Invalid expense - category has no associated book" }
  }

  if (expense.category.book.userId !== session.user.id) {
    return { error: "Access denied" }
  }

  if (expense.category.book.isArchived) {
    return { error: "Cannot delete expenses from archived books" }
  }

  try {
    await prisma.expense.delete({
      where: { id },
    })

    revalidatePath("/expenses")
    revalidatePath(`/books/${expense.category.bookId}`)
    return { success: true }
  } catch (error) {
    return { error: "Failed to delete expense" }
  }
}

export async function getExpenseById(id: string) {
  const session = await getAuthSessionEdge()
  if (!session?.user?.id) {
    return { error: "Unauthorized" }
  }
  const prisma = getPrismaClient()

  try {
    const expense = await prisma.expense.findUnique({
      where: { id },
      include: {
        category: {
          include: {
            book: true,
          },
        },
      },
    })

    if (!expense || !expense.category.book || expense.category.book.userId !== session.user.id) {
      return { error: "Expense not found" }
    }

    if (expense.category.book.isArchived) {
      return { error: "Cannot access expenses from archived books" }
    }

    return { expense }
  } catch (error) {
    return { error: "Failed to fetch expense" }
  }
}

export async function updateExpense(id: string, formData: FormData) {
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

  // Get existing expense to verify ownership
  const existingExpense = await prisma.expense.findUnique({
    where: { id },
    include: {
      category: {
        include: {
          book: true,
        },
      },
    },
  })

  if (!existingExpense) {
    return { error: "Expense not found" }
  }

  // Check if category has a book (should always be true for user expenses)
  if (!existingExpense.category.book) {
    return { error: "Invalid expense - category has no associated book" }
  }

  if (existingExpense.category.book.userId !== session.user.id) {
    return { error: "Access denied" }
  }

  if (existingExpense.category.book.isArchived) {
    return { error: "Cannot edit expenses from archived books" }
  }

  if (existingExpense.isDisabled) {
    return { error: "Cannot edit disabled expenses. Restore it first." }
  }

  const validatedFields = expenseSchema.safeParse({
    amount: formData.get("amount"),
    date: formData.get("date"),
    description: formData.get("description"),
    paymentMethod: formData.get("paymentMethod"),
    categoryId: formData.get("categoryId"),
  })

  if (!validatedFields.success) {
    return { error: "Invalid fields", issues: validatedFields.error.issues }
  }

  // Verify user owns the new category if changing
  if (validatedFields.data.categoryId !== existingExpense.categoryId) {
    const newCategory = await prisma.category.findUnique({
      where: { id: validatedFields.data.categoryId },
      include: { book: true },
    })

    if (!newCategory || !newCategory.book || newCategory.book.userId !== session.user.id) {
      return { error: "Category not found or access denied" }
    }

    if (newCategory.book.isArchived) {
      return { error: "Cannot move expenses to archived books" }
    }
  }

  // Validate amount is positive
  if (validatedFields.data.amount <= 0) {
    return { error: "Amount must be positive" }
  }

  // Validate date is not in the future
  const today = new Date()
  const expenseDate = new Date(validatedFields.data.date)
  
  // Compare only the date part (year, month, day) to avoid timezone issues
  const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const expenseDateOnly = new Date(expenseDate.getFullYear(), expenseDate.getMonth(), expenseDate.getDate())
  
  if (expenseDateOnly > todayDateOnly) {
    return { error: "Expense date cannot be in the future" }
  }

  try {
    await prisma.expense.update({
      where: { id },
      data: {
        amount: validatedFields.data.amount,
        date: validatedFields.data.date,
        description: validatedFields.data.description,
        paymentMethod: validatedFields.data.paymentMethod,
        categoryId: validatedFields.data.categoryId,
      },
    })

    revalidatePath("/expenses")
    revalidatePath(`/books/${existingExpense.category.bookId}`)
    revalidatePath(`/categories`)
    revalidatePath(`/expenses/edit/${id}`)
    return { success: true }
  } catch (error) {
    console.error("Expense update error:", error)
    return { error: "Failed to update expense" }
  }
}

export async function disableExpense(id: string) {
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

  const expense = await prisma.expense.findUnique({
    where: { id },
    include: {
      category: {
        include: {
          book: true,
        },
      },
    },
  })

  if (!expense) {
    return { error: "Expense not found" }
  }

  // Check if category has a book (should always be true for user expenses)
  if (!expense.category.book) {
    return { error: "Invalid expense - category has no associated book" }
  }

  if (expense.category.book.userId !== session.user.id) {
    return { error: "Access denied" }
  }

  if (expense.category.book.isArchived) {
    return { error: "Cannot disable expenses from archived books" }
  }

  try {
    await prisma.expense.update({
      where: { id },
      data: { isDisabled: true },
    })

    revalidatePath("/expenses")
    revalidatePath(`/books/${expense.category.bookId}`)
    return { success: true }
  } catch (error) {
    console.error("Expense disable error:", error)
    return { error: "Failed to disable expense" }
  }
}

export async function restoreExpense(id: string) {
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

  const expense = await prisma.expense.findUnique({
    where: { id },
    include: {
      category: {
        include: {
          book: true,
        },
      },
    },
  })

  if (!expense) {
    return { error: "Expense not found" }
  }

  // Check if category has a book (should always be true for user expenses)
  if (!expense.category.book) {
    return { error: "Invalid expense - category has no associated book" }
  }

  if (expense.category.book.userId !== session.user.id) {
    return { error: "Access denied" }
  }

  if (expense.category.book.isArchived) {
    return { error: "Cannot restore expenses from archived books" }
  }

  try {
    await prisma.expense.update({
      where: { id },
      data: { isDisabled: false },
    })

    revalidatePath("/expenses")
    revalidatePath(`/books/${expense.category.bookId}`)
    return { success: true }
  } catch (error) {
    console.error("Expense restore error:", error)
    return { error: "Failed to restore expense" }
  }
}

export async function permanentDeleteExpense(id: string) {
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

  const expense = await prisma.expense.findUnique({
    where: { id },
    include: {
      category: {
        include: {
          book: true,
        },
      },
    },
  })

  if (!expense) {
    return { error: "Expense not found" }
  }

  // Check if category has a book (should always be true for user expenses)
  if (!expense.category.book) {
    return { error: "Invalid expense - category has no associated book" }
  }

  if (expense.category.book.userId !== session.user.id) {
    return { error: "Access denied" }
  }

  try {
    await prisma.expense.delete({
      where: { id },
    })

    revalidatePath("/expenses")
    revalidatePath(`/books/${expense.category.bookId}`)
    return { success: true }
  } catch (error) {
    console.error("Expense permanent delete error:", error)
    return { error: "Failed to permanently delete expense" }
  }
}