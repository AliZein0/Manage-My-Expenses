import { getAuthSession } from "@/lib/auth"
import { redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export default async function HomePage() {
  const session = await getAuthSession()

  if (session) {
    redirect("/dashboard")
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-4xl w-full text-center">
        <div className="bg-white rounded-2xl shadow-xl p-8 md:p-12">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Manage My Expenses
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            Track and analyze your expenses with Books, Categories, and Expenses
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            <div className="bg-blue-50 p-4 rounded-lg text-left">
              <h3 className="font-semibold text-blue-900 mb-2">📚 Books</h3>
              <p className="text-sm text-blue-800">
                Organize expenses by context: House, Company, Personal, etc.
              </p>
            </div>
            <div className="bg-indigo-50 p-4 rounded-lg text-left">
              <h3 className="font-semibold text-indigo-900 mb-2">🏷️ Categories</h3>
              <p className="text-sm text-indigo-800">
                Create categories within books for detailed tracking
              </p>
            </div>
            <div className="bg-green-50 p-4 rounded-lg text-left">
              <h3 className="font-semibold text-green-900 mb-2">💰 Expenses</h3>
              <p className="text-sm text-green-800">
                Record transactions with amounts, dates, and descriptions
              </p>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg text-left">
              <h3 className="font-semibold text-purple-900 mb-2">📊 Reports</h3>
              <p className="text-sm text-purple-800">
                Analyze spending patterns with monthly summaries and charts
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button asChild size="lg">
              <Link href="/register">Get Started - Free</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/login">Sign In</Link>
            </Button>
          </div>

          <div className="mt-8 p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600">
              <strong>Technology Stack:</strong> Next.js 14, TypeScript, Prisma, MySQL, Auth.js, Tailwind CSS
            </p>
          </div>
        </div>

        <div className="mt-8 text-sm text-gray-600">
          <p>Secure • Private • Your data belongs to you</p>
        </div>
      </div>
    </div>
  )
}