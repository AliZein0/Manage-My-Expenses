import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface CurrencySelectorProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

const COMMON_CURRENCIES = [
  { code: 'USD', name: 'US Dollar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'British Pound' },
  { code: 'JPY', name: 'Japanese Yen' },
  { code: 'CAD', name: 'Canadian Dollar' },
  { code: 'AUD', name: 'Australian Dollar' },
  { code: 'CHF', name: 'Swiss Franc' },
  { code: 'CNY', name: 'Chinese Yuan' },
  { code: 'INR', name: 'Indian Rupee' },
  { code: 'MXN', name: 'Mexican Peso' },
]

export function CurrencySelector({ value, onChange, disabled }: CurrencySelectorProps) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger>
        <SelectValue placeholder="Select currency" />
      </SelectTrigger>
      <SelectContent>
        {COMMON_CURRENCIES.map((currency) => (
          <SelectItem key={currency.code} value={currency.code}>
            {currency.code} - {currency.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}