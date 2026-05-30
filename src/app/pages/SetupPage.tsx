import { useLayoutEffect } from "react";
import { Setup } from "../components/Setup";
import { loadAdminStyles } from "../utils/loadAdminStyles";

export function SetupPage() {
  useLayoutEffect(() => {
    void loadAdminStyles();
  }, []);

  return <Setup />;
}
