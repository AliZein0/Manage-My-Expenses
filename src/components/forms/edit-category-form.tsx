"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { updateCategory } from "@/actions/category-actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { CategoryIcon } from "@/components/ui/category-icon"
import { toast } from "@/components/ui/use-toast"
import { ArrowLeft, Home, Car, Utensils, ShoppingBag, Heart, Briefcase, GraduationCap, Gamepad2, Film, Music, Coffee, Zap, Wrench, Plane, Train, Bus, Bike, Dumbbell, Book, Pill, Stethoscope, CreditCard, Smartphone, Laptop, Watch, Gift, Cake, Camera, Palette, Hammer, Scissors, Truck, Building, TreePine, Waves, Mountain, Sun, Moon, Star } from "lucide-react"
import Link from "next/link"

interface EditCategoryFormProps {
  category: {
    id: string
    name: string
    description: string | null
    icon: string | null
    color: string | null
    bookId: string | null
    book: {
      id: string
      name: string
    } | null
  }
}

export default function EditCategoryForm({ category }: EditCategoryFormProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [isIconPickerOpen, setIsIconPickerOpen] = useState(false)
  const [formData, setFormData] = useState({
    name: category.name,
    description: category.description || "",
    icon: category.icon || "",
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.name.trim()) {
      toast({
        title: "Validation Error",
        description: "Category name is required",
        variant: "destructive",
      })
      return
    }

    setIsLoading(true)

    try {
      const formDataObj = new FormData()
      formDataObj.append("name", formData.name)
      formDataObj.append("description", formData.description)
      formDataObj.append("icon", formData.icon)

      const result = await updateCategory(category.id, formDataObj)

      if (result?.error) {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive",
        })
      } else if (result?.success) {
        toast({
          title: "Success",
          description: "Category updated successfully!",
        })
        router.back()
      } else {
        toast({
          title: "Error",
          description: "Unexpected response from server",
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update category",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button asChild variant="outline">
          <Link href={`/categories?bookId=${category.bookId}`}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Link>
        </Button>
        <h1 className="text-3xl font-bold">Edit Category</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Category Information</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="p-3 bg-blue-50 rounded-lg">
              <p className="text-sm text-gray-700">
                <span className="font-semibold">Book:</span> {category.book?.name || "Default"}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name" className="text-base font-semibold">
                Category Name *
              </Label>
              <Input
                id="name"
                placeholder="e.g., Food, Transportation, Entertainment"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                disabled={isLoading}
                required
                className="text-lg"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description" className="text-base font-semibold">
                Description
              </Label>
              <Textarea
                id="description"
                placeholder="Optional description or notes about this category"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                disabled={isLoading}
                rows={3}
                className="resize-none"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="icon" className="text-base font-semibold">
                Icon (Optional)
              </Label>
              <div className="flex gap-3 items-center">
                <Input
                  id="icon"
                  type="text"
                  placeholder="e.g., Home, Car, Utensils"
                  value={formData.icon}
                  onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                  disabled={isLoading}
                  className="flex-1"
                  maxLength={50}
                />
                <Dialog open={isIconPickerOpen} onOpenChange={setIsIconPickerOpen}>
                  <DialogTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isLoading}
                      className="px-3"
                    >
                      Choose Icon
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Choose an Icon</DialogTitle>
                    </DialogHeader>
                    <div className="grid grid-cols-8 gap-2 max-h-64 overflow-y-auto">
                      {[
                        { name: "Home", icon: Home },
                        { name: "Car", icon: Car },
                        { name: "Utensils", icon: Utensils },
                        { name: "ShoppingBag", icon: ShoppingBag },
                        { name: "Heart", icon: Heart },
                        { name: "Briefcase", icon: Briefcase },
                        { name: "GraduationCap", icon: GraduationCap },
                        { name: "Gamepad2", icon: Gamepad2 },
                        { name: "Film", icon: Film },
                        { name: "Music", icon: Music },
                        { name: "Coffee", icon: Coffee },
                        { name: "Zap", icon: Zap },
                        { name: "Wrench", icon: Wrench },
                        { name: "Plane", icon: Plane },
                        { name: "Train", icon: Train },
                        { name: "Bus", icon: Bus },
                        { name: "Bike", icon: Bike },
                        { name: "Dumbbell", icon: Dumbbell },
                        { name: "Book", icon: Book },
                        { name: "Pill", icon: Pill },
                        { name: "Stethoscope", icon: Stethoscope },
                        { name: "CreditCard", icon: CreditCard },
                        { name: "Smartphone", icon: Smartphone },
                        { name: "Laptop", icon: Laptop },
                        { name: "Watch", icon: Watch },
                        { name: "Gift", icon: Gift },
                        { name: "Cake", icon: Cake },
                        { name: "Camera", icon: Camera },
                        { name: "Palette", icon: Palette },
                        { name: "Hammer", icon: Hammer },
                        { name: "Scissors", icon: Scissors },
                        { name: "Truck", icon: Truck },
                        { name: "Building", icon: Building },
                        { name: "TreePine", icon: TreePine },
                        { name: "Waves", icon: Waves },
                        { name: "Mountain", icon: Mountain },
                        { name: "Sun", icon: Sun },
                        { name: "Moon", icon: Moon },
                        { name: "Star", icon: Star },
                      ].map(({ name, icon: IconComponent }) => (
                        <button
                          key={name}
                          type="button"
                          onClick={() => {
                            setFormData({ ...formData, icon: name })
                            setIsIconPickerOpen(false)
                          }}
                          className="flex flex-col items-center gap-1 p-2 hover:bg-gray-100 rounded-md transition-colors"
                          title={`Select ${name} icon`}
                        >
                          <IconComponent className="w-6 h-6" />
                          <span className="text-xs text-gray-600 truncate max-w-full">{name}</span>
                        </button>
                      ))}
                    </div>
                    <div className="flex justify-end mt-4">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsIconPickerOpen(false)}
                      >
                        Close
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
                {formData.icon && (
                  <div className="p-2 bg-gray-100 rounded-md">
                    <CategoryIcon iconName={formData.icon} />
                  </div>
                )}
              </div>
              <p className="text-sm text-gray-500">
                Add an icon to visually represent this category, or click &quot;Choose Icon&quot; to browse options
              </p>
            </div>

            <div className="flex gap-3 pt-4 border-t border-gray-200">
              <Button 
                type="submit" 
                disabled={isLoading}
                className="flex-1"
              >
                {isLoading ? "Updating..." : "Update Category"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
                disabled={isLoading}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
