import { createContext, useContext, useState, useCallback } from 'react';

interface SidebarContextValue {
    /** Whether sidebar is pinned open (user clicked to lock it) */
    pinned: boolean;
    /** Whether sidebar is visually expanded (pinned OR hovered) */
    expanded: boolean;
    /** Toggle pin state — called by collapse button */
    togglePin: () => void;
    /** Called on mouseenter/mouseleave of the aside element */
    setHovered: (val: boolean) => void;
    /** @deprecated use togglePin */
    collapsed: boolean;
    /** @deprecated use togglePin */
    toggleCollapse: () => void;
}

const PIN_KEY = 'prolific-sidebar-pinned';

const SidebarContext = createContext<SidebarContextValue>({
    pinned: true,
    expanded: true,
    togglePin: () => {},
    setHovered: () => {},
    collapsed: false,
    toggleCollapse: () => {},
});

export function SidebarProvider({ children }: { children: React.ReactNode }) {
    const [pinned, setPinned] = useState(() => {
        try {
            const stored = localStorage.getItem(PIN_KEY);
            // Default to pinned open; 'false' means icon-only mode
            return stored === null ? true : stored !== 'false';
        } catch { return true; }
    });

    const [hovered, setHoveredState] = useState(false);

    const togglePin = useCallback(() => {
        setPinned(prev => {
            const next = !prev;
            try { localStorage.setItem(PIN_KEY, String(next)); } catch {}
            // When collapsing (unpinning), immediately clear hover so sidebar closes
            if (!next) setHoveredState(false);
            return next;
        });
    }, []);

    const setHovered = useCallback((val: boolean) => {
        setHoveredState(val);
    }, []);

    const expanded = pinned || hovered;

    return (
        <SidebarContext.Provider value={{
            pinned,
            expanded,
            togglePin,
            setHovered,
            // Legacy compat
            collapsed: !expanded,
            toggleCollapse: togglePin,
        }}>
            {children}
        </SidebarContext.Provider>
    );
}

export function useSidebar() {
    return useContext(SidebarContext);
}
