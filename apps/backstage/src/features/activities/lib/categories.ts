import { ACTIVITY_CATEGORIES, type ActivityCategory } from "@luminova/types";

/** Categories creatable as standalone activities (decision 7). ProjectExecution is created only from inside a parent initiative. */
export const STANDALONE_CATEGORIES: ActivityCategory[] = ACTIVITY_CATEGORIES.filter(
  (c) => c !== "ProjectExecution",
);
