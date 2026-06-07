import { Field, Select, Combobox, type ComboboxOption } from "@luminova/ui";
import type { InitiativeKind } from "@luminova/types";

interface ParentPickerProps {
  parentType: InitiativeKind | null;
  parentId: string | null;
  programOptions: ComboboxOption[];
  projectOptions: ComboboxOption[];
  onParentTypeChange: (t: InitiativeKind) => void;
  onParentIdChange: (id: string | null) => void;
  error?: string;
}

export function ParentPicker({
  parentType,
  parentId,
  programOptions,
  projectOptions,
  onParentTypeChange,
  onParentIdChange,
  error,
}: ParentPickerProps) {
  const options = parentType === "Program" ? programOptions : projectOptions;
  return (
    <div className="flex flex-col gap-4">
      <Field label="Tipo de padre" htmlFor="parentType">
        <Select
          id="parentType"
          value={parentType ?? "Project"}
          onChange={(e) => {
            onParentTypeChange(e.target.value as InitiativeKind);
            onParentIdChange(null);
          }}
        >
          <option value="Project">Proyecto</option>
          <option value="Program">Programa</option>
        </Select>
      </Field>
      <Field label="Padre" htmlFor="parentValue" error={error}>
        <Combobox
          id="parentValue"
          options={options}
          value={parentId}
          onChange={onParentIdChange}
          placeholder={parentType === "Program" ? "Elegir programa" : "Elegir proyecto"}
        />
      </Field>
    </div>
  );
}
