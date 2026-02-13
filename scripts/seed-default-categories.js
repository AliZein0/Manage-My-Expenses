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
  {
    name: 'Office Supplies',
    description: 'Stationery, printer ink, and office materials',
    icon: 'FileText',
  },
  {
    name: 'Business Travel',
    description: 'Flights, hotels, and travel expenses for business purposes',
    icon: 'Briefcase',
  },
  {
    name: 'Advertising & Marketing',
    description: 'Promotional materials, online ads, and marketing campaigns',
    icon: 'Megaphone',
  },
  {
    name: 'Equipment & Software',
    description: 'Computers, software licenses, and business equipment',
    icon: 'Monitor',
  },
  {
    name: 'Professional Services',
    description: 'Consulting, legal, and professional fees',
    icon: 'Handshake',
  },
  {
    name: 'Client Entertainment',
    description: 'Business meals, events, and client hospitality',
    icon: 'Coffee',
  },
  {
    name: 'Training & Development',
    description: 'Workshops, courses, and employee training programs',
    icon: 'GraduationCap',
  },
  {
    name: 'Business Insurance',
    description: 'Property, liability, and business insurance premiums',
    icon: 'Shield',
  },
  {
    name: 'Office Rent/Lease',
    description: 'Monthly rent or lease payments for office space',
    icon: 'Building',
  },
  {
    name: 'Office Utilities',
    description: 'Electricity, internet, and utilities for office premises',
    icon: 'Lightbulb',
  },
  {
    name: 'Salaries & Wages',
    description: 'Employee salaries, wages, and payroll expenses',
    icon: 'DollarSign',
  },
  {
    name: 'Business Taxes',
    description: 'Income tax, property tax, and business-related taxes',
    icon: 'Receipt',
  },
  {
    name: 'Legal & Accounting',
    description: 'Legal fees, accounting services, and audit costs',
    icon: 'Scale',
  },
  {
    name: 'IT & Technology',
    description: 'IT support, cloud services, and technology infrastructure',
    icon: 'Code',
  },
  {
    name: 'Business Vehicle Expenses',
    description: 'Fuel, maintenance, and vehicle costs for business use',
    icon: 'Truck',
  },
  {
    name: 'Office Maintenance',
    description: 'Repairs, cleaning, and maintenance of office facilities',
    icon: 'Wrench',
  },
  {
    name: 'Subscriptions & Memberships',
    description: 'Software subscriptions, professional memberships, and licenses',
    icon: 'CreditCard',
  },
  {
    name: 'Miscellaneous Business',
    description: 'Other business expenses not covered by other categories',
    icon: 'MoreHorizontal',
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