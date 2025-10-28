"use client";

import { useFormState, useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import type { LoginState } from "./actions";
import { loginAction } from "./actions";

const initialState: LoginState = {
  status: "idle",
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Validando..." : "Ingresar"}
    </Button>
  );
}

type AccessFormProps = {
  className?: string;
  title?: string;
  description?: string;
};

export function AccessForm({ className, title = "Acceso BethBoom", description = "Ingresa tu AccessCode entregado por la administracion." }: AccessFormProps) {
  const [state, formAction] = useFormState(loginAction, initialState);

  return (
    <Card className={cn("w-full border-border/80 bg-card/80 backdrop-blur", className)}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="accessCode">AccessCode</Label>
            <Input
              id="accessCode"
              name="accessCode"
              autoFocus
              autoComplete="off"
              inputMode="text"
              required
            />
          </div>
          {state.status === "error" ? (
            <p className="text-sm text-destructive">{state.message ?? "No se pudo validar el AccessCode."}</p>
          ) : null}
          <SubmitButton />
        </form>
      </CardContent>
    </Card>
  );
}
