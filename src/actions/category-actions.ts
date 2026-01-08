"use server"

import { getAuthSessionEdge } from "@/lib/auth"
import { getPrismaClient } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { z } from "zod"

const categorySchema = z.object({
  name: z.string().min(1, "Category name is required").max(100),
  description: z.string().optional().default(""),
  bookId: z.string().min(1, "Book is required"),
  icon: z.string().optional().default(""),
  color: z.string().optional().default(""),
})

export async function createCategory(formData: FormData) {
  const session = await getAuthSessionEdge()
  if (!session?.user?.id) {
    return { error: "Unauthorized - Please log in first" }
  }

  const data = {
    name: formData.get("name"),
    description: formData.get("description") || "",
    bookId: formData.get("bookId"),
    icon: formData.get("icon") || "",
    color: formData.get("color") || "",
  }

  const validatedFields = categorySchema.safeParse(data)

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

    // Verify user owns the book
    const book = await prisma.book.findUnique({
      where: { id: validatedFields.data.bookId, userId: session.user.id },
    })

    if (!book) {
      return { error: "Book not found or access denied" }
    }

    if (book.isArchived) {
      return { error: "Cannot create categories for archived books" }
    }

    await prisma.category.create({
      data: {
        name: validatedFields.data.name,
        description: validatedFields.data.description,
        icon: validatedFields.data.icon,
        color: validatedFields.data.color,
        bookId: validatedFields.data.bookId,
      },
    })

    revalidatePath("/categories")
    revalidatePath(`/books/${validatedFields.data.bookId}`)
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
        ...(bookId ? { bookId } : {}),
        isDisabled: false,
        book: {
          userId: session.user.id,
          isArchived: false,
        },
      },
      include: {
        book: true,
        expenses: true,
      },
      orderBy: { name: "asc" },
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

    if (category.book.userId !== session.user.id) {
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

  if (category.book.userId !== session.user.id) {
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
    color: formData.get("color") as string || "",
  }

  const validatedFields = categorySchema.safeParse({
    ...data,
    bookId: "temp", // bookId not needed for update, but schema requires it
    icon: "", // Not used in edit
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

    if (existingCategory.book.userId !== session.user.id) {
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
        color: data.color,
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

  if (category.book.userId !== session.user.id) {
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

  if (category.book.userId !== session.user.id) {
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

  if (category.book.userId !== session.user.id) {
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