"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Spinner } from "@/components/ui/misc";

/** Submit button that disables itself and shows a spinner while the form posts. */
export function SubmitButton({ children, pendingText, ...props }: ButtonProps & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button {...props} type="submit" disabled={pending || props.disabled} aria-busy={pending}>
      {pending ? (
        <>
          <Spinner className="border-current border-t-transparent" />
          {pendingText ?? "Working…"}
        </>
      ) : (
        children
      )}
    </Button>
  );
}

/** Submit button that asks for confirmation first (destructive actions). */
export function ConfirmSubmitButton({
  children,
  confirmText,
  ...props
}: ButtonProps & { confirmText: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      {...props}
      type="submit"
      disabled={pending || props.disabled}
      onClick={(e) => {
        if (!window.confirm(confirmText)) e.preventDefault();
      }}
    >
      {children}
    </Button>
  );
}
