import { RouterProvider } from "react-router";
import { Toaster } from "sonner";
import { router } from "./routes";

// ============================================
// MAIN APP COMPONENT
// Cache bust: 20260307181500
// ============================================

export default function App() {
  return (
    <>
      <RouterProvider router={router} />
      <Toaster richColors position="top-right" />
    </>
  );
}