# Backstage — Claude Code Guide

## Purpose

Admin dashboard for JCI Oriente leadership. Manages members, events, point rules, and allies. Auth required for all routes except `/login`.

## Routing (TanStack Router — file-based)

Routes live in `src/routes/`. File name = URL segment.

| File | Route | Notes |
|------|-------|-------|
| `__root.tsx` | — | Root layout, QueryClientProvider, RouterDevtools |
| `_auth.tsx` | — | Auth layout (no sidebar, centered card) |
| `_auth.login.tsx` | `/login` | Public |
| `_app.tsx` | — | Protected layout (sidebar) — redirects to `/login` if no auth |
| `_app.index.tsx` | `/` | Dashboard |
| `_app.members.tsx` | `/members` | Members management |
| `_app.events.tsx` | `/events` | Events management |
| `_app.point-rules.tsx` | `/point-rules` | Point rules matrix |
| `_app.allies.tsx` | `/allies` | Partner management |
| `_app.settings.tsx` | `/settings` | Settings placeholder |

Underscore prefix (`_auth`, `_app`) = pathless layout route (no URL segment added).

## Route Guard Pattern

In `_app.tsx` layout:
```tsx
const { data: user } = useAuth()
if (!user) throw redirect({ to: '/login' })
```

Use `beforeLoad` in route definition for the redirect, not inside the component.

## Feature Folder Structure

Each feature in `src/features/<name>/`:
```
features/
  members/
    components/     ← UI components (MemberTable, MemberForm, etc.)
    hooks/          ← TanStack Query hooks (useMembers, useAddMember, etc.)
    repositories/   ← Firestore access (MemberRepository class)
    types/          ← Zod schemas + TypeScript types
```

No `index.ts` barrel files. Import directly:
```ts
// Good
import { MemberRepository } from '../repositories/member-repository'
// Bad
import { MemberRepository } from '../repositories'
```

## Repository Pattern

One class per Firestore collection:
```ts
class MemberRepository {
  private collection = collection(db, 'members')
  
  async getAll(): Promise<Member[]> { ... }
  async getById(id: string): Promise<Member | null> { ... }
  async create(data: MemberInput): Promise<Member> { ... }
  async update(id: string, data: Partial<MemberInput>): Promise<void> { ... }
  async softDelete(id: string): Promise<void> { ... }  // sets deletedAt + active:false
}
```

## TanStack Query Conventions

Query keys:
```ts
const memberKeys = {
  all: ['members'] as const,
  paginated: (cursor: string | null) => ['members', 'paginated', cursor] as const,
}
```

Hooks:
```ts
// useMembers.ts
export function useMembers() {
  return useQuery({
    queryKey: memberKeys.all,
    queryFn: () => new MemberRepository().getAll(),
  })
}

// useAddMember.ts
export function useAddMember() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: MemberInput) => new MemberRepository().create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: memberKeys.all }),
  })
}
```

## Form Pattern

Every form uses React Hook Form + Zod:
```ts
// types/member-schema.ts
export const memberSchema = z.object({
  name: z.string().min(3),
  email: z.string().email(),
  phone: z.string().optional(),
  role: z.string().min(3),
})
export type MemberInput = z.infer<typeof memberSchema>

// components/MemberForm.tsx
const form = useForm<MemberInput>({
  resolver: zodResolver(memberSchema),
  defaultValues: { name: '', email: '', role: '' },
})
```

## UI Patterns

- **Forms in Sheet** (not Dialog) — better mobile UX, more space
- **Soft delete** for members — never hard delete, set `deletedAt: Timestamp` + `active: false`
- **Infinite scroll / cursor pagination** for members (10/page)
- **Combobox** for single member select (director)
- **Multi-select with search** for coDirectors, collaborators, participants
- **Conditional fields** — `parentId` only shown when event type = `Activity`

## Auth Flow

1. User visits any `_app.*` route → `beforeLoad` checks auth → redirects to `/login` if null
2. `/login` renders `LoginForm` → calls `useLogin()` → Firebase `signInWithEmailAndPassword`
3. On success → navigate to `/`
4. Sidebar logout button → `useLogout()` → Firebase `signOut()` → navigate to `/login`

## Firestore Data Access

Import db from `@luminova/firebase`:
```ts
import { db } from '@luminova/firebase'
import { collection, doc, getDocs, addDoc } from 'firebase/firestore'
```
