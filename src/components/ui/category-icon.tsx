import React from 'react'
import {
  Home,
  Car,
  Utensils,
  ShoppingBag,
  Heart,
  Briefcase,
  GraduationCap,
  Gamepad2,
  Film,
  Music,
  Coffee,
  Zap,
  Wrench,
  Plane,
  Train,
  Bus,
  Bike,
  Dumbbell,
  Book,
  Pill,
  Stethoscope,
  CreditCard,
  Smartphone,
  Laptop,
  Watch,
  Gift,
  Cake,
  Camera,
  Palette,
  Hammer,
  Scissors,
  Truck,
  Building,
  TreePine,
  Waves,
  Mountain,
  Sun,
  Moon,
  Star,
} from 'lucide-react'

const iconMap: { [key: string]: any } = {
  Home,
  Car,
  Utensils,
  ShoppingBag,
  Heart,
  Briefcase,
  GraduationCap,
  Gamepad2,
  Film,
  Music,
  Coffee,
  Zap,
  Wrench,
  Plane,
  Train,
  Bus,
  Bike,
  Dumbbell,
  Book,
  Pill,
  Stethoscope,
  CreditCard,
  Smartphone,
  Laptop,
  Watch,
  Gift,
  Cake,
  Camera,
  Palette,
  Hammer,
  Scissors,
  Truck,
  Building,
  TreePine,
  Waves,
  Mountain,
  Sun,
  Moon,
  Star,
}

interface CategoryIconProps {
  iconName?: string
  className?: string
  size?: number
}

export function CategoryIcon({ iconName, className = "w-5 h-5", size }: CategoryIconProps) {
  if (!iconName) return null

  const IconComponent = iconMap[iconName]

  if (!IconComponent) {
    // Fallback to text if icon not found
    return <span className={className}>{iconName}</span>
  }

  return <IconComponent className={className} size={size} />
}