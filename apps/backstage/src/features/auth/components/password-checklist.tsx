import { Icon } from "@luminova/ui";
import { PASSWORD_RULES } from "../types/password-policy";

export function PasswordChecklist({ value }: { value: string }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {PASSWORD_RULES.map((rule) => {
        const ok = rule.test(value);
        return (
          <li
            key={rule.id}
            className={
              ok
                ? "flex items-center gap-2 text-ui-xs text-ok"
                : "flex items-center gap-2 text-ui-xs text-ink-3"
            }
          >
            <span aria-hidden="true">{ok ? Icon.check({ s: 13 }) : Icon.close({ s: 13 })}</span>
            {rule.label}
          </li>
        );
      })}
    </ul>
  );
}
