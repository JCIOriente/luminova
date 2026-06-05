import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Field, Input, Select } from "@luminova/ui";
import { memberSchema, type MemberInput, MEMBER_STATUSES } from "../types/member-schema";

interface MemberFormProps {
  defaultValues?: Partial<MemberInput>;
  submitLabel: string;
  onSubmit: (data: MemberInput) => Promise<void>;
}

const EMPTY: MemberInput = {
  name: "",
  email: "",
  phone: "",
  role: "",
  profession: "",
  joinDate: "",
  birthdate: "",
  status: "Activo",
};

export function MemberForm({ defaultValues, submitLabel, onSubmit }: MemberFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<MemberInput>({
    resolver: zodResolver(memberSchema),
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
      <Field label="Nombre" htmlFor="name" required error={errors.name?.message}>
        <Input id="name" {...register("name")} />
      </Field>
      <Field label="Correo" htmlFor="email" required error={errors.email?.message}>
        <Input id="email" type="email" {...register("email")} />
      </Field>
      <Field label="Teléfono" htmlFor="phone" error={errors.phone?.message}>
        <Input id="phone" {...register("phone")} />
      </Field>
      <Field label="Rol" htmlFor="role" required error={errors.role?.message}>
        <Input id="role" {...register("role")} />
      </Field>
      <Field label="Profesión" htmlFor="profession" error={errors.profession?.message}>
        <Input id="profession" {...register("profession")} />
      </Field>
      <Field label="Fecha de ingreso" htmlFor="joinDate" required error={errors.joinDate?.message}>
        <Input id="joinDate" type="date" {...register("joinDate")} />
      </Field>
      <Field
        label="Fecha de nacimiento"
        htmlFor="birthdate"
        required
        error={errors.birthdate?.message}
      >
        <Input id="birthdate" type="date" {...register("birthdate")} />
      </Field>
      <Field label="Estado" htmlFor="status" required error={errors.status?.message}>
        <Select id="status" {...register("status")}>
          {MEMBER_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </Select>
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
