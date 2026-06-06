import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Field, Input } from "@luminova/ui";
import { allySchema, type AllyInput } from "@luminova/types";

interface AllyFormProps {
  defaultValues?: Partial<AllyInput>;
  submitLabel: string;
  onSubmit: (data: AllyInput) => Promise<void>;
}

const EMPTY: AllyInput = {
  companyName: "",
  contactPerson: "",
  phone: "",
  email: "",
};

export function AllyForm({ defaultValues, submitLabel, onSubmit }: AllyFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AllyInput>({
    resolver: zodResolver(allySchema),
    defaultValues: { ...EMPTY, ...defaultValues },
  });

  const submit = handleSubmit(async (data) => {
    setFormError(null);
    try {
      await onSubmit(data);
    } catch {
      setFormError("No se pudo guardar. Intenta de nuevo.");
    }
  });

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <Field label="Empresa" htmlFor="companyName" required error={errors.companyName?.message}>
        <Input id="companyName" {...register("companyName")} />
      </Field>
      <Field
        label="Encargado"
        htmlFor="contactPerson"
        required
        error={errors.contactPerson?.message}
      >
        <Input id="contactPerson" {...register("contactPerson")} />
      </Field>
      <Field label="Teléfono" htmlFor="phone" required error={errors.phone?.message}>
        <Input id="phone" {...register("phone")} />
      </Field>
      <Field label="Correo" htmlFor="email" required error={errors.email?.message}>
        <Input id="email" type="email" {...register("email")} />
      </Field>
      {formError && (
        <div role="alert" className="text-[13px] text-[#c0392b]">
          {formError}
        </div>
      )}
      <Button as="button" type="submit" className="mt-1 w-full justify-center">
        {isSubmitting ? "Guardando…" : submitLabel}
      </Button>
    </form>
  );
}
