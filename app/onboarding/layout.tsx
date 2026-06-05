import PaywallGate from "@/components/billing/PaywallGate"

// Payment comes BEFORE onboarding. When PAYWALL_ENFORCED=true, this gate sends
// unpaid users to /checkout (and shows the pending-payment notice). Reaching
// /onboarding never marks anyone active.
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <PaywallGate>{children}</PaywallGate>
}
