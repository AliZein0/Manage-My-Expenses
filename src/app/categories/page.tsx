import { getAuthSession } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { getCategories } from "@/actions/category-actions"
import { getBookById } from "@/actions/book-actions"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { AppLayout } from "@/components/layout/app-layout"
import { CategoryIcon } from "@/components/ui/category-icon"
import { Eye, EyeOff, Check } from "lucide-react"
import { CategoriesPageClient } from "@/components/categories/categories-page-client"

interface CategoriesPageProps {
  searchParams: {
    bookId?: string
    showDisabled?: string
    success?: string
    error?: string
  }
}

export default async function CategoriesPage({ searchParams }: CategoriesPageProps) {
  const session = await getAuthSession()
  if (!session) redirect("/login")

  const bookId = searchParams.bookId
  const showDisabled = searchParams.showDisabled === "true"
  const successMessage = searchParams.success
  const errorMessage = searchParams.error

  // If bookId is provided, get the book details
  let book: any = null
  if (bookId) {
    const bookResult = await getBookById(bookId)
    if (bookResult.error) {
      notFound()
    }
    book = bookResult.book
  }

  const result = await getCategories()
  if (result.error) {
    return (
      <AppLayout>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold">Categories</h1>
          </div>
          <p className="text-red-600">Error: {result.error}</p>
        </div>
      </AppLayout>
    )
  }

  const allCategories = result.categories as any[] || []
  const defaultCategories = allCategories.filter(cat => cat.isDefault)
  let userCategories = allCategories.filter(cat => !cat.isDefault)

  // Filter user categories by bookId if provided
  if (bookId) {
    userCategories = userCategories.filter(cat => cat.bookId === bookId)
  }

  // Check which default categories are already added to this book
  const alreadyAddedDefaultCategories = new Set()
  if (bookId) {
    userCategories.forEach(cat => {
      // Find matching default category by name (case insensitive)
      const matchingDefault = defaultCategories.find(defaultCat => 
        defaultCat.name.toLowerCase() === cat.name.toLowerCase()
      )
      if (matchingDefault) {
        alreadyAddedDefaultCategories.add(matchingDefault.id)
      }
    })
  }

  // Get disabled categories if requested
  let disabledCategories: any[] = []
  if (showDisabled) {
    const prisma = (await import("@/lib/prisma")).getPrismaClient()
    disabledCategories = await prisma.category.findMany({
      where: {
        isDefault: false, // Only show disabled user categories
        ...(bookId ? { bookId } : {}),
        isDisabled: true,
        book: {
          userId: session.user.id,
          isArchived: false,
        },
      } as any,
      include: {
        book: true,
        expenses: true,
      },
      orderBy: { name: "asc" },
    })
  }

  return (
    <CategoriesPageClient successMessage={successMessage} errorMessage={errorMessage}>
      <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between bg-gradient-to-r from-green-50 to-emerald-50 p-6 rounded-lg border border-green-100">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {book ? `Categories - ${book.name}` : "Categories"}
            </h1>
            {book && (
              <p className="text-gray-600 mt-1">Book: <span className="font-semibold">{book.name}</span></p>
            )}
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              asChild
              className="bg-white hover:bg-gray-50"
            >
              <Link 
                href={{
                  pathname: "/categories",
                  query: { 
                    bookId: bookId || "",
                    showDisabled: !showDisabled 
                  }
                }}
              >
                {showDisabled ? <EyeOff className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
                {showDisabled ? "Hide Disabled" : "Show Disabled"}
              </Link>
            </Button>
            <Button asChild className="bg-green-600 hover:bg-green-700">
              <Link href={bookId ? `/categories/create?bookId=${bookId}` : "/categories/create"}>
                Create Category
              </Link>
            </Button>
          </div>
        </div>

        {/* Default Categories */}
        {defaultCategories.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-blue-800 bg-blue-50 p-3 rounded-lg border border-blue-200">Default Categories</h2>
            <div className="border rounded-lg overflow-hidden shadow-sm bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-blue-200 bg-blue-50">
                    <th className="text-left p-3 font-semibold text-blue-900">Icon</th>
                    <th className="text-left p-3 font-semibold text-blue-900">Name</th>
                    <th className="text-left p-3 font-semibold text-blue-900">Description</th>
                    <th className="text-center p-3 font-semibold text-blue-900">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {defaultCategories.map((category, index) => {
                    const isAlreadyAdded = alreadyAddedDefaultCategories.has(category.id)
                    
                    return (
                      <tr
                        key={category.id}
                        className={`border-b hover:bg-blue-50/50 transition-colors ${
                          isAlreadyAdded 
                            ? 'bg-green-50 border-green-200' 
                            : index % 2 === 0 ? 'bg-white' : 'bg-blue-50/20'
                        }`}
                      >
                        <td className="p-3">
                          {category.icon && (
                            <CategoryIcon iconName={category.icon} />
                          )}
                        </td>
                        <td className="p-3 font-medium text-gray-900">
                          {category.name}
                          {isAlreadyAdded && (
                            <span className="ml-2 text-green-600 text-sm font-normal">(Added)</span>
                          )}
                        </td>
                        <td className="p-3 text-gray-600">
                          {category.description || <span className="text-gray-400 italic">No description</span>}
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex gap-1 justify-center">
                            {bookId ? (
                              isAlreadyAdded ? (
                                <span className="text-green-600 text-sm font-medium flex items-center">
                                  <Check className="w-4 h-4 mr-1" />
                                  Already Added
                                </span>
                              ) : (
                                <form action={async (formData: FormData) => {
                                  "use server"
                                  const categoryId = formData.get("categoryId") as string
                                  const bookId = formData.get("bookId") as string
                                  
                                  const { addDefaultCategoryToBook } = await import("@/actions/category-actions")
                                  const result = await addDefaultCategoryToBook(categoryId, bookId)
                                  
                                  if (result.error) {
                                    const { redirect } = await import("next/navigation")
                                    redirect(`/categories?bookId=${bookId}&error=${encodeURIComponent(result.error)}`)
                                  } else {
                                    const { redirect } = await import("next/navigation")
                                    redirect(`/categories?bookId=${bookId}&success=${encodeURIComponent(result.message || "Category added successfully")}`)
                                  }
                                }}>
                                  <input type="hidden" name="categoryId" value={category.id} />
                                  <input type="hidden" name="bookId" value={bookId} />
                                  <input type="hidden" name="categoryName" value={category.name} />
                                  <input type="hidden" name="bookName" value={book?.name || ''} />
                                  <Button
                                    type="submit"
                                    variant="outline"
                                    size="sm"
                                    className="hover:bg-green-100"
                                  >
                                    Add to Book
                                  </Button>
                                </form>
                              )
                            ) : (
                              <span className="text-gray-400 text-sm">Select a book to add</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Active Categories */}
        {userCategories.length === 0 ? (
          <div className="border-2 border-dashed border-green-300 rounded-lg p-12 text-center bg-green-50">
            <p className="text-green-800 text-lg font-medium">No active categories yet. Create your first category to get started!</p>
          </div>
        ) : (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-green-800 bg-green-50 p-3 rounded-lg border border-green-200">
              {book ? `Book Categories - ${book.name}` : "Your Categories"}
            </h2>
            <div className="border rounded-lg overflow-hidden shadow-sm bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-green-200 bg-green-50">
                    <th className="text-left p-3 font-semibold text-green-900">Icon</th>
                    <th className="text-left p-3 font-semibold text-green-900">Name</th>
                    <th className="text-left p-3 font-semibold text-green-900">Description</th>
                    {!bookId && <th className="text-left p-3 font-semibold text-green-900">Book</th>}
                    <th className="text-center p-3 font-semibold text-green-900">Expenses</th>
                    <th className="text-right p-3 font-semibold text-green-900">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {userCategories.map((category, index) => (
                    <tr 
                      key={category.id} 
                      className={`border-b hover:bg-green-50/50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-green-50/20'}`}
                    >
                      <td className="p-3">
                        {category.icon && (
                          <CategoryIcon iconName={category.icon} />
                        )}
                      </td>
                      <td className="p-3 font-medium text-gray-900">{category.name}</td>
                      <td className="p-3 text-gray-600">
                        {category.description || <span className="text-gray-400 italic">No description</span>}
                      </td>
                      {!bookId && !category.isDefault && (
                        <td className="p-3 text-gray-600">{category.book?.name || "Default"}</td>
                      )}
                      <td className="p-3 text-center">
                        <span className="inline-flex items-center justify-center px-2 py-1 bg-blue-100 text-blue-800 border border-blue-200 rounded-full text-xs font-semibold">
                          {category.expenses.length}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex gap-1 justify-end flex-wrap">
                          <Button variant="outline" size="sm" asChild className="hover:bg-blue-100">
                            <Link href={`/expenses?categoryId=${category.id}`}>View</Link>
                          </Button>
                          {!category.isDefault && (
                            <>
                              <Button variant="outline" size="sm" asChild className="hover:bg-yellow-100">
                                <Link href={`/categories/edit/${category.id}`}>Edit</Link>
                              </Button>
                              <Button 
                                variant="destructive" 
                                size="sm" 
                                asChild
                                className="hover:bg-red-100"
                              >
                                <Link href={`/categories/delete/${category.id}`}>Disable</Link>
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Disabled Categories */}
        {showDisabled && disabledCategories.length > 0 && (
          <div className="space-y-4 mt-8">
            <h2 className="text-xl font-semibold text-gray-600 bg-gray-100 p-3 rounded-lg border border-gray-300">Disabled Categories</h2>
            <div className="border-2 border-gray-300 rounded-lg overflow-hidden shadow-sm bg-gray-50/50">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-gray-300 bg-gray-200">
                    <th className="text-left p-3 font-semibold text-gray-700">Icon</th>
                    <th className="text-left p-3 font-semibold text-gray-700">Name</th>
                    <th className="text-left p-3 font-semibold text-gray-700">Description</th>
                    {!bookId && <th className="text-left p-3 font-semibold text-gray-700">Book</th>}
                    <th className="text-center p-3 font-semibold text-gray-700">Expenses</th>
                    <th className="text-right p-3 font-semibold text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {disabledCategories.map((category, index) => (
                    <tr 
                      key={category.id} 
                      className={`border-b opacity-75 ${index % 2 === 0 ? 'bg-gray-50' : 'bg-gray-100/50'}`}
                    >
                      <td className="p-3">
                        {category.icon && (
                          <CategoryIcon iconName={category.icon} className="w-5 h-5 line-through" />
                        )}
                      </td>
                      <td className="p-3 font-medium text-gray-700 line-through">{category.name}</td>
                      <td className="p-3 text-gray-500 line-through">
                        {category.description || <span className="text-gray-400 italic">No description</span>}
                      </td>
                      {!bookId && (
                        <td className="p-3 text-gray-500 line-through">{category.book.name}</td>
                      )}
                      <td className="p-3 text-center">
                        <span className="inline-flex items-center justify-center px-2 py-1 bg-gray-300 text-gray-600 rounded-full text-xs font-semibold line-through">
                          {category.expenses.length}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex gap-1 justify-end flex-wrap">
                          <Badge variant="destructive" className="bg-red-100 text-red-800 border-red-300">Disabled</Badge>
                          <Button variant="outline" size="sm" asChild className="hover:bg-blue-100">
                            <Link href={`/categories/restore/${category.id}`}>Restore</Link>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="mt-6">
          <Button variant="outline" asChild className="bg-white hover:bg-gray-50">
            <Link href={bookId ? `/books/${bookId}` : "/dashboard"}>
              ← Back to {bookId ? "Book" : "Dashboard"}
            </Link>
          </Button>
        </div>
      </div>
    </AppLayout>
    </CategoriesPageClient>
  )
}