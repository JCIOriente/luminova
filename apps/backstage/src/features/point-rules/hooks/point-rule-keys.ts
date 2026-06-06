export const pointRuleKeys = {
  all: ["pointRules"] as const,
  byTerm: (termId: string) => ["pointRules", termId] as const,
};
