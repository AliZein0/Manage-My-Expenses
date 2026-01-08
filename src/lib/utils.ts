import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, currency: string = "USD") {
  try {
    // Validate currency code
    const validCurrencies = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'INR', 'MXN', 'BRL', 'ZAR', 'RUB', 'KRW', 'SGD', 'HKD', 'NZD', 'SEK', 'NOK', 'DKK', 'PLN', 'TRY', 'AED', 'SAR', 'ILS', 'THB', 'MYR', 'IDR', 'PHP', 'VND', 'TRY', 'ARS', 'CLP', 'COP', 'PEN', 'UYU'];
    
    if (!validCurrencies.includes(currency.toUpperCase())) {
      throw new Error(`Invalid currency: ${currency}`);
    }
    
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(amount)
  } catch (error) {
    // If currency code is invalid, fall back to simple number formatting
    console.warn(`Invalid currency code: ${currency}. Using fallback format.`);
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount) + ` ${currency}`
  }
}

export function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date)
}

export function formatMonthYear(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
  }).format(date)
}

export function getMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}