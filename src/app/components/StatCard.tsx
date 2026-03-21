import { LucideIcon } from "lucide-react";
import { Card } from "./ui/card";
import { cn } from "./ui/utils";
import { useState } from "react";
import { ChevronDown } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  change: string;
  changeType: "positive" | "negative" | "neutral";
  icon: LucideIcon;
  iconBgColor: string;
  onFilterChange?: (filter: string) => void;
}

export function StatCard({ 
  title, 
  value, 
  change, 
  changeType, 
  icon: Icon,
  iconBgColor,
  onFilterChange 
}: StatCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState("Last 30 days");

  const filterOptions = [
    "Last 7 days",
    "Last 30 days",
    "Last 3 months",
    "Last 6 months",
    "Last year",
    "All time"
  ];

  const handleFilterSelect = (filter: string) => {
    setSelectedFilter(filter);
    setIsOpen(false);
    if (onFilterChange) {
      onFilterChange(filter);
    }
  };

  return (
    <Card className="p-6 hover:shadow-lg transition-shadow duration-200 animate-scale-in">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <p className="text-sm text-slate-500 mb-1">{title}</p>
          {/* Filter Dropdown Button */}
          <div className="relative inline-block">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors"
            >
              <span>{selectedFilter}</span>
              <ChevronDown className="w-3 h-3" />
            </button>
            
            {/* Dropdown Menu */}
            {isOpen && (
              <>
                <div 
                  className="fixed inset-0 z-10" 
                  onClick={() => setIsOpen(false)}
                />
                <div className="absolute left-0 top-full mt-1 w-40 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-20">
                  {filterOptions.map((option) => (
                    <button
                      key={option}
                      onClick={() => handleFilterSelect(option)}
                      className={cn(
                        "w-full text-left px-3 py-2 text-xs hover:bg-slate-50 transition-colors",
                        selectedFilter === option && "bg-slate-100 font-medium"
                      )}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
        <div className={cn(
          "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
          iconBgColor
        )}>
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>

      <div>
        <p className="text-2xl font-semibold text-slate-900 mb-2">{value}</p>
        <p className={cn(
          "text-sm font-medium",
          changeType === "positive" && "text-green-600",
          changeType === "negative" && "text-red-600",
          changeType === "neutral" && "text-slate-500"
        )}>
          {change}
        </p>
      </div>
    </Card>
  );
}