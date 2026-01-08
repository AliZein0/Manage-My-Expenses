import { getAuthSession } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { getCategoryById } from "@/actions/category-actions"
import EditCategoryForm from "@/components/forms/edit-category-form"
import { AppLayout } from "@/components/layout/app-layout"

interface EditCategoryPageProps {
  params: {
    id: string
  }
}

export default async function EditCategoryPage({ params }: EditCategoryPageProps) {
  const session = await getAuthSession()
  if (!session) redirect("/login")

  const result = await getCategoryById(params.id)
  if (result.error) {
    return (
      <AppLayout>
        <div className="space-y-6">
          <p className="text-red-600">Error: {result.error}</p>
        </div>
      </AppLayout>
    )
  }

  if (!result.category) {
    notFound()
  }

  return (
    <AppLayout>
      <EditCategoryForm category={result.category} />
    </AppLayout>
  )
}