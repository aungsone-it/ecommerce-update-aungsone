import { RouterProvider, createBrowserRouter } from "react-router";
import { Toaster } from "sonner";
import { appRouteObjects } from "./routes";

const router = createBrowserRouter(appRouteObjects);

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
