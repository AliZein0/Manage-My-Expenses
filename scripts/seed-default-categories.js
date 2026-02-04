const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

const defaultCategories = [
  {
    name: 'Food & Dining',
    description: 'Restaurants, groceries, and food delivery',
    icon: 'Utensils',
  },
  {
    name: 'Transportation',
    description: 'Gas, public transport, rideshare, and vehicle maintenance',
    icon: 'Car',
  },
  {
    name: 'Shopping',
    description: 'Clothing, electronics, and general purchases',
    icon: 'ShoppingBag',
  },
  {
    name: 'Entertainment',
    description: 'Movies, games, concerts, and hobbies',
    icon: 'Film',
  },
  {
    name: 'Bills & Utilities',
    description: 'Electricity, water, internet, and phone bills',
    icon: 'Zap',
  },
  {
    name: 'Healthcare',
    description: 'Medical expenses, insurance, and pharmacy',
    icon: 'Stethoscope',
  },
  {
    name: 'Education',
    description: 'Books, courses, and educational materials',
    icon: 'Book',
  },
  {
    name: 'Travel',
    description: 'Flights, hotels, and vacation expenses',
    icon: 'Plane',
  },
  {
    name: 'Personal Care',
    description: 'Haircuts, cosmetics, and personal grooming',
    icon: 'Heart',
  },
  {
    name: 'Home & Garden',
    description: 'Furniture, repairs, and home improvement',
    icon: 'Home',
  },
]

async function main() {
  console.log('Seeding default categories...')

  for (const category of defaultCategories) {
    const existingCategory = await prisma.category.findFirst({
      where: {
        name: category.name,
        isDefault: true,
      },
    })

    if (!existingCategory) {
      await prisma.category.create({
        data: {
          ...category,
          isDefault: true,
        },
      })
      console.log(`Created default category: ${category.name}`)
    } else {
      // Update existing category with new icon and remove color
      await prisma.category.update({
        where: { id: existingCategory.id },
        data: {
          icon: category.icon,
          color: null, // Remove color
        },
      })
      console.log(`Updated default category: ${category.name}`)
    }
  }

  console.log('Seeding completed!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })