import { getAuthSession } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getBookById } from "@/actions/book-actions"
import EditBookForm from "@/components/forms/edit-book-form"
import { AppLayout } from "@/components/layout/app-layout"

interface EditBookPageProps {
  params: {
    id: string
  }
}

export default async function EditBookPage({ params }: EditBookPageProps) {
  const session = await getAuthSession()
  if (!session) redirect("/login")

  const result = await getBookById(params.id)
  if (result.error) {
    return (
      <AppLayout>
        <div className="space-y-6">
          <p className="text-red-600">Error: {result.error}</p>
        </div>
      </AppLayout>
    )
  }

  if (!result.book) {
    return (
      <AppLayout>
        <div className="space-y-6">
          <p className="text-red-600">Book not found</p>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <EditBookForm book={result.book} />
    </AppLayout>
  )
}