import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, DatePicker, Field, ImageUploader, Input } from "@luminova/ui";
import { selfProfileSchema, type Member, type SelfProfileInput } from "@luminova/types";
import { dateInputValue } from "../repositories/member-mapper";
import { useMemberPhoto } from "../hooks/use-member-photo";
import { useUpdateSelfProfile } from "../hooks/use-update-self-profile";

/** The four fields a member owns about themselves. Deliberately NOT MemberForm: that form
 *  carries name, email, status and cargo, which the rules' self lane rejects — offering
 *  them here would be a form that can never save. */
export function SelfProfileForm({ member }: { member: Member }) {
  const { onUpload, onRemove } = useMemberPhoto(member.id);
  const updateProfile = useUpdateSelfProfile(member.id);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SelfProfileInput>({
    resolver: zodResolver(selfProfileSchema),
    defaultValues: {
      phone: member.phone ?? "",
      profession: member.profession ?? "",
      birthdate: member.birthdate ? dateInputValue(member.birthdate) : "",
    },
  });

  const submit = handleSubmit(async (data) => {
    setStatus("idle");
    try {
      await updateProfile.mutateAsync(data);
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  });

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <ImageUploader
        currentSrc={member.profilePicture}
        name={member.name}
        onUpload={onUpload}
        onRemove={onRemove}
      />
      <Field label="Teléfono" htmlFor="self-phone" error={errors.phone?.message}>
        <Input
          id="self-phone"
          inputMode="numeric"
          maxLength={16}
          autoComplete="tel-national"
          placeholder="8 dígitos"
          {...register("phone")}
        />
      </Field>
      <Field label="Profesión" htmlFor="self-profession" error={errors.profession?.message}>
        <Input id="self-profession" {...register("profession")} />
      </Field>
      <Field
        label="Fecha de nacimiento"
        htmlFor="self-birthdate"
        required
        error={errors.birthdate?.message}
      >
        <Controller
          control={control}
          name="birthdate"
          render={({ field }) => (
            <DatePicker id="self-birthdate" value={field.value} onChange={field.onChange} />
          )}
        />
      </Field>
      <p className="text-ui-xs text-ink-3">
        Tu nombre, correo, cargo y estado los administra la Dirección de Membresía.
      </p>
      {status === "error" && (
        <div role="alert" className="text-ui-sm text-error">
          No se pudo guardar. Intenta de nuevo.
        </div>
      )}
      {status === "saved" && (
        <div role="status" className="text-ui-sm text-ink-2">
          Datos actualizados.
        </div>
      )}
      <Button as="button" type="submit" disabled={isSubmitting} className="w-full justify-center">
        {isSubmitting ? "Guardando…" : "Guardar cambios"}
      </Button>
    </form>
  );
}
