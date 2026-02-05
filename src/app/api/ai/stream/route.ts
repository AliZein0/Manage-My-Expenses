import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { ragService } from '@/lib/rag/service'
import { prisma } from '@/lib/prisma'

const OPENROUTER_API_URL = process.env.OPENROUTER_API_URL || 'https://openrouter.ai/api/v1'
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY
const OPENROUTER_TEMPERATURE = parseFloat(process.env.OPENROUTER_TEMPERATURE || '0.7')
const OPENROUTER_MAX_TOKENS = parseInt(process.env.OPENROUTER_MAX_TOKENS || '1000', 10)
const APP_URL = process.env.APP_URL || process.env.NEXTAUTH_URL || 'https://localhost:3000'
const APP_NAME = process.env.APP_NAME || 'Manage My Expenses'

const MODEL_CONFIG = {
  primary: process.env.OPENROUTER_MODEL_PRIMARY || 'google/gemma-3-27b-it:free',
  fallback: process.env.OPENROUTER_MODEL_FALLBACK || 'allenai/molmo-2-8b:free'
}

export async function POST(request: Request) {
  const encoder = new TextEncoder()
  const timingMetrics = {
    startTime: Date.now(),
    sessionRetrieval: 0,
    userContextBuilding: 0,
    ragContext: 0,
    aiApiCall: 0,
    firstTokenTime: 0,
    totalTime: 0
  }

  try {
    // Get session
    const sessionStart = Date.now()
    const session = await getServerSession(authOptions)
    timingMetrics.sessionRetrieval = Date.now() - sessionStart

    if (!session?.user?.id) {
      return new Response('Unauthorized', { status: 401 })
    }

    const { message, conversationHistory } = await request.json()

    // Build user context
    const userContextStart = Date.now()
    let userContext = ''
    let userBooks: any[] = []
    let categories: any[] = []
    
    try {
      userBooks = await prisma.book.findMany({
        where: { userId: session.user.id, isArchived: false }
      })

      if (userBooks.length > 0) {
        userContext += `\n\nYOUR BOOKS:\n`
        userBooks.forEach(book => {
          userContext += `- Book Name: ${book.name}, Book ID: ${book.id}, Currency: ${book.currency}\n`
        })

        const bookIds = userBooks.map(b => b.id)
        categories = await prisma.category.findMany({
          where: { bookId: { in: bookIds }, isDisabled: false }
        })
        
        if (categories.length > 0) {
          userContext += `\nYOUR CATEGORIES:\n`
          categories.forEach(cat => {
            userContext += `- Category Name: ${cat.name}, Category ID: ${cat.id}, Book ID: ${cat.bookId}\n`
          })
        }
      }
    } catch (error) {
      console.log('Could not fetch user context:', error)
    }
    
    timingMetrics.userContextBuilding = Date.now() - userContextStart

    // Get RAG context
    const ragStart = Date.now()
    const ragContext = await ragService.getContext(session.user.id, message)
    timingMetrics.ragContext = Date.now() - ragStart

    // Build system prompt (simplified for streaming)
    let systemPrompt = `You are an AI assistant for "Manage My Expenses". Generate SQL queries for database operations.

USER ID: ${session.user.id}${userContext}

CRITICAL RULES:
1. For INSERT operations, generate SQL queries in \`\`\`sql code blocks
2. NEVER generate success messages - the system will generate them
3. Use the exact IDs provided in the context above
4. For SELECT operations, generate proper SQL with JOINs and user filtering`

    // Prepare messages
    const messages = [
      { role: 'system', content: systemPrompt },
      ...(conversationHistory || []),
      { role: 'user', content: message }
    ]

    // Create streaming response
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const aiApiStart = Date.now()
          let firstToken = true
          let fullResponse = ''

          const response = await fetch(`${OPENROUTER_API_URL}/chat/completions`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': APP_URL,
              'X-Title': APP_NAME,
            },
            body: JSON.stringify({
              model: MODEL_CONFIG.primary,
              messages,
              temperature: OPENROUTER_TEMPERATURE,
              max_tokens: OPENROUTER_MAX_TOKENS,
              stream: true,
            }),
          })

          if (!response.ok) {
            throw new Error(`API error: ${response.status}`)
          }

          const reader = response.body?.getReader()
          if (!reader) {
            throw new Error('No reader available')
          }

          const decoder = new TextDecoder()

          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            const chunk = decoder.decode(value, { stream: true })
            const lines = chunk.split('\n').filter(line => line.trim() !== '')

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6)
                if (data === '[DONE]') continue

                try {
                  const parsed = JSON.parse(data)
                  const content = parsed.choices?.[0]?.delta?.content

                  if (content) {
                    if (firstToken) {
                      timingMetrics.firstTokenTime = Date.now() - aiApiStart
                      firstToken = false
                      
                      // Send timing for first token
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                        type: 'timing',
                        timing: {
                          sessionRetrieval: timingMetrics.sessionRetrieval,
                          userContextBuilding: timingMetrics.userContextBuilding,
                          ragContext: timingMetrics.ragContext,
                          firstTokenTime: timingMetrics.firstTokenTime
                        }
                      })}\n\n`))
                    }

                    fullResponse += content
                    
                    // Send content chunk
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                      type: 'content',
                      content
                    })}\n\n`))
                  }
                } catch (e) {
                  console.error('Error parsing SSE:', e)
                }
              }
            }
          }

          timingMetrics.aiApiCall = Date.now() - aiApiStart
          timingMetrics.totalTime = Date.now() - timingMetrics.startTime

          // Send final timing
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'timing-final',
            timing: {
              sessionRetrieval: timingMetrics.sessionRetrieval,
              userContextBuilding: timingMetrics.userContextBuilding,
              ragContext: timingMetrics.ragContext,
              firstTokenTime: timingMetrics.firstTokenTime,
              aiApiCall: timingMetrics.aiApiCall,
              totalTime: timingMetrics.totalTime
            }
          })}\n\n`))

          // Send completion
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'done',
            fullResponse
          })}\n\n`))

          controller.close()
        } catch (error) {
          console.error('Streaming error:', error)
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'error',
            error: error instanceof Error ? error.message : 'Streaming failed'
          })}\n\n`))
          controller.close()
        }
      }
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (error) {
    console.error('Stream setup error:', error)
    return new Response('Internal server error', { status: 500 })
  }
}
