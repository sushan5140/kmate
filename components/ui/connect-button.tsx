"use client";

import { Button, type ButtonProps } from "@/components/ui/button";

/**
 * The one "Connect" CTA style used everywhere in the app (profile cards,
 * discover grid, profile page) -- per PRD requirement, no screen should
 * invent its own connect button styling.
 */
export function ConnectButton({ children = "Connect", ...props }: ButtonProps) {
  return (
    <Button variant="primary" size="sm" {...props}>
      {children}
    </Button>
  );
}
