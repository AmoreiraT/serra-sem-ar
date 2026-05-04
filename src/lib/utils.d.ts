declare module "@/lib/utils" {
    import type { ClassValue } from "clsx";

    export function cn(...args: ClassValue[]): string;
}
