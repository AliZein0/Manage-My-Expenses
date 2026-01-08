import Link from "next/link"
import { Button } from "@/components/ui/button"
import { getAuthSession } from "@/lib/auth"
import { signOut } from "next-auth/react"

export async function MainNav() {
  const session = await getAuthSession()

  return (
    <nav className="border-b bg-white">
      <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold">
          Manage My Expenses
        </Link>

        <div className="flex items-center gap-4">
          {session ? (
            <>
              <Link href="/dashboard" className="text-sm font-medium hover:text-blue-600">
                Dashboard
              </Link>
              <Link href="/books" className="text-sm font-medium hover:text-blue-600">
                Books
              </Link>
              <Link href="/categories" className="text-sm font-medium hover:text-blue-600">
                Categories
              </Link>
              <Link href="/expenses" className="text-sm font-medium hover:text-blue-600">
                Expenses
              </Link>
              <Link href="/reports" className="text-sm font-medium hover:text-blue-600">
                Reports
              </Link>
              <form action={async () => {
                "use server"
                await signOut({ callbackUrl: "/login" })
              }}>
                <Button variant="outline" size="sm">
                  Sign Out
                </Button>
              </form>
            </>
          ) : (
            <>
              <Button asChild variant="outline" size="sm">
                <Link href="/login">Sign In</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/register">Sign Up</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}