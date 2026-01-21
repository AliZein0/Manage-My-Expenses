import { getAuthSession } from "@/lib/auth"
import { redirect } from "next/navigation"
import { AppLayout } from "@/components/layout/app-layout"
import { AIDashboardWidget } from '@/components/ai-assistant/ai-dashboard-widget'
import { Bot } from 'lucide-react'

export default async function AIAssistantPage() {
  const session = await getAuthSession()

  if (!session) {
    redirect("/login")
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-pink-600 p-6 rounded-lg text-white">
          <div className="flex items-center gap-3">
            <Bot className="w-8 h-8" />
            <div>
              <h1 className="text-3xl font-bold">AI Assistant</h1>
            </div>
          </div>
        </div>

      

        {/* AI Assistant Widget */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <AIDashboardWidget />
        </div>
      </div>
    </AppLayout>
  )
}




