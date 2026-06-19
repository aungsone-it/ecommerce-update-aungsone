import { useEffect, type ReactNode } from "react";

/** Calls `onReady` once the lazy admin section chunk has mounted. */
export function AdminSectionReady({
  onReady,
  children,
}: {
  onReady: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    onReady();
  }, [onReady]);
  return <>{children}</>;
}
