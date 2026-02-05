"use client"

import { useState, useRef, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Bot, Send, Loader2, Sparkles, MessageSquare, X, Maximize2, Minimize2 } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { useRouter } from "next/navigation"
import { VoiceInputButton } from "@/components/voice/voice-input-button"

interface Suggestion {
  text: string
  action: string
  icon: string
}

interface TimingMetrics {
  sessionRetrieval?: number
  userContextBuilding?: number
  ragContext?: number
  aiApiCall?: number
  sqlExtraction?: number
  sqlExecution?: number
  totalTime: number
}

interface Message {
  role: "user" | "assistant"
  content: string
  timingMetrics?: TimingMetrics
}

export function AIFloatWidget() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [showTimingDetails, setShowTimingDetails] = useState(false)
  const [useStreaming, setUseStreaming] = useState(true)
  const [streamingContent, setStreamingContent] = useState("")
  const { toast } = useToast()
  const router = useRouter()
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Load chat history on component mount
  useEffect(() => {
    loadChatHistory()
  }, [])

  const loadChatHistory = async () => {
    setIsLoadingHistory(true)
    try {
      const response = await fetch("/api/ai/history", {
        method: "GET",
        headers: { "Content-Type": "application/json" }
      })

      if (response.ok) {
        const data = await response.json()
        if (data.messages && data.messages.length > 0) {
          setMessages(data.messages)
        }
      }
    } catch (error) {
      console.error("Failed to load chat history:", error)
    } finally {
      setIsLoadingHistory(false)
    }
  }

  const sendMessage = async () => {
    if (!input.trim()) return

    const userMessage = { role: "user" as const, content: input }
    setMessages(prev => [...prev, userMessage])
    const currentInput = input
    setInput("")
    setIsLoading(true)
    setStreamingContent("")

    try {
      // Prepare conversation history
      const conversationHistory = messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }))

      if (useStreaming) {
        // Use streaming endpoint
        const response = await fetch("/api/ai/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            message: currentInput,
            conversationHistory: conversationHistory
          })
        })

        if (!response.ok) {
          throw new Error('Streaming request failed')
        }

        const reader = response.body?.getReader()
        const decoder = new TextDecoder()
        let fullContent = ''
        let timingData: TimingMetrics | undefined

        if (reader) {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            const chunk = decoder.decode(value, { stream: true })
            const lines = chunk.split('\n').filter(line => line.trim() !== '')

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6))

                  if (data.type === 'content') {
                    fullContent += data.content
                    setStreamingContent(fullContent)
                  } else if (data.type === 'timing' || data.type === 'timing-final') {
                    timingData = data.timing
                  } else if (data.type === 'done') {
                    const assistantMessage: Message = {
                      role: "assistant",
                      content: fullContent || data.fullResponse,
                      timingMetrics: timingData
                    }
                    setMessages(prev => [...prev, assistantMessage])
                    setStreamingContent("")
                    
                    if (timingData) {
                      console.log('⏱️ Streaming Response Timing:', timingData)
                    }
                  } else if (data.type === 'error') {
                    throw new Error(data.error)
                  }
                } catch (e) {
                  console.error('Error parsing stream data:', e)
                }
              }
            }
          }
        }
      } else {
        // Use regular endpoint (existing code)
        const ragResponse = await fetch("/api/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            message: currentInput,
            conversationHistory: conversationHistory,
            context: { include: true }
          })
        })

        if (!ragResponse.ok) {
          const errorData = await ragResponse.json()
          
          if (ragResponse.status === 401 || errorData.error?.includes('session')) {
            throw new Error('Please sign in to use the AI Assistant. Your session may have expired.')
          }
          
          throw new Error(errorData.error || "Failed to get response")
        }

        const data = await ragResponse.json()
        const responseContent = data.response

        const assistantMessage: Message = { 
          role: "assistant" as const, 
          content: responseContent,
          timingMetrics: data.timingMetrics
        }
        
        setMessages(prev => [...prev, assistantMessage])
        
        if (data.timingMetrics) {
          console.log('⏱️ AI Response Timing:', data.timingMetrics)
        }

        if (data.response) {
          const suggestions = generateSuggestions(data.response)
          setSuggestions(suggestions)
        }
      }
      
    } catch (error) {
      toast({
        title: "AI Assistant Error",
        description: error instanceof Error ? error.message : "Failed to get AI response. Please try again.",
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Helper function to generate suggestions based on AI response
  const generateSuggestions = (response: string): Suggestion[] => {
    const suggestions: Suggestion[] = []
    const lowerResponse = response.toLowerCase()

    // Check for SQL execution success (updated for concise format)
    if (lowerResponse.includes('successfully executed') || lowerResponse.includes('insert')) {
      suggestions.push({
        text: 'View Records',
        action: 'view-books',
        icon: '📋'
      })
    }

    if (lowerResponse.includes('expense') || lowerResponse.includes('spending')) {
      suggestions.push({
        text: 'Add Expense',
        action: 'create-expense',
        icon: '➕'
      })
    }

    if (lowerResponse.includes('category') || lowerResponse.includes('categorize')) {
      suggestions.push({
        text: 'Create Category',
        action: 'create-category',
        icon: '🏷️'
      })
    }

    if (lowerResponse.includes('book') || lowerResponse.includes('ledger')) {
      suggestions.push({
        text: 'Create Book',
        action: 'create-book',
        icon: '📚'
      })
    }

    if (lowerResponse.includes('report') || lowerResponse.includes('analysis')) {
      suggestions.push({
        text: 'View Reports',
        action: 'view-reports',
        icon: '📊'
      })
    }

    // Always include a retry option
    suggestions.push({
      text: 'Ask Follow-up',
      action: 'retry',
      icon: '💬'
    })

    return suggestions
  }

  const handleSuggestionClick = (action: string) => {
    switch(action) {
      case "create-expense":
        router.push("/expenses/create")
        break
      case "create-category":
        router.push("/categories/create")
        break
      case "create-book":
        router.push("/books/create")
        break
      case "view-reports":
        router.push("/reports")
        break
      case "view-books":
        router.push("/books")
        break
      case "retry":
        // Retry the last action
        if (input.trim() && !isLoading) {
          sendMessage()
        }
        break
      default:
        break
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <>
      {/* Compact Widget Button (when minimized) */}
      {!isExpanded && (
        <Button
          onClick={() => setIsExpanded(true)}
          className="fixed bottom-6 right-6 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 shadow-lg rounded-full w-14 h-14 flex items-center justify-center z-50"
        >
          <MessageSquare className="w-6 h-6 text-white" />
        </Button>
      )}

      {/* Main AI Assistant Card - Only render when expanded */}
      {isExpanded && (
        <Card className="fixed bottom-6 right-6 z-50 shadow-2xl max-w-md w-full transition-all duration-300">
          <CardHeader className="flex flex-row items-center justify-between gap-3 bg-purple-600 text-white rounded-t-lg p-3">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4" />
              <CardTitle className="text-base">AI Assistant</CardTitle>
              {useStreaming && <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded">⚡ Streaming</span>}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setUseStreaming(!useStreaming)}
                className="text-white hover:bg-white/20 p-1 h-7 w-7"
                title={useStreaming ? "Switch to regular mode" : "Switch to streaming mode"}
              >
                <Sparkles className={`w-3 h-3 ${useStreaming ? 'text-yellow-300' : ''}`} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsExpanded(!isExpanded)}
                className="text-white hover:bg-white/20 p-1 h-7 w-7"
              >
                {isExpanded ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
              </Button>
              {isExpanded && (
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      // Clear chat history from database
                      try {
                        await fetch("/api/ai/history", {
                          method: "DELETE",
                          headers: { "Content-Type": "application/json" }
                        })
                      } catch (error) {
                        console.error("Failed to clear chat history:", error)
                      }
                      setMessages([])
                      setSuggestions([])
                    }}
                    className="text-white hover:bg-white/20 p-1 h-7 w-7"
                    title="Clear chat history"
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          
          <CardContent className="p-3">
            {/* Simplified Status Info - Only show when needed */}
            {isLoading && (
              <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded text-xs">
                <div className="text-blue-700">Processing your request...</div>
              </div>
            )}

            {/* Simplified Suggestions - Only show when relevant */}
            {suggestions.length > 0 && messages.length > 0 && (
              <div className="mb-3">
                <div className="flex flex-wrap gap-1">
                  {suggestions.slice(0, 3).map((sug, idx) => (
                    <Button
                      key={idx}
                      variant="outline"
                      size="sm"
                      onClick={() => handleSuggestionClick(sug.action)}
                      className="text-[11px] px-2 py-1 h-7"
                    >
                      {sug.text}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Messages */}
            <div className="h-80 overflow-y-auto space-y-2 p-2 bg-gray-50 rounded-lg mb-3">
              {isLoadingHistory ? (
                <div className="text-center text-gray-500 py-6">
                  <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin text-purple-600" />
                  <p className="text-xs">Loading chat history...</p>
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center text-gray-500 py-6">
                  <Sparkles className="w-8 h-8 mx-auto mb-2 text-purple-500" />
                  <p className="font-semibold text-sm">Ask me anything!</p>
                  <p className="text-xs mt-1">I can help with expenses, categories, and more</p>
                </div>
              ) : (
                messages.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[90%] p-2 rounded-lg text-sm ${
                      msg.role === "user" 
                        ? "bg-purple-600 text-white" 
                        : "bg-white border border-gray-200 shadow-sm"
                    }`}>
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                      
                      {/* Display timing metrics for assistant messages */}
                      {msg.role === "assistant" && msg.timingMetrics && (
                        <div className="mt-2 pt-2 border-t border-gray-200">
                          <div className="flex items-center justify-between text-[10px] text-gray-500">
                            <span className="font-medium">⏱️ Total: {msg.timingMetrics.totalTime}ms</span>
                            <button
                              onClick={() => setShowTimingDetails(!showTimingDetails)}
                              className="text-purple-600 hover:text-purple-700 underline"
                            >
                              {showTimingDetails ? 'Hide' : 'Show'} details
                            </button>
                          </div>
                          
                          {showTimingDetails && (
                            <div className="mt-1 space-y-0.5 text-[9px] text-gray-600">
                              {msg.timingMetrics.sessionRetrieval !== undefined && (
                                <div className="flex justify-between">
                                  <span>Session retrieval:</span>
                                  <span className="font-mono">{msg.timingMetrics.sessionRetrieval}ms</span>
                                </div>
                              )}
                              {msg.timingMetrics.userContextBuilding !== undefined && (
                                <div className="flex justify-between">
                                  <span>User context building:</span>
                                  <span className="font-mono">{msg.timingMetrics.userContextBuilding}ms</span>
                                </div>
                              )}
                              {msg.timingMetrics.ragContext !== undefined && (
                                <div className="flex justify-between">
                                  <span>RAG context generation:</span>
                                  <span className="font-mono">{msg.timingMetrics.ragContext}ms</span>
                                </div>
                              )}
                              {msg.timingMetrics.aiApiCall !== undefined && (
                                <div className="flex justify-between">
                                  <span>AI API call:</span>
                                  <span className="font-mono">{msg.timingMetrics.aiApiCall}ms</span>
                                </div>
                              )}
                              {msg.timingMetrics.sqlExtraction !== undefined && (
                                <div className="flex justify-between">
                                  <span>SQL extraction:</span>
                                  <span className="font-mono">{msg.timingMetrics.sqlExtraction}ms</span>
                                </div>
                              )}
                              {msg.timingMetrics.sqlExecution !== undefined && (
                                <div className="flex justify-between">
                                  <span>SQL execution:</span>
                                  <span className="font-mono">{msg.timingMetrics.sqlExecution}ms</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-white border border-gray-200 p-2 rounded-lg flex items-center gap-2 shadow-sm">
                    <Loader2 className="w-3 h-3 animate-spin text-purple-600" />
                    <span className="text-xs text-gray-600">
                      {streamingContent ? 'Streaming...' : 'Processing...'}
                    </span>
                  </div>
                </div>
              )}
              {streamingContent && isLoading && (
                <div className="flex justify-start">
                  <div className="max-w-[90%] p-2 rounded-lg text-sm bg-white border border-gray-200 shadow-sm">
                    <div className="whitespace-pre-wrap">{streamingContent}</div>
                    <div className="mt-1 text-[10px] text-gray-400 flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Streaming response...
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="flex gap-2 items-center">
              <VoiceInputButton
                onTranscript={(transcript) => {
                  setInput(transcript)
                  setTimeout(() => sendMessage(), 100)
                }}
                disabled={isLoading}
                size="sm"
                className="shrink-0"
              />
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask about expenses, database, or get help..."
                className="flex-1 text-sm focus:ring-purple-500 focus:border-purple-500"
                disabled={isLoading}
              />
              <Button 
                onClick={sendMessage} 
                disabled={isLoading || !input.trim()}
                className="bg-purple-600 hover:bg-purple-700 transition-colors"
                size="sm"
              >
                {isLoading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Send className="w-3 h-3" />
                )}
              </Button>
            </div>
            
            {/* Quick Prompts - Simplified */}
            {messages.length === 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {[
                  "Show recent expenses",
                  "Total spending this month",
                  "Create book called Work"
                ].map((prompt) => (
                  <Button
                    key={prompt}
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setInput(prompt)
                      setTimeout(() => sendMessage(), 100)
                    }}
                    className="text-[10px] bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1 h-6"
                  >
                    {prompt}
                  </Button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </>
  )
}