import type { ReactNode } from "react";
import {
  useFieldArray,
  type ArrayPath,
  type Control,
  type FieldArray,
  type FieldValues,
} from "react-hook-form";
import { Icon, IconButton } from "@luminova/ui";

interface FieldArrayRowsProps<TForm extends FieldValues> {
  control: Control<TForm>;
  name: ArrayPath<TForm>;
  makeBlank: () => FieldArray<TForm, ArrayPath<TForm>>;
  addLabel: string;
  itemNoun: string;
  renderRow: (index: number) => ReactNode;
}

export function FieldArrayRows<TForm extends FieldValues>({
  control,
  name,
  makeBlank,
  addLabel,
  itemNoun,
  renderRow,
}: FieldArrayRowsProps<TForm>) {
  const { fields, append, remove, move } = useFieldArray({ control, name });

  return (
    <div className="flex flex-col gap-3">
      {fields.map((field, index) => (
        <div
          key={field.id}
          className="flex items-start gap-3 rounded-[12px] border border-line bg-surface-2 p-3"
        >
          <div className="min-w-0 flex-1">{renderRow(index)}</div>
          <div className="flex shrink-0 items-center gap-1">
            <IconButton
              as="button"
              variant="subtle"
              aria-label={`Subir ${itemNoun} ${index + 1}`}
              disabled={index === 0}
              onClick={() => move(index, index - 1)}
            >
              <span className="block -rotate-90">{Icon.chevRight({ s: 16 })}</span>
            </IconButton>
            <IconButton
              as="button"
              variant="subtle"
              aria-label={`Bajar ${itemNoun} ${index + 1}`}
              disabled={index === fields.length - 1}
              onClick={() => move(index, index + 1)}
            >
              <span className="block rotate-90">{Icon.chevRight({ s: 16 })}</span>
            </IconButton>
            <IconButton
              as="button"
              variant="danger"
              aria-label={`Eliminar ${itemNoun} ${index + 1}`}
              onClick={() => remove(index)}
            >
              {Icon.close({ s: 16 })}
            </IconButton>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => append(makeBlank())}
        className="flex w-full items-center justify-center gap-2 rounded-[12px] border-[1.5px] border-dashed border-line-strong py-2.5 text-[13px] font-semibold text-jci-blue transition-colors duration-200 ease-expo hover:border-jci-blue hover:bg-jci-blue/[0.04] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-jci-blue"
      >
        {Icon.plus({ s: 16 })}
        {addLabel}
      </button>
    </div>
  );
}
