"use server"

import { getAuthSessionEdge } from "@/lib/auth"
import { getPrismaClient } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { z } from "zod"

const categorySchema = z.object({
  name: z.string().min(1, "Category name is required").max(100),
  description: z.string().optional().default(""),
  bookIds: z.array(z.string()).optional(),
  icon: z.string().optional().default(""),
  isDefault: z.boolean().optional().default(false),
})

export async function createCategory(formData: FormData) {
  const session = await getAuthSessionEdge()
  if (!session?.user?.id) {
    return { error: "Unauthorized - Please log in first" }
  }

  const bookIds = formData.getAll("bookIds") as string[]
  
  const data = {
    name: formData.get("name"),
    description: formData.get("description") || "",
    bookIds: bookIds.length > 0 ? bookIds : undefined,
    icon: formData.get("icon") || "",
    isDefault: formData.get("isDefault") === "true",
  }

  const validatedFields = categorySchema.safeParse(data)

  if (!validatedFields.success) {
    return { error: "Invalid fields - " + validatedFields.error.issues.map(i => i.message).join(", ") }
  }

  // For default categories, bookId is not required
  if (!validatedFields.data.isDefault && (!validatedFields.data.bookIds || validatedFields.data.bookIds.length === 0)) {
    return { error: "At least one book is required for non-default categories" }
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

    // Verify user owns all the books (only for non-default categories)
    if (!validatedFields.data.isDefault && validatedFields.data.bookIds) {
      const books = await prisma.book.findMany({
        where: {
          id: { in: validatedFields.data.bookIds },
          userId: session.user.id,
          isArchived: false,
        },
      })

      if (books.length !== validatedFields.data.bookIds.length) {
        return { error: "One or more books not found or access denied" }
      }
    }

    // Create categories for each selected book
    if (validatedFields.data.bookIds && validatedFields.data.bookIds.length > 0) {
      const categoryData = {
        name: validatedFields.data.name,
        description: validatedFields.data.description,
        icon: validatedFields.data.icon,
        isDefault: validatedFields.data.isDefault,
      }

      // Create categories for each book
      for (const bookId of validatedFields.data.bookIds) {
        await prisma.category.create({
          data: {
            ...categoryData,
            bookId: bookId,
          },
        })
      }
    } else {
      // Create a default category (no book association)
      await prisma.category.create({
        data: {
          name: validatedFields.data.name,
          description: validatedFields.data.description,
          icon: validatedFields.data.icon,
          bookId: null,
          isDefault: validatedFields.data.isDefault,
        },
      })
    }

    revalidatePath("/categories")
    if (validatedFields.data.bookIds) {
      validatedFields.data.bookIds.forEach(bookId => {
        revalidatePath(`/books/${bookId}`)
      })
    }
    return { success: true }
  } catch (error) {
    console.error("Category creation error:", error)
    return { error: "Failed to create category" }
  }
}

export async function getCategories(bookId?: string) {
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
        OR: [
          // Default categories (available to all users)
          { isDefault: true, isDisabled: false },
          // User's book-specific categories
          {
            isDefault: false,
            isDisabled: false,
            book: {
              userId: session.user.id,
              isArchived: false,
              ...(bookId ? { id: bookId } : {}),
            },
          },
        ],
      },
      include: {
        book: true,
        expenses: true,
      },
      orderBy: [
        { isDefault: "desc" }, // Show default categories first
        { name: "asc" }
      ],
    })

    return { categories }
  } catch (error) {
    console.error("Categories fetch error:", error)
    return { error: "Failed to fetch categories" }
  }
}

export async function getCategoryById(id: string) {
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
    const category = await prisma.category.findUnique({
      where: { id },
      include: {
        book: true,
        expenses: true,
      },
    })

    if (!category) {
      return { error: "Category not found" }
    }

    // For default categories, book is null, so we can't check ownership
    if (category.isDefault) {
      return { error: "Cannot edit default categories" }
    }

    // For non-default categories, check book ownership
    if (!category.book || category.book.userId !== session.user.id) {
      return { error: "Access denied" }
    }

    return { category }
  } catch (error) {
    console.error("Category fetch error:", error)
    return { error: "Failed to fetch category" }
  }
}

export async function deleteCategory(id: string) {
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

  const category = await prisma.category.findUnique({
    where: { id },
    include: { book: true, expenses: true },
  })

  if (!category) {
    return { error: "Category not found" }
  }

  // For default categories, book is null, so we can't check ownership
  if (category.isDefault) {
    return { error: "Cannot disable default categories" }
  }

  // For non-default categories, check book ownership
  if (!category.book || category.book.userId !== session.user.id) {
    return { error: "Access denied" }
  }

  if (category.book.isArchived) {
    return { error: "Cannot delete categories from archived books" }
  }

  if (category.expenses.length > 0) {
    return { error: "Cannot delete category with existing expenses. Use disable instead." }
  }

  try {
    await prisma.category.delete({
      where: { id },
    })

    revalidatePath("/categories")
    revalidatePath(`/books/${category.bookId}`)
    return { success: true }
  } catch (error) {
    console.error("Category delete error:", error)
    return { error: "Failed to delete category" }
  }
}

export async function updateCategory(id: string, formData: FormData) {
  const session = await getAuthSessionEdge()
  if (!session?.user?.id) {
    return { error: "Unauthorized - Please log in first" }
  }

  const data = {
    name: formData.get("name") as string || "",
    description: formData.get("description") as string || "",
    icon: formData.get("icon") as string || "",
  }

  const validatedFields = categorySchema.safeParse({
    ...data,
    bookId: "temp", // bookId not needed for update, but schema requires it
    isDefault: false, // Not used in edit
  })

  if (!validatedFields.success) {
    return { error: "Invalid fields - " + validatedFields.error.issues.map(i => i.message).join(", ") }
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

    // Get existing category to verify ownership
    const existingCategory = await prisma.category.findUnique({
      where: { id },
      include: { book: true },
    })

    if (!existingCategory) {
      return { error: "Category not found" }
    }

    // For default categories, book is null, so we can't check ownership
    if (existingCategory.isDefault) {
      return { error: "Cannot edit default categories" }
    }

    // For non-default categories, check book ownership
    if (!existingCategory.book || existingCategory.book.userId !== session.user.id) {
      return { error: "Access denied" }
    }

    if (existingCategory.book.isArchived) {
      return { error: "Cannot edit categories from archived books" }
    }

    if (existingCategory.isDisabled) {
      return { error: "Cannot edit disabled categories. Restore it first." }
    }

    await prisma.category.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        icon: data.icon,
      },
    })

    revalidatePath("/categories")
    revalidatePath(`/books/${existingCategory.bookId}`)
    revalidatePath(`/categories/edit/${id}`)
    return { success: true }
  } catch (error) {
    console.error("Category update error:", error)
    return { error: "Failed to update category" }
  }
}

export async function disableCategory(id: string) {
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

  const category = await prisma.category.findUnique({
    where: { id },
    include: { book: true },
  })

  if (!category) {
    return { error: "Category not found" }
  }

  // Cannot disable default categories
  if (category.isDefault) {
    return { error: "Cannot disable default categories" }
  }

  // For non-default categories, check book ownership
  if (!category.book || category.book.userId !== session.user.id) {
    return { error: "Access denied" }
  }

  if (category.book.isArchived) {
    return { error: "Cannot disable categories from archived books" }
  }

  try {
    await prisma.category.update({
      where: { id },
      data: { isDisabled: true },
    })

    revalidatePath("/categories")
    revalidatePath(`/books/${category.bookId}`)
    return { success: true }
  } catch (error) {
    console.error("Category disable error:", error)
    return { error: "Failed to disable category" }
  }
}

export async function restoreCategory(id: string) {
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

  const category = await prisma.category.findUnique({
    where: { id },
    include: { book: true },
  })

  if (!category) {
    return { error: "Category not found" }
  }

  // For default categories, book is null, so we can't check ownership
  if (category.isDefault) {
    return { error: "Cannot restore default categories" }
  }

  // For non-default categories, check book ownership
  if (!category.book || category.book.userId !== session.user.id) {
    return { error: "Access denied" }
  }

  if (category.book.isArchived) {
    return { error: "Cannot restore categories from archived books" }
  }

  try {
    await prisma.category.update({
      where: { id },
      data: { isDisabled: false },
    })

    revalidatePath("/categories")
    revalidatePath(`/books/${category.bookId}`)
    return { success: true }
  } catch (error) {
    console.error("Category restore error:", error)
    return { error: "Failed to restore category" }
  }
}

export async function permanentDeleteCategory(id: string) {
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

  const category = await prisma.category.findUnique({
    where: { id },
    include: { book: true, expenses: true },
  })

  if (!category) {
    return { error: "Category not found" }
  }

  // For default categories, book is null, so we can't check ownership
  if (category.isDefault) {
    return { error: "Cannot permanently delete default categories" }
  }

  // For non-default categories, check book ownership
  if (!category.book || category.book.userId !== session.user.id) {
    return { error: "Access denied" }
  }

  if (category.expenses.length > 0) {
    return { error: "Cannot permanently delete category with existing expenses. Delete expenses first." }
  }

  try {
    await prisma.category.delete({
      where: { id },
    })

    revalidatePath("/categories")
    revalidatePath(`/books/${category.bookId}`)
    return { success: true }
  } catch (error) {
    console.error("Category permanent delete error:", error)
    return { error: "Failed to permanently delete category" }
  }
}

export async function addDefaultCategoryToBook(defaultCategoryId: string, bookId: string) {
  const session = await getAuthSessionEdge()
  if (!session?.user?.id) {
    return { error: "Unauthorized - Please log in first" }
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

    // Verify the default category exists and is indeed default
    const defaultCategory = await prisma.category.findUnique({
      where: { id: defaultCategoryId, isDefault: true },
    })

    if (!defaultCategory) {
      return { error: "Default category not found" }
    }

    // Verify user owns the book
    const book = await prisma.book.findUnique({
      where: { id: bookId, userId: session.user.id },
    })

    if (!book) {
      return { error: "Book not found or access denied" }
    }

    if (book.isArchived) {
      return { error: "Cannot add categories to archived books" }
    }

    // Check if user already has this category in the book
    const existingCategory = await prisma.category.findFirst({
      where: {
        name: defaultCategory.name,
        bookId: bookId,
        isDefault: false,
        isDisabled: false,
      },
    })

    if (existingCategory) {
      return { error: "This category already exists in the book" }
    }

    // Create a copy of the default category in the user's book
    await prisma.category.create({
      data: {
        name: defaultCategory.name,
        description: defaultCategory.description,
        icon: defaultCategory.icon,
        bookId: bookId,
        isDefault: false,
      },
    })

    revalidatePath("/categories")
    revalidatePath(`/books/${bookId}`)
    return { success: true }
  } catch (error) {
    console.error("Add default category error:", error)
    return { error: "Failed to add default category to book" }
  }
}