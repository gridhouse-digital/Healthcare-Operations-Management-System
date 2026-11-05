import { Moon, Sun } from "lucide-react"
import { useTheme } from "@/components/theme-provider"
import { cn } from "@/lib/utils"

const OPTIONS = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
] as const

export function ThemeToggle({ className }: { className?: string }) {
    const { theme, setTheme } = useTheme()

    return (
        <div className={cn("flex w-full items-center gap-1 rounded-full bg-well-card p-1 dark:bg-sidebar-accent", className)}>
            {OPTIONS.map(({ value, label, icon: Icon }) => {
                const active = theme === value
                return (
                    <button
                        key={value}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setTheme(value)}
                        className={cn(
                            "flex min-h-7 flex-1 items-center justify-center gap-1.5 rounded-full px-2 text-xs font-medium transition-colors",
                            active ? "bg-sidebar text-foreground" : "text-sidebar-foreground hover:text-foreground",
                        )}
                    >
                        <Icon size={14} strokeWidth={1.75} aria-hidden="true" />
                        {label}
                    </button>
                )
            })}
        </div>
    )
}
