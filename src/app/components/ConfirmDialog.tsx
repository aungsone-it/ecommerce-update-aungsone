import { CheckCircle, XCircle, AlertTriangle, X } from "lucide-react";
import { Button } from "./ui/button";

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  type?: "success" | "error" | "warning";
  confirmText?: string;
  cancelText?: string;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  type = "warning",
  confirmText = "Confirm",
  cancelText = "Cancel",
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  const getIcon = () => {
    switch (type) {
      case "success":
        return (
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-12 h-12 text-green-600" strokeWidth={2} />
          </div>
        );
      case "error":
        return (
          <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-6">
            <XCircle className="w-12 h-12 text-red-600" strokeWidth={2} />
          </div>
        );
      case "warning":
        return (
          <div className="w-20 h-20 rounded-full bg-orange-100 flex items-center justify-center mx-auto mb-6">
            <AlertTriangle className="w-12 h-12 text-orange-600" strokeWidth={2} />
          </div>
        );
    }
  };

  const getButtonColor = () => {
    switch (type) {
      case "success":
        return "bg-green-600 hover:bg-green-700";
      case "error":
        return "bg-red-600 hover:bg-red-700";
      case "warning":
        return "bg-orange-600 hover:bg-orange-700";
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      ></div>

      {/* Dialog */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Content */}
        <div className="px-8 py-10 text-center">
          {/* Icon */}
          {getIcon()}

          {/* Title */}
          <h2 className="text-2xl font-semibold text-slate-900 mb-3">
            {title}
          </h2>

          {/* Message */}
          <p className="text-slate-600 text-base leading-relaxed mb-8">
            {message}
          </p>

          {/* Buttons */}
          <div className="flex items-center gap-3">
            <Button
              onClick={onClose}
              variant="outline"
              className="flex-1 h-11 text-base font-medium border-slate-300 hover:bg-slate-50"
            >
              {cancelText}
            </Button>
            <Button
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className={`flex-1 h-11 text-base font-medium text-white ${getButtonColor()}`}
            >
              {confirmText}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
