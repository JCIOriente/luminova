import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Field, Input, Select } from "@luminova/ui";
import {
  allySchema,
  ALLY_CATEGORIES,
  ALLY_CATEGORY_LABELS,
  type AllyInput,
  type Ally,
} from "@luminova/types";
import { LogoUploader } from "./logo-uploader";

interface AllyFormProps {
  ally?: Ally;
  submitLabel: string;
  onSubmit: (data: AllyInput) => Promise<void>;
  onUploadLogo?: (file: File) => Promise<void>;
  onRemoveLogo?: () => Promise<void>;
}

function toDefaults(ally?: Ally): AllyInput {
  return {
    companyName: ally?.companyName ?? "",
    contactPerson: ally?.contactPerson ?? "",
    phone: ally?.phone ?? "",
    email: ally?.email ?? "",
    category: ally?.category ?? undefined,
  };
}

export function AllyForm({
  ally,
  submitLabel,
  onSubmit,
  onUploadLogo,
  onRemoveLogo,
}: AllyFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AllyInput>({
    resolver: zodResolver(allySchema),
    defaultValues: toDefaults(ally),
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
        <Input
          id="phone"
          inputMode="numeric"
          maxLength={16}
          autoComplete="tel-national"
          placeholder="8 dígitos"
          {...register("phone")}
        />
      </Field>
      <Field label="Correo" htmlFor="email" required error={errors.email?.message}>
        <Input id="email" type="email" {...register("email")} />
      </Field>
      <Field label="Categoría" htmlFor="category" error={errors.category?.message}>
        <Select
          id="category"
          {...register("category", { setValueAs: (v) => (v === "" ? undefined : v) })}
        >
          <option value="">Sin categoría</option>
          {ALLY_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {ALLY_CATEGORY_LABELS[c]}
            </option>
          ))}
        </Select>
      </Field>

      {ally && onUploadLogo && onRemoveLogo ? (
        <LogoUploader
          currentSrc={ally.logoUrl}
          onUpload={onUploadLogo}
          onRemove={onRemoveLogo}
          disabled={isSubmitting}
        />
      ) : (
        <p className="text-ui-sm text-ink-2">
          Guarda el aliado y vuelve a editarlo para añadir su logo.
        </p>
      )}

      {formError && (
        <div role="alert" className="text-ui-sm text-error">
          {formError}
        </div>
      )}
      <Button as="button" type="submit" className="mt-1 w-full justify-center">
        {isSubmitting ? "Guardando…" : submitLabel}
      </Button>
    </form>
  );
}
