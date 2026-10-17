"use client";

import { useEffect, useState } from "react";

/**
 * Tiny countdown helper for resend / cooldown buttons.
 *
 *   const cd = useCooldown();
 *   <Button disabled={cd.secondsLeft > 0} onClick={() => { fire(); cd.start(60); }}>
 *     {cd.secondsLeft > 0 ? `Resend in ${cd.secondsLeft}s` : "Resend"}
 *   </Button>
 *
 * Single interval per instance; cleans itself up on unmount or when the
 * countdown hits zero. Persists across renders within the component.
 */
export function useCooldown(initialSeconds = 0) {
    const [secondsLeft, setSecondsLeft] = useState(initialSeconds);

    useEffect(() => {
        if (secondsLeft <= 0) return;
        const id = setInterval(() => {
            setSecondsLeft((s) => Math.max(0, s - 1));
        }, 1000);
        return () => clearInterval(id);
    }, [secondsLeft]);

    return {
        secondsLeft,
        active: secondsLeft > 0,
        start(seconds: number) {
            setSecondsLeft(seconds);
        },
        reset() {
            setSecondsLeft(0);
        },
    };
}
