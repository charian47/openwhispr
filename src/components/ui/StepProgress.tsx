import React from "react";
import { Check, LucideIcon } from "lucide-react";

interface Step {
  title: string;
  icon: LucideIcon;
}

interface StepProgressProps {
  steps: Step[];
  currentStep: number;
  className?: string;
}

export default function StepProgress({
  steps,
  currentStep,
  className = "",
}: StepProgressProps) {
  return (
    <div className={`flex items-center justify-between mb-2 ${className}`}>
      {steps.map((step, index) => {
        const Icon = step.icon;
        const isActive = index === currentStep;
        const isCompleted = index < currentStep;

        return (
          <div key={index} className="flex items-center">
            <div
              className={`flex items-center gap-2 ${
                isActive
                  ? "text-blue-600"
                  : isCompleted
                  ? "text-green-600"
                  : "text-stone-400"
              }`}
              style={{ fontFamily: "Noto Sans, sans-serif" }}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${
                  isActive
                    ? "border-blue-600 bg-blue-50"
                    : isCompleted
                    ? "border-green-600 bg-green-50"
                    : "border-stone-300 bg-white"
                }`}
              >
                {isCompleted ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Icon className="w-4 h-4" />
                )}
              </div>
              <span className="text-xs font-medium hidden md:block">
                {step.title}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div
                className={`w-8 h-0.5 mx-2 ${
                  isCompleted ? "bg-green-600" : "bg-stone-300"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
