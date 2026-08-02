import { useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Checkbox, DatePicker, Field, Input } from "@luminova/ui";
import {
  selfProfileSchemaFor,
  MEMBER_NAME_MAX_LENGTH,
  type Member,
  type SelfProfileInput,
} from "@luminova/types";
import { dateInputValue } from "../repositories/member-mapper";
import { useUpdateSelfProfile } from "../hooks/use-update-self-profile";

/** The fields a member owns about themselves. Deliberately NOT MemberForm: that form
 *  carries email, status and cargo, which the rules' self lane rejects — offering them here
 *  would be a form that can never save. The photo is not here either: it is its own write
 *  (setProfilePicture) and the credential card above already owns that control. */
export function SelfProfileForm({ member }: { member: Member }) {
  const updateProfile = useUpdateSelfProfile(member.id);
  // Keyed on the stored name so an untouched legacy value doesn't block the other fields —
  // see memberNameOrUnchanged. useMemo so the resolver isn't rebuilt every render.
  const schema = useMemo(() => selfProfileSchemaFor(member.name), [member.name]);
  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SelfProfileInput>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: member.name,
      phone: member.phone ?? "",
      profession: member.profession ?? "",
      birthdate: member.birthdate ? dateInputValue(member.birthdate) : "",
      publicProfile: member.publicProfile ?? false,
    },
  });

  // The mutation already tracks pending/success/error — a parallel useState would be a
  // second source of truth for "did the last save work".
  const submit = handleSubmit((data) => updateProfile.mutateAsync(data).catch(() => {}));

  // The public projection (beacon projectBoard) drops a member with no portrait, so
  // consent alone publishes nothing. Without this the opt-in looks saved and simply
  // never appears — the exact silent failure that hid a director from the site.
  const missingPhoto = watch("publicProfile") === true && !member.profilePicture;

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <Field label="Nombre" htmlFor="self-name" required error={errors.name?.message}>
        <Input
          id="self-name"
          maxLength={MEMBER_NAME_MAX_LENGTH}
          autoComplete="name"
          {...register("name")}
        />
      </Field>
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
      <div className="flex flex-col gap-2 border-t border-line pt-5">
        <Controller
          control={control}
          name="publicProfile"
          render={({ field }) => (
            <Checkbox
              id="self-public-profile"
              checked={field.value ?? false}
              onChange={field.onChange}
              label="Mostrar mi perfil en la Directiva del sitio público"
            />
          )}
        />
        <p className="text-ui-xs text-ink-3">
          Si tienes un cargo de directiva este año, tu foto y nombre aparecerán en la sección
          Directiva de jcioriente.org. Puedes desactivarlo cuando quieras.
        </p>
        {missingPhoto && (
          <p role="status" className="text-ui-xs font-medium text-warn">
            Te falta subir tu foto de perfil: sin foto no apareces en la Directiva del sitio
            público, aunque dejes esta casilla marcada.
          </p>
        )}
      </div>
      <p className="text-ui-xs text-ink-3">
        Tu correo, cargo y estado los administra la Dirección de Membresía.
      </p>
      {updateProfile.isError && (
        <div role="alert" className="text-ui-sm text-error">
          No se pudo guardar. Intenta de nuevo.
        </div>
      )}
      {updateProfile.isSuccess && (
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
