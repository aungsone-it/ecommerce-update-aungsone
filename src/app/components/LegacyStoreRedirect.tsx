import { Navigate, useLocation } from "react-router";
import { lazy, Suspense } from "react";
import { legacyStorePathToCanonical } from "../utils/legacyStorePath";

const NotFound = lazy(() => import("../pages/NotFound").then((m) => ({ default: m.NotFound })));

/** Sends old marketplace bookmarks away from removed routes (replace when redirecting). */
export function LegacyStoreRedirect() {
  const location = useLocation();
  const target = legacyStorePathToCanonical(location.pathname);
  if (!target) {
    return (
      <Suspense fallback={null}>
        <NotFound />
      </Suspense>
    );
  }
  return (
    <Navigate
      to={{ pathname: target, search: location.search, hash: location.hash }}
      replace
    />
  );
}
