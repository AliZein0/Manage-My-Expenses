/* eslint-disable react/no-unescaped-entities */
import { getAuthSession } from "@/lib/auth"
import { redirect } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { AppLayout } from "@/components/layout/app-layout"
import { BookOpen, FolderGit2, Wallet, BarChart3, Plus, Archive, Eye, Bot, Sparkles } from "lucide-react"

export default async function DashboardPage() {
  const session = await getAuthSession()

  if (!session) {
    redirect("/login")
  }

  return (
    <AppLayout>
      <div className="space-y-8">
        {/* Welcome Header */}
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-1">
            Welcome back, {session.user.name || session.user.email}!
          </p>
        </div>

        {/* Main Action Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Books Card */}
          <Card className="border-l-4 border-l-blue-500 hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center gap-3 pb-3">
              <div className="bg-blue-100 p-2 rounded-lg">
                <BookOpen className="w-6 h-6 text-blue-600" />
              </div>
              <CardTitle className="text-xl">Books</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 mb-4">
                Organize your expenses into books like "Personal", "Business", or "Vacation".
              </p>
              <div className="flex flex-wrap gap-2">
                <Button asChild className="bg-blue-600 hover:bg-blue-700">
                  <Link href="/books" className="flex items-center gap-2">
                    <Eye className="w-4 h-4" /> View
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/books/create" className="flex items-center gap-2">
                    <Plus className="w-4 h-4" /> Create
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/books/archived" className="flex items-center gap-2">
                    <Archive className="w-4 h-4" /> Archived
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Categories Card */}
          <Card className="border-l-4 border-l-green-500 hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center gap-3 pb-3">
              <div className="bg-green-100 p-2 rounded-lg">
                <FolderGit2 className="w-6 h-6 text-green-600" />
              </div>
              <CardTitle className="text-xl">Categories</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 mb-4">
                Create categories to classify your expenses (e.g., Groceries, Utilities, Transport).
              </p>
              <div className="flex flex-wrap gap-2">
                <Button asChild className="bg-green-600 hover:bg-green-700">
                  <Link href="/categories" className="flex items-center gap-2">
                    <Eye className="w-4 h-4" /> Manage
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/categories/create" className="flex items-center gap-2">
                    <Plus className="w-4 h-4" /> Add
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Expenses Card */}
          <Card className="border-l-4 border-l-purple-500 hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center gap-3 pb-3">
              <div className="bg-purple-100 p-2 rounded-lg">
                <Wallet className="w-6 h-6 text-purple-600" />
              </div>
              <CardTitle className="text-xl">Expenses</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 mb-4">
                Track your spending with amounts, dates, descriptions, and payment methods.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button asChild className="bg-purple-600 hover:bg-purple-700">
                  <Link href="/expenses" className="flex items-center gap-2">
                    <Eye className="w-4 h-4" /> View
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/expenses/create" className="flex items-center gap-2">
                    <Plus className="w-4 h-4" /> Add
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Reports Card */}
          <Card className="border-l-4 border-l-orange-500 hover:shadow-lg transition-shadow md:col-span-2 lg:col-span-3">
            <CardHeader className="flex flex-row items-center gap-3 pb-3">
              <div className="bg-orange-100 p-2 rounded-lg">
                <BarChart3 className="w-6 h-6 text-orange-600" />
              </div>
              <CardTitle className="text-xl">Reports & Analytics</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 mb-4">
                Visualize your spending patterns with monthly summaries and category breakdowns.
              </p>
              <Button asChild className="bg-orange-600 hover:bg-orange-700 w-full sm:w-auto">
                <Link href="/reports" className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4" /> View Reports
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Quick Start Guide */}
        <div className="bg-gradient-to-br from-white to-gray-50 p-6 rounded-xl border border-gray-200">
          <h2 className="text-lg font-semibold mb-4 text-gray-800">🚀 Quick Start Guide</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
              <span className="bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">1</span>
              <span className="text-sm text-gray-700">Create a Book</span>
            </div>
            <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg">
              <span className="bg-green-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">2</span>
              <span className="text-sm text-gray-700">Add Categories</span>
            </div>
            <div className="flex items-start gap-3 p-3 bg-purple-50 rounded-lg">
              <span className="bg-purple-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">3</span>
              <span className="text-sm text-gray-700">Record Expenses</span>
            </div>
            <div className="flex items-start gap-3 p-3 bg-orange-50 rounded-lg">
              <span className="bg-orange-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">4</span>
              <span className="text-sm text-gray-700">View Reports</span>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}







