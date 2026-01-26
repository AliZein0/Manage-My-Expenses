#!/usr/bin/env node

/**
 * RAG Memory Cleanup Script
 * 
 * This script helps manage and clean up the RAG memory and chat history:
 * 1. View current chat history size
 * 2. Clear old chat history
 * 3. View RAG memory statistics
 * 4. Reset RAG memory (clear all chat messages)
 */

const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

// ANSI color codes for better output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
}

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

function printHeader(title) {
  log('\n' + '='.repeat(60), 'cyan')
  log(title, 'bold')
  log('='.repeat(60), 'cyan')
}

async function getChatHistoryStats() {
  try {
    const users = await prisma.user.findMany({
      include: {
        chatMessages: true
      }
    })

    printHeader('📊 CHAT HISTORY STATISTICS')

    let totalMessages = 0
    let totalUsers = 0

    users.forEach(user => {
      const messageCount = user.chatMessages.length
      if (messageCount > 0) {
        totalMessages += messageCount
        totalUsers++
        log(`${user.email}: ${messageCount} messages`, 'gray')
      }
    })

    log(`\nTotal Users with Chat History: ${totalUsers}`, 'cyan')
    log(`Total Messages: ${totalMessages}`, 'cyan')
    log(`Average per User: ${totalUsers > 0 ? (totalMessages / totalUsers).toFixed(1) : 0}`, 'cyan')

    return { totalMessages, totalUsers }
  } catch (error) {
    log(`Error getting chat history stats: ${error.message}`, 'red')
    return { totalMessages: 0, totalUsers: 0 }
  }
}

async function getRAGMemoryStats() {
  printHeader('🧠 RAG MEMORY STATISTICS')

  log('RAG Memory Components:', 'cyan')
  log('  • Validation Rules (Static)', 'gray')
  log('    - Currencies: 46 valid ISO 4217 codes', 'gray')
  log('    - Payment Methods: 5 types', 'gray')
  log('    - Required Fields: Books, Categories, Expenses', 'gray')
  log('  • Response Format Guidelines (Static)', 'gray')
  log('  • User Context (Dynamic - from database)', 'gray')
  log('  • Recent Expenses Summary (Dynamic - last 10)', 'gray')
  log('  • Category Breakdown (Dynamic)', 'gray')

  log('\nRAG Memory is generated dynamically from:', 'yellow')
  log('  • User\'s books, categories, and expenses', 'gray')
  log('  • Validation rules (hardcoded in service)', 'gray')
  log('  • Response format guidelines (hardcoded)', 'gray')

  log('\nNo persistent vector database is used.', 'green')
  log('RAG memory is cleared automatically on each request.', 'green')
}

async function clearChatHistory(userId = null) {
  try {
    if (userId) {
      await prisma.chatMessage.deleteMany({
        where: { userId }
      })
      log(`✅ Cleared chat history for user ${userId}`, 'green')
    } else {
      const result = await prisma.chatMessage.deleteMany({})
      log(`✅ Cleared ${result.count} chat messages from all users`, 'green')
    }
  } catch (error) {
    log(`Error clearing chat history: ${error.message}`, 'red')
  }
}

async function clearOldChatHistory(days = 30) {
  try {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - days)

    const result = await prisma.chatMessage.deleteMany({
      where: {
        createdAt: {
          lt: cutoffDate
        }
      }
    })

    log(`✅ Cleared ${result.count} chat messages older than ${days} days`, 'green')
  } catch (error) {
    log(`Error clearing old chat history: ${error.message}`, 'red')
  }
}

async function viewRecentChatMessages(limit = 10) {
  try {
    const messages = await prisma.chatMessage.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: {
          select: {
            email: true
          }
        }
      }
    })

    printHeader(`📋 RECENT ${limit} CHAT MESSAGES`)

    messages.reverse().forEach((msg, index) => {
      const date = new Date(msg.createdAt).toLocaleString()
      const role = msg.role === 'user' ? '👤 User' : '🤖 Assistant'
      const content = msg.content.length > 100 
        ? msg.content.substring(0, 100) + '...' 
        : msg.content

      log(`\n${index + 1}. ${role} - ${date}`, 'cyan')
      log(`   ${content}`, 'gray')
      log(`   User: ${msg.user.email}`, 'gray')
    })
  } catch (error) {
    log(`Error viewing recent messages: ${error.message}`, 'red')
  }
}

async function getRAGContextExample() {
  printHeader('📝 RAG CONTEXT EXAMPLE')

  log('The RAG service generates context dynamically:', 'yellow')
  log('')
  log('Example RAG Context Structure:', 'cyan')
  log('{', 'gray')
  log('  relevantDocs: [', 'gray')
  log('    {', 'gray')
  log('      id: "expenses-summary",', 'gray')
  log('      content: "Recent expenses: 10 items, total spending: $1,234.56, average: $123.46",', 'gray')
  log('      metadata: { type: "summary", count: 10 }', 'gray')
  log('    },', 'gray')
  log('    {', 'gray')
  log('      id: "validation-currencies",', 'gray')
  log('      content: "VALID CURRENCIES: USD, EUR, GBP, ...",', 'gray')
  log('      metadata: { type: "validation", table: "books", field: "currency" }', 'gray')
  log('    }', 'gray')
  log('    // ... more validation and response format docs', 'gray')
  log('  ],', 'gray')
  log('  userContext: {', 'gray')
  log('    totalExpenses: 10,', 'gray')
  log('    totalSpending: 1234.56,', 'gray')
  log('    avgExpense: 123.46,', 'gray')
  log('    categories: 5,', 'gray')
  log('    books: 2,', 'gray')
  log('    categoryBreakdown: { Groceries: 450, Utilities: 320, ... }', 'gray')
  log('  },', 'gray')
  log('  query: "user message here",', 'gray')
  log('  validationRules: {', 'gray')
  log('    currencies: ["USD", "EUR", ...],', 'gray')
  log('    paymentMethods: ["Cash", "Credit Card", ...],', 'gray')
  log('    requiredFields: { books: ["name", "userId", "currency"], ... }', 'gray')
  log('  }', 'gray')
  log('}', 'gray')
  log('')
  log('Note: RAG memory is NOT persisted to disk.', 'yellow')
  log('It is generated fresh on each request from the database.', 'yellow')
}

async function showMenu() {
  log('\n' + '='.repeat(60), 'magenta')
  log('🧹 RAG MEMORY CLEANUP TOOL', 'bold')
  log('='.repeat(60), 'magenta')
  log('')
  log('1. View Chat History Statistics', 'cyan')
  log('2. View RAG Memory Statistics', 'cyan')
  log('3. View Recent Chat Messages (last 10)', 'cyan')
  log('4. Clear ALL Chat History', 'yellow')
  log('5. Clear Old Chat History (older than 30 days)', 'yellow')
  log('6. View RAG Context Example', 'cyan')
  log('7. Exit', 'gray')
  log('')
  log('Enter your choice (1-7): ', 'bold')
}

async function main() {
  const args = process.argv.slice(2)
  const command = args[0]

  try {
    if (command === 'stats') {
      await getChatHistoryStats()
      await getRAGMemoryStats()
    } else if (command === 'clear') {
      const confirm = args[1] === '--confirm'
      if (confirm) {
        await clearChatHistory()
      } else {
        log('⚠️  Use --confirm flag to clear all chat history', 'yellow')
        log('Example: node cleanup-rag-memory.js clear --confirm', 'gray')
      }
    } else if (command === 'clear-old') {
      const days = parseInt(args[1]) || 30
      await clearOldChatHistory(days)
    } else if (command === 'view') {
      const limit = parseInt(args[1]) || 10
      await viewRecentChatMessages(limit)
    } else if (command === 'rag') {
      await getRAGMemoryStats()
      await getRAGContextExample()
    } else if (command === 'help') {
      log('\nAvailable commands:', 'cyan')
      log('  node cleanup-rag-memory.js stats', 'gray')
      log('  node cleanup-rag-memory.js clear --confirm', 'gray')
      log('  node cleanup-rag-memory.js clear-old [days]', 'gray')
      log('  node cleanup-rag-memory.js view [limit]', 'gray')
      log('  node cleanup-rag-memory.js rag', 'gray')
      log('  node cleanup-rag-memory.js interactive', 'gray')
      log('')
    } else if (command === 'interactive' || !command) {
      // Interactive mode
      const readline = require('readline')
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      })

      const askQuestion = (question) => {
        return new Promise((resolve) => {
          rl.question(question, (answer) => {
            resolve(answer)
          })
        })
      }

      while (true) {
        await showMenu()
        const choice = await askQuestion('')

        switch (choice) {
          case '1':
            await getChatHistoryStats()
            break
          case '2':
            await getRAGMemoryStats()
            break
          case '3':
            await viewRecentChatMessages(10)
            break
          case '4':
            const confirm = await askQuestion('⚠️  Are you sure you want to clear ALL chat history? (yes/no): ')
            if (confirm.toLowerCase() === 'yes') {
              await clearChatHistory()
            } else {
              log('Cancelled.', 'yellow')
            }
            break
          case '5':
            const days = await askQuestion('Clear messages older than how many days? (default 30): ')
            const daysNum = parseInt(days) || 30
            await clearOldChatHistory(daysNum)
            break
          case '6':
            await getRAGContextExample()
            break
          case '7':
            log('Goodbye!', 'green')
            rl.close()
            process.exit(0)
          default:
            log('Invalid choice. Please try again.', 'red')
        }

        log('')
      }
    } else {
      log('Unknown command. Use "help" to see available commands.', 'yellow')
    }
  } catch (error) {
    log(`Error: ${error.message}`, 'red')
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

// Run if called directly
if (require.main === module) {
  main()
}

module.exports = {
  getChatHistoryStats,
  getRAGMemoryStats,
  clearChatHistory,
  clearOldChatHistory,
  viewRecentChatMessages,
  getRAGContextExample
}
