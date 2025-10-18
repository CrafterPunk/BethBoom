"use client";

import { useFormState, useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

export function AccessForm() {
  const [state, formAction] = useFormState(loginAction, initialState);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background/60 to-background">
      <Card className="w-full max-w-md border-border/80 bg-card/80 backdrop-blur">
        <CardHeader>
          <CardTitle>Acceso BethBoom</CardTitle>
          <CardDescription>Ingresa tu AccessCode entregado por la administracion.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="accessCode">AccessCode</Label>
              <Input
                id="accessCode"
                name="accessCode"
                placeholder="owner-AAAA1111"
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
    </div>
  );
}
