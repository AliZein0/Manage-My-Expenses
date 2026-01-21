"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { 
  LayoutDashboard, 
  BookOpen, 
  Tag, 
  Wallet, 
  BarChart3,
  LogOut,
  Bot
} from "lucide-react"
import { signOut } from "next-auth/react"

const navItems = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "AI Assistant",
    href: "/ai-assistant",
    icon: Bot,
  },
  {
    label: "Books",
    href: "/books",
    icon: BookOpen,
  },
  {
    label: "Categories",
    href: "/categories",
    icon: Tag,
  },
  {
    label: "Expenses",
    href: "/expenses",
    icon: Wallet,
  },
  {
    label: "Reports",
    href: "/reports",
    icon: BarChart3,
  },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <div className="w-64 bg-white border-r h-screen sticky top-0">
      <div className="p-6">
        <h2 className="text-xl font-bold text-primary">Manage My Expenses</h2>
      </div>
      
      <nav className="px-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
          
          return (
            <Button
              key={item.href}
              variant={isActive ? "default" : "ghost"}
              className={cn(
                "w-full justify-start gap-2",
                isActive && "bg-primary text-primary-foreground"
              )}
              asChild
            >
              <Link href={item.href}>
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            </Button>
          )
        })}
      </nav>

      <div className="absolute bottom-0 w-full p-4 border-t">
        <Button 
          variant="ghost" 
          className="w-full justify-start gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
          onClick={async () => {
            await signOut({ callbackUrl: "/login" })
          }}
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </Button>
      </div>
    </div>
  )
}