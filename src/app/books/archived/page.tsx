import { getAuthSession } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getArchivedBooks } from "@/actions/book-actions"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { AppLayout } from "@/components/layout/app-layout"
import { ArchivedBooksManager } from "@/components/archived-books-manager"
import { Archive } from "lucide-react"

export default async function ArchivedBooksPage() {
  const session = await getAuthSession()
  if (!session) redirect("/login")

  const result = await getArchivedBooks()
  if (result.error) {
    return (
      <AppLayout>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold">Archived Books</h1>
          </div>
          <p className="text-red-600">Error: {result.error}</p>
        </div>
      </AppLayout>
    )
  }

  const books = result.books || []

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Archived Books</h1>
            <p className="text-gray-600 mt-1">
              {books.length} book{books.length !== 1 ? "s" : ""} archived
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/books">
              ← Back to Books
            </Link>
          </Button>
        </div>

        {books.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-gray-600">
              <Archive className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <p>No archived books found.</p>
              <p className="text-sm mt-2">Archived books will appear here.</p>
            </CardContent>
          </Card>
        ) : (
          <ArchivedBooksManager books={books} />
        )}
      </div>
    </AppLayout>
  )
}