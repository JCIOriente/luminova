import { Field, Select } from "@luminova/ui";
import type { Activity } from "@luminova/types";
import { CATEGORY_LABELS } from "../../activities/category-labels";

interface ActivityPickerProps {
  activities: Activity[];
  value: string | null;
  onChange: (id: string) => void;
}

const DATE_FORMAT = new Intl.DateTimeFormat("es-BO", { dateStyle: "short", timeStyle: "short" });

export function ActivityPicker({ activities, value, onChange }: ActivityPickerProps) {
  return (
    <Field label="Actividad" htmlFor="activity">
      <Select id="activity" value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
        <option value="" disabled>
          Selecciona una actividad…
        </option>
        {activities.map((activity) => (
          <option key={activity.id} value={activity.id}>
            {CATEGORY_LABELS[activity.category]} · {DATE_FORMAT.format(activity.startAt.toDate())}
          </option>
        ))}
      </Select>
    </Field>
  );
}
