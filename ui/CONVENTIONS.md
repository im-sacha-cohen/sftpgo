# SFTPGo Console — conventions

The Console is a React SPA (`ui/`) that only talks to the SFTPGo REST API. It is
built into `static/console/` and served by SFTPGo at `<web base>/console`
(`internal/httpd/console.go`).

## Commands

```bash
npm run dev        # Vite on :5173, proxies /api and /static to 127.0.0.1:8080
npm run build      # type-check + build into ../static/console
npm run typecheck
npm run gen:api    # regenerate src/api/schema.d.ts from openapi/openapi.yaml
```

Demo data for a local instance: `node scripts/seed-dev.mjs` (see the header of the file).

## Hard UI rule

No native form widgets or browser dialogs: no `<select>`, no native date/time/colour
pickers, checkboxes, radios or ranges, no `<dialog>`, `alert`, `confirm`, `prompt`,
no `title=` tooltips. Use the components from `@/components/ui` (documented in
`src/components/ui/README.md`). Plain text inputs and textareas are fine through
`Input`/`Textarea`.

## Layout

- `src/app/` — shell (sidebar, top bar, ⌘K palette), routes, nav, page header.
- `src/pages/<feature>/` — one folder per screen. A feature owns its files:
  pages, sub-components, its CSS and its i18n dictionary.
- `src/api/client.ts` — `api.get/post/put/patch/del`, `request()` for raw bodies
  and downloads, `ApiError`, `can(permission)`.
- `src/api/types.ts` — aliases of every OpenAPI schema (`User`, `Group`,
  `EventRule`, `ConnectionStatus`…). Prefer them over hand-written types.
- `src/lib/` — `auth` (useAuth), `i18n` (useT, useCommon, useLang), `theme`,
  `format` (formatBytes, formatDate, formatRelative, formatDuration, GiB…), `config`.

## Pages

```tsx
import { Page, PageHeader, Columns } from '@/app/PageHeader';
import { useCommands } from '@/app/layout-context';

export default function UsersPage() {
  const t = useT(dict);
  useCommands([{ id: 'users:new', label: t('new'), group: t('title'), icon: Plus, run: () => navigate('/users/new') }]);
  return (
    <Page>
      <PageHeader title={t('title')} subtitle="48 comptes" crumbs={[{ label: 'Comptes' }]} actions={<Button …/>} />
      …
    </Page>
  );
}
```

- `PageHeader` sets the top-bar breadcrumbs and the browser title. Pass parent
  crumbs only; the current page is appended.
- Register useful actions of the page in the ⌘K palette with `useCommands`.
- Routes are already declared in `src/app/routes.tsx`; a page module default-exports
  its component. Detail routes use `:param`; the value `new` means "create".
- Data: `@tanstack/react-query` (`useQuery`, `useMutation`, invalidate on success).
  Query keys start with the resource name: `['users', …]`, `['groups']`.
- Errors: show `ApiError.message` in a toast (`useToast`) or inline; never swallow them.
- Destructive actions go through `useConfirm()`.
- Forms: keep a local draft object, compare with the loaded value to count changes,
  and show `SaveBar` while dirty (⌘S saves).
- Permissions: hide or disable what the admin cannot do (`useAuth().can('edit_users')`).

## i18n

French is the reference language, English is required too. Each feature keeps its
dictionary in its own file:

```ts
export const dict = { fr: { title: 'Utilisateurs' }, en: { title: 'Users' } } satisfies Dict;
const t = useT(dict); t('title'); t('count', { n: 3 })   // "{n} comptes"
```

Shared words (Enregistrer, Annuler, Supprimer…) come from `useCommon()`.

## Style

Use CSS variables from `src/styles/tokens.css` only (dark + light themes). Class
names are prefixed by feature (`.users-…`, `.rules-…`). Dense, keyboard-first,
technical values in `.mono`. Layouts must work down to phone width (wrap, scroll
wide tables inside their box).
