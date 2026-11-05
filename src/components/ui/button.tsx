import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
    "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-transparent bg-clip-padding text-sm font-medium transition-colors select-none disabled:cursor-not-allowed disabled:opacity-55 aria-invalid:border-destructive/50 aria-invalid:ring-destructive/20",
    {
        variants: {
            variant: {
                default: "bg-primary text-primary-foreground hover:bg-accent-hi",
                destructive:
                    "border-destructive/10 bg-destructive/12 text-destructive hover:bg-destructive/18",
                outline:
                    "border-border bg-transparent hover:bg-secondary hover:text-accent-foreground",
                secondary:
                    "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                ghost: "hover:bg-accent/80 hover:text-accent-foreground",
                link: "text-primary underline-offset-4 hover:underline",
            },
            size: {
                default: "h-9 px-3.5 py-2",
                sm: "h-8 px-3 text-[0.8125rem]",
                lg: "h-10 px-5",
                icon: "size-9",
            },
        },
        defaultVariants: {
            variant: "default",
            size: "default",
        },
    }
)

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
    asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, asChild = false, ...props }, ref) => {
        const Comp = asChild ? Slot : "button"
        return (
            <Comp
                className={cn(buttonVariants({ variant, size, className }))}
                ref={ref}
                {...props}
            />
        )
    }
)
Button.displayName = "Button"

export { Button, buttonVariants }
