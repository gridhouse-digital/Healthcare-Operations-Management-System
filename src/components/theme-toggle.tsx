import { Moon, Sun } from "lucide-react"
import { useTheme } from "@/components/theme-provider"
import { cn } from "@/lib/utils"

export function ThemeToggle({ className }: { className?: string }) {
    const { theme, setTheme } = useTheme()

    return (
        <div
            className={cn("flex items-center p-0.5 rounded-md w-full", className)}
            style={{
                background: 'hsl(0 0% 100% / 0.03)',
                border: '1px solid hsl(0 0% 100% / 0.07)',
            }}
        >
            <button
                onClick={() => setTheme("light")}
                className={cn(
                    "flex items-center justify-center gap-1.5 flex-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-md transition-all duration-150",
                )}
                style={{
                    background: theme === "light" ? 'hsl(0 0% 100% / 0.10)' : 'transparent',
                    color: theme === "light" ? 'hsl(0 0% 88%)' : 'hsl(0 0% 28%)',
                }}
            >
                <Sun className="h-3 w-3" />
                <span>Light</span>
            </button>
            <button
                onClick={() => setTheme("dark")}
                className={cn(
                    "flex items-center justify-center gap-1.5 flex-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-md transition-all duration-150",
                )}
                style={{
                    background: theme === "dark" ? 'hsl(196 84% 42% / 0.16)' : 'transparent',
                    color: theme === "dark" ? 'hsl(196 84% 64%)' : 'hsl(0 0% 28%)',
                }}
            >
                <Moon className="h-3 w-3" />
                <span>Dark</span>
            </button>
        </div>
    )
}
