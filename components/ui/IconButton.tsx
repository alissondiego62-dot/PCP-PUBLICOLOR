import type { ButtonHTMLAttributes } from "react";
import { AppIcon, type AppIconName } from "@/components/ui/AppIcon";

export function IconButton({ icon, label, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: AppIconName; label: string }) {
  return <button {...props} type={props.type || "button"} className={`icon-button ${className}`.trim()} aria-label={label} title={label}><AppIcon name={icon} /></button>;
}
