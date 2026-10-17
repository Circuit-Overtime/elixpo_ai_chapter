"use client";

import { useEffect, useState } from "react";
import { ChevronRight, X, MessageSquare, Newspaper, Radio, Sparkles } from "lucide-react";

interface OnboardingStep {
  id: number;
  title: string;
  description: string;
  icon: React.ReactNode;
  bgColor: string;
}

const STEPS: OnboardingStep[] = [
  {
    id: 1,
    title: "Welcome to Elixpo Chat",
    description: "Your AI assistant powered by advanced search and real-time information. Let's explore what you can do!",
    icon: <Sparkles className="w-16 h-16" />,
    bgColor: "from-blue-500 to-cyan-500",
  },
  {
    id: 2,
    title: "AI-Powered Conversations",
    description: "Chat with an intelligent assistant that understands context and provides accurate, sourced answers to any question.",
    icon: <MessageSquare className="w-16 h-16" />,
    bgColor: "from-purple-500 to-pink-500",
  },
  {
    id: 3,
    title: "Latest News",
    description: "Stay updated with today's trending news. Curated headlines and summaries in one place.",
    icon: <Newspaper className="w-16 h-16" />,
    bgColor: "from-orange-500 to-red-500",
  },
  {
    id: 4,
    title: "Podcasts & More",
    description: "Listen to featured podcasts and discover audio content tailored to your interests.",
    icon: <Radio className="w-16 h-16" />,
    bgColor: "from-green-500 to-emerald-500",
  },
  {
    id: 5,
    title: "You're All Set!",
    description: "Start chatting now and discover the power of AI-assisted research and conversation.",
    icon: <Sparkles className="w-16 h-16" />,
    bgColor: "from-indigo-500 to-blue-500",
  },
];

const ONBOARDING_KEY = "elixpo_onboarding_complete";

export function useOnboarding() {
  const [isComplete, setIsComplete] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    try {
      const complete = localStorage.getItem(ONBOARDING_KEY);
      setIsComplete(!!complete);
    } catch {
      setIsComplete(true); // Default to hidden if localStorage fails
    }
    setIsLoaded(true);
  }, []);

  const completeOnboarding = () => {
    try {
      localStorage.setItem(ONBOARDING_KEY, "true");
    } catch {
      // Ignore localStorage errors
    }
    setIsComplete(true);
  };

  return { isComplete, isLoaded, completeOnboarding };
}

interface OnboardingModalProps {
  isOpen: boolean;
  onComplete: () => void;
}

export function OnboardingModal({ isOpen, onComplete }: OnboardingModalProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const step = STEPS[currentStep];

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  };

  const handleSkip = () => {
    onComplete();
  };

  if (!isOpen) return null;

  const isLastStep = currentStep === STEPS.length - 1;
  const progress = ((currentStep + 1) / STEPS.length) * 100;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-300">
        {/* Close Button */}
        <button
          onClick={handleSkip}
          className="absolute top-4 right-4 p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors z-10"
          aria-label="Close onboarding"
        >
          <X className="w-5 h-5 text-slate-500" />
        </button>

        {/* Banner with icon */}
        <div
          className={`bg-gradient-to-br ${step.bgColor} p-8 flex flex-col items-center justify-center text-white`}
        >
          <div className="text-6xl mb-4 drop-shadow-lg">{step.icon}</div>
          <h2 className="text-2xl font-bold text-center drop-shadow">{step.title}</h2>
        </div>

        {/* Content */}
        <div className="p-8">
          <p className="text-slate-700 dark:text-slate-300 text-center mb-8 leading-relaxed">
            {step.description}
          </p>

          {/* Progress indicator */}
          <div className="mb-8">
            <div className="flex gap-1.5">
              {STEPS.map((_, index) => (
                <div
                  key={index}
                  className={`h-1.5 flex-1 rounded-full transition-all ${
                    index <= currentStep
                      ? "bg-blue-500"
                      : "bg-slate-200 dark:bg-slate-700"
                  }`}
                />
              ))}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 text-center">
              {currentStep + 1} of {STEPS.length}
            </p>
          </div>

          {/* Buttons */}
          <div className="flex gap-3">
            {!isLastStep && (
              <button
                onClick={handleSkip}
                className="flex-1 py-2.5 px-4 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Skip
              </button>
            )}
            <button
              onClick={handleNext}
              className="flex-1 py-2.5 px-4 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors flex items-center justify-center gap-2"
            >
              {isLastStep ? "Finish" : "Next"}
              {!isLastStep && <ChevronRight className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
