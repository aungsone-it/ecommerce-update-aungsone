import { Button } from "../components/ui/button";
import { useNavigate } from "react-router";
import { FadeIn } from "../components/FadeIn";
import { motion } from "motion/react";

/** Softer-than-black: slate-800 / slate-900 — easy on the eyes vs pure #000 */
export function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full text-center">
        <FadeIn duration={0.4} direction="down" distance={30}>
          <div className="mb-8">
            <h1 className="text-8xl md:text-9xl font-bold text-slate-800 mb-2 tracking-tight">
              404
            </h1>
            <div className="h-1 w-24 bg-slate-800/80 rounded-full mx-auto" />
          </div>
        </FadeIn>

        <FadeIn delay={0.15} duration={0.3} direction="up">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mb-10">
            Page Not Found
          </h2>
        </FadeIn>

        <FadeIn delay={0.3} duration={0.3} direction="up">
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center items-stretch sm:items-center max-w-md mx-auto">
            <motion.div
              className="flex-1 sm:flex-initial"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Button
                onClick={() => navigate("/store")}
                className="w-full sm:w-auto min-h-11 px-8 bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium rounded-xl shadow-md hover:shadow-lg transition-all"
              >
                Go Home
              </Button>
            </motion.div>
            <motion.div
              className="flex-1 sm:flex-initial"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Button
                onClick={() => navigate(-1)}
                variant="outline"
                className="w-full sm:w-auto min-h-11 px-8 border-slate-300 bg-white text-slate-800 hover:bg-slate-50 hover:border-slate-400 hover:text-slate-900 text-sm font-medium rounded-xl shadow-sm transition-all"
              >
                Go Back
              </Button>
            </motion.div>
          </div>
        </FadeIn>

        <FadeIn delay={0.45} duration={0.3} direction="none">
          <p className="mt-10 text-sm text-slate-500">
            Need help? Contact us at{" "}
            <a
              href="tel:+959123456789"
              className="text-orange-600 hover:text-orange-700 font-medium"
            >
              +95 9 123 456 789
            </a>
          </p>
        </FadeIn>
      </div>
    </div>
  );
}
