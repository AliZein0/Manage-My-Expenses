import { getAuthSession } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { getExpenseById } from "@/actions/expense-actions"
import EditExpenseForm from "@/components/forms/edit-expense-form"
import { AppLayout } from "@/components/layout/app-layout"

interface EditExpensePageProps {
  params: {
    id: string
  }
}

export default async function EditExpensePage({ params }: EditExpensePageProps) {
  const session = await getAuthSession()
  if (!session) redirect("/login")

  const result = await getExpenseById(params.id)
  if (result.error) {
    return (
      <AppLayout>
        <div className="space-y-6">
          <p className="text-red-600">Error: {result.error}</p>
        </div>
      </AppLayout>
    )
  }

  if (!result.expense) {
    notFound()
  }

  return (
    <AppLayout>
      <EditExpenseForm expense={result.expense} />
    </AppLayout>
  )
}