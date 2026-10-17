"use client";

import { useEffect, useState } from "react";
import { OnboardingModal, useOnboarding } from "./OnboardingModal";

export function RootLayoutClient({ children }: { children: React.ReactNode }) {
  const { isComplete, isLoaded, completeOnboarding } = useOnboarding();
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (isLoaded && !isComplete) {
      // Small delay to ensure page has loaded
      const timer = setTimeout(() => {
        setShowOnboarding(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isLoaded, isComplete]);

  const handleComplete = () => {
    setShowOnboarding(false);
    completeOnboarding();
  };

  return (
    <>
      {children}
      <OnboardingModal isOpen={showOnboarding} onComplete={handleComplete} />
    </>
  );
}
