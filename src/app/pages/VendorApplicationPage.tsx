import { useParams } from "react-router";
import { VendorApplicationForm } from "../components/VendorApplicationForm";
import { useNavigate } from "react-router";

export function VendorApplicationPage() {
  const navigate = useNavigate();
  
  return (
    <VendorApplicationForm
      onBack={() => {
        navigate("/");
      }}
      source="storefront"
    />
  );
}