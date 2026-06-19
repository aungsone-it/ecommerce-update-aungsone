import { useMemo } from "react";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Checkbox } from "./ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import {
  isTownshipInMyanmarRegion,
  myanmarRegionSelectOptions,
  myanmarTownshipSelectOptions,
} from "../utils/myanmarRegions";

export type ShippingAddressFormValue = {
  label: string;
  recipientName: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  isDefault: boolean;
};

const labelClass = "mb-1.5 block text-sm font-medium text-slate-800";
const inputClass =
  "h-11 min-h-11 bg-slate-50 border-slate-200 text-slate-900 text-sm rounded-lg placeholder:text-slate-500 focus:border-slate-900 focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:ring-transparent";
const selectClass = [
  inputClass,
  "w-full !h-11 px-3 shadow-none",
  "data-[placeholder]:text-slate-500",
  "disabled:cursor-not-allowed disabled:opacity-100",
  "disabled:data-[placeholder]:text-slate-500",
  "[&_svg]:text-slate-500 [&_svg]:opacity-80",
].join(" ");

export function isShippingAddressFormValid(value: ShippingAddressFormValue): boolean {
  return Boolean(
    value.label.trim() &&
      value.recipientName.trim() &&
      value.phone.trim() &&
      value.addressLine1.trim() &&
      value.state.trim() &&
      value.city.trim()
  );
}

type ShippingAddressFormFieldsProps = {
  value: ShippingAddressFormValue;
  onChange: (next: ShippingAddressFormValue) => void;
  idPrefix?: string;
  defaultCheckboxId?: string;
};

export function ShippingAddressFormFields({
  value,
  onChange,
  idPrefix = "shipping-addr",
  defaultCheckboxId = "shipping-addr-default",
}: ShippingAddressFormFieldsProps) {
  const patch = (partial: Partial<ShippingAddressFormValue>) => onChange({ ...value, ...partial });

  const regionSelectOptions = useMemo(
    () => myanmarRegionSelectOptions(value.state),
    [value.state]
  );

  const townshipSelectOptions = useMemo(
    () => myanmarTownshipSelectOptions(value.state, value.city),
    [value.state, value.city]
  );

  return (
    <div className="space-y-6">
      <div>
        <Label htmlFor={`${idPrefix}-label`} className={labelClass}>
          Address Label *
        </Label>
        <Input
          id={`${idPrefix}-label`}
          placeholder="e.g., Home, Office"
          value={value.label}
          onChange={(e) => patch({ label: e.target.value })}
          className={inputClass}
        />
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-slate-900" style={{ fontFamily: "Rubik, sans-serif" }}>
          Contact
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <Label htmlFor={`${idPrefix}-name`} className={labelClass}>
              Full Name *
            </Label>
            <Input
              id={`${idPrefix}-name`}
              placeholder="Enter your full name"
              value={value.recipientName}
              onChange={(e) => patch({ recipientName: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <Label htmlFor={`${idPrefix}-phone`} className={labelClass}>
              Phone Number *
            </Label>
            <Input
              id={`${idPrefix}-phone`}
              type="tel"
              placeholder="+95 9 XXX XXX XXX"
              value={value.phone}
              onChange={(e) => patch({ phone: e.target.value })}
              className={inputClass}
            />
          </div>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-slate-900" style={{ fontFamily: "Rubik, sans-serif" }}>
          Address
        </h2>
        <div className="space-y-4">
          <div>
            <Label htmlFor={`${idPrefix}-street`} className={labelClass}>
              Address *
            </Label>
            <Input
              id={`${idPrefix}-street`}
              placeholder="No. 123, Main Street"
              value={value.addressLine1}
              onChange={(e) => patch({ addressLine1: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <Label htmlFor={`${idPrefix}-state`} className={labelClass}>
              State/Region *
            </Label>
            <Select
              value={value.state || undefined}
              onValueChange={(state) =>
                patch({
                  state,
                  city: isTownshipInMyanmarRegion(state, value.city) ? value.city : "",
                })
              }
            >
              <SelectTrigger id={`${idPrefix}-state`} className={selectClass}>
                <SelectValue placeholder="Select state/region" />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {regionSelectOptions.map((state) => (
                  <SelectItem key={state} value={state}>
                    {state}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor={`${idPrefix}-township`} className={labelClass}>
              Township *
            </Label>
            <Select
              value={value.city || undefined}
              onValueChange={(city) => patch({ city })}
              disabled={!value.state.trim()}
            >
              <SelectTrigger id={`${idPrefix}-township`} className={selectClass}>
                <SelectValue
                  placeholder={value.state.trim() ? "Select township" : "Select state/region first"}
                />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {townshipSelectOptions.map((city) => (
                  <SelectItem key={city} value={city}>
                    {city}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor={`${idPrefix}-notes`} className={labelClass}>
              Notes
            </Label>
            <Textarea
              id={`${idPrefix}-notes`}
              placeholder="Add notes..."
              value={value.addressLine2}
              onChange={(e) => patch({ addressLine2: e.target.value })}
              className="min-h-[80px] resize-none rounded-lg border-slate-200 bg-slate-50 text-sm focus:border-slate-900 focus:ring-0"
              rows={3}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id={defaultCheckboxId}
          checked={value.isDefault}
          onCheckedChange={(checked) => patch({ isDefault: checked === true })}
        />
        <Label htmlFor={defaultCheckboxId} className="cursor-pointer">
          Set as default address
        </Label>
      </div>
    </div>
  );
}
