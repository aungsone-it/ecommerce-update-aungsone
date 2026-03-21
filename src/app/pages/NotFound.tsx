import { Button } from "../components/ui/button";
import { Home, Search } from "lucide-react";
import { useNavigate } from "react-router";
import { FadeIn } from "../components/FadeIn";
import { motion } from "motion/react";

export function NotFound() {
  const navigate = useNavigate();
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full text-center">
        {/* 404 Number with Gradient - Fade in immediately */}
        <FadeIn duration={0.4} direction="down" distance={30}>
          <div className="mb-8">
            <h1 className="text-8xl md:text-9xl font-bold bg-gradient-to-r from-orange-600 to-amber-600 bg-clip-text text-transparent mb-2">
              404
            </h1>
            <div className="h-1 w-24 bg-gradient-to-r from-orange-600 to-amber-600 rounded-full mx-auto"></div>
          </div>
        </FadeIn>

        {/* Message - Fade in with delay */}
        <FadeIn delay={0.15} duration={0.3} direction="up">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
            Page Not Found
          </h2>
          <p className="text-lg text-slate-600 mb-8 max-w-lg mx-auto">
            The page you're looking for doesn't exist or has been moved. Let's get you back on track.
          </p>
        </FadeIn>

        {/* Action Buttons - Fade in with more delay */}
        <FadeIn delay={0.3} duration={0.3} direction="up">
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }}>
              <Button
                onClick={() => navigate("/store")}
                size="lg"
                className="bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white px-8 py-3 text-base font-semibold shadow-lg hover:shadow-xl transition-all"
              >
                <Home className="w-5 h-5 mr-2" />
                Go Home
              </Button>
            </motion.div>
            <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }}>
              <Button
                onClick={() => navigate(-1)}
                size="lg"
                variant="outline"
                className="border-2 border-slate-300 hover:border-slate-400 text-slate-700 hover:text-slate-900 px-8 py-3 text-base font-semibold transition-all"
              >
                <Search className="w-5 h-5 mr-2" />
                Go Back
              </Button>
            </motion.div>
          </div>
        </FadeIn>

        {/* Help Text - Final fade in */}
        <FadeIn delay={0.45} duration={0.3} direction="none">
          <p className="mt-8 text-sm text-slate-500">
            Need help? Contact us at{' '}
            <a href="tel:+959123456789" className="text-orange-600 hover:text-orange-700 font-medium">
              +95 9 123 456 789
            </a>
          </p>
        </FadeIn>
      </div>
    </div>
  );
}