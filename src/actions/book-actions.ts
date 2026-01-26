"use server"

import { getAuthSessionEdge } from "@/lib/auth"
import { getPrismaClient } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { z } from "zod"

const bookSchema = z.object({
  name: z.string().min(1, "Book name is required").max(100),
  description: z.string().optional(),
  currency: z.string()
    .default("USD")
    .refine((val) => {
      // List of common valid currency codes
      const validCurrencies = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'INR', 'MXN', 'BRL', 'ZAR', 'RUB', 'KRW', 'SGD', 'HKD', 'NZD', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'TRY', 'TWD', 'THB', 'IDR', 'MYR', 'PHP', 'VND', 'ILS', 'AED', 'SAR', 'QAR', 'KWD', 'BHD', 'OMR', 'JOD', 'LBP', 'EGP', 'NGN', 'CLP', 'COP', 'PEN', 'ARS', 'UYU'];
      return validCurrencies.includes(val.toUpperCase());
    }, { message: "Invalid currency code. Please use a valid ISO 4217 currency code (e.g., USD, EUR, GBP)" }),
})

export async function createBook(formData: FormData) {
  const session = await getAuthSessionEdge()
  if (!session?.user?.id) {
    return { error: "Unauthorized - Please log in first" }
  }

  const validatedFields = bookSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    currency: formData.get("currency"),
  })

  if (!validatedFields.success) {
    return { error: "Invalid fields" }
  }

  const prisma = getPrismaClient()

  try {
    // Verify user exists in database
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    })

    if (!user) {
      return { error: "User not found in database" }
    }

    await prisma.book.create({
      data: {
        ...validatedFields.data,
        userId: session.user.id,
      },
    })

    revalidatePath("/books")
    return { success: true }
  } catch (error) {
    console.error("Book creation error:", error)
    
    // Check if it's a unique constraint violation (duplicate book name)
    if (error instanceof Error && error.message.includes('Unique constraint failed')) {
      return { error: "A book with this name already exists" }
    }
    
    return { error: "Failed to create book" }
  }
}

export async function updateBook(id: string, formData: FormData) {
  const session = await getAuthSessionEdge()
  if (!session?.user?.id) {
    return { error: "Unauthorized - Please log in first" }
  }

  const validatedFields = bookSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    currency: formData.get("currency"),
  })

  if (!validatedFields.success) {
    return { error: "Invalid fields" }
  }

  const prisma = getPrismaClient()

  // Verify user exists in database
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  })

  if (!user) {
    return { error: "User not found in database" }
  }

  const book = await prisma.book.findUnique({
    where: { id, userId: session.user.id },
  })

  if (!book) {
    return { error: "Book not found" }
  }

  if (book.isArchived) {
    return { error: "Cannot edit archived books. Restore the book first." }
  }

  try {
    await prisma.book.update({
      where: { id },
      data: validatedFields.data,
    })

    revalidatePath("/books")
    revalidatePath(`/books/${id}`)
    return { success: true }
  } catch (error) {
    console.error("Book update error:", error)
    return { error: "Failed to update book" }
  }
}

export async function getBooks() {
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
    const books = await prisma.book.findMany({
      where: {
        userId: session.user.id,
        isArchived: false,
      },
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
      orderBy: { createdAt: "desc" },
    })

    return { books }
  } catch (error) {
    console.error("Books fetch error:", error)
    return { error: "Failed to fetch books" }
  }
}

export async function getBookById(id: string) {
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
      where: { id, userId: session.user.id, isArchived: false },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        categories: {
          where: {
            isDisabled: false,
          },
          include: {
            expenses: {
              where: {
                isDisabled: false,
              },
              orderBy: { date: "desc" },
              include: {
                category: {
                  select: {
                    id: true,
                    name: true,
                    color: true,
                  },
                },
              },
            },
          },
          orderBy: { name: "asc" },
        },
      },
    })

    if (!book) {
      return { error: "Book not found" }
    }

    // Calculate summary statistics (only from active categories and expenses)
    const totalExpenses = book.categories.reduce(
      (sum, cat) => sum + cat.expenses.reduce((catSum, exp) => catSum + exp.amount, 0),
      0
    )
    const totalCategories = book.categories.length
    const totalExpensesCount = book.categories.reduce(
      (sum, cat) => sum + cat.expenses.length,
      0
    )

    return { 
      book,
      summary: {
        totalExpenses,
        totalCategories,
        totalExpensesCount,
      }
    }
  } catch (error) {
    console.error("Book fetch error:", error)
    return { error: "Failed to fetch book" }
  }
}

export async function deleteBook(id: string) {
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
    // Verify book exists and belongs to user
    const book = await prisma.book.findUnique({
      where: { id, userId: session.user.id },
    })

    if (!book) {
      return { error: "Book not found or access denied" }
    }

    // Soft delete - set isArchived to true instead of deleting
    await prisma.book.update({
      where: { id },
      data: { isArchived: true },
    })

    revalidatePath("/books")
    revalidatePath("/categories/create")
    revalidatePath("/dashboard")
    return { success: true, message: "Book archived successfully" }
  } catch (error) {
    console.error("Book delete error:", error)
    return { error: "Failed to archive book" }
  }
}

export async function getArchivedBooks() {
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
    const books = await prisma.book.findMany({
      where: {
        userId: session.user.id,
        isArchived: true,
      },
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
      orderBy: { updatedAt: "desc" },
    })

    return { books }
  } catch (error) {
    console.error("Get archived books error:", error)
    return { error: "Failed to get archived books" }
  }
}

export async function restoreBook(id: string) {
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
    // Verify book exists and belongs to user
    const book = await prisma.book.findUnique({
      where: { id, userId: session.user.id },
    })

    if (!book) {
      return { error: "Book not found or access denied" }
    }

    // Restore book by setting isArchived to false
    await prisma.book.update({
      where: { id },
      data: { isArchived: false },
    })

    revalidatePath("/books")
    revalidatePath("/books/archived")
    revalidatePath("/categories/create")
    revalidatePath("/dashboard")
    return { success: true, message: "Book restored successfully" }
  } catch (error) {
    console.error("Book restore error:", error)
    return { error: "Failed to restore book" }
  }
}

export async function permanentDeleteBook(id: string) {
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
    // Verify book exists and belongs to user
    const book = await prisma.book.findUnique({
      where: { id, userId: session.user.id },
    })

    if (!book) {
      return { error: "Book not found or access denied" }
    }

    // Verify book is archived before permanent deletion
    if (!book.isArchived) {
      return { error: "Only archived books can be permanently deleted" }
    }

    // Hard delete the book
    await prisma.book.delete({
      where: { id },
    })

    revalidatePath("/books")
    revalidatePath("/books/archived")
    revalidatePath("/categories/create")
    revalidatePath("/dashboard")
    return { success: true, message: "Book permanently deleted" }
  } catch (error) {
    console.error("Permanent book delete error:", error)
    return { error: "Failed to permanently delete book" }
  }
}