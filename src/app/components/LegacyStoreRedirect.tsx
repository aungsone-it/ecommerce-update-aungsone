import { Navigate, useLocation } from "react-router";
import { legacyStorePathToCanonical } from "../utils/legacyStorePath";
import { NotFound } from "../pages/NotFound";

/** Sends old marketplace bookmarks away from removed routes (replace when redirecting). */
export function LegacyStoreRedirect() {
  const location = useLocation();
  const target = legacyStorePathToCanonical(location.pathname);
  if (!target) {
    return <NotFound />;
  }
  return (
    <Navigate
      to={{ pathname: target, search: location.search, hash: location.hash }}
      replace
    />
  );
}
