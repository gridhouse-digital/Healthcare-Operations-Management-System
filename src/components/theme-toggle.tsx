import { Moon, Sun } from "lucide-react"
import { useTheme } from "@/components/theme-provider"
import { cn } from "@/lib/utils"

export function ThemeToggle({ className }: { className?: string }) {
    const { theme, setTheme } = useTheme()

    return (
        <div
            className={cn("flex items-center p-0.5 rounded-md w-full", className)}
            style={{
                background: 'color-mix(in srgb, var(--sidebar-accent) 86%, transparent)',
                border: '1px solid var(--sidebar-border)',
            }}
        >
            <button
                onClick={() => setTheme("light")}
                className={cn(
                    "flex items-center justify-center gap-1.5 flex-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-md transition-all duration-150",
                )}
                style={{
                    background: theme === "light" ? 'var(--sidebar-accent)' : 'transparent',
                    color: theme === "light" ? 'var(--foreground)' : 'var(--sidebar-foreground)',
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
                    background: theme === "dark" ? 'color-mix(in srgb, var(--sidebar-primary) 18%, transparent)' : 'transparent',
                    color: theme === "dark" ? 'var(--sidebar-primary)' : 'var(--sidebar-foreground)',
                }}
            >
                <Moon className="h-3 w-3" />
                <span>Dark</span>
            </button>
        </div>
    )
}
