# SFTPGo Console — UI library

Everything is imported from `@/components/ui`. No third-party UI dependency: every control is custom
(no native `<select>`, date/number/checkbox inputs, `<dialog>`, `alert/confirm` or `title` tooltips).
Colours, spacing and fonts come from `src/styles/tokens.css`; class names are prefixed `c-`.
Default UI strings are French; most components accept label overrides.

Live demo: `src/pages/dev/ComponentsDemo.tsx` (route `/dev/components`).

```tsx
import { Button, Input, Select, useToast } from '@/components/ui';
```

## Setup

Mount the providers once (already done in `main.tsx`):

```tsx
<ToastProvider>
  <ConfirmProvider>{app}</ConfirmProvider>
</ToastProvider>
```

## Actions

```tsx
<Button variant="primary" icon={Plus} onClick={create}>Nouvel utilisateur</Button>
<Button variant="secondary|ghost|danger" size="sm" loading={saving} kbd="mod+s" iconRight={ChevronDown} />
<IconButton icon={Pencil} label="Modifier" />              // label = aria-label + tooltip; default variant ghost
<Kbd>mod+k</Kbd>  <Kbd combo={false}>G U</Kbd>               // "mod" → ⌘ on macOS, Ctrl elsewhere
<Tooltip content="Clé ajoutée le 12/11"><Badge tabIndex={0}>ssh-ed25519</Badge></Tooltip>
```

`Button` and `IconButton` forward refs and accept every native button prop. The `Tooltip` child must accept a ref.

## Form fields

All fields take `label`, `hint`, `error`, `required` and render through `Field` (real `<label htmlFor>`,
hint/error wired with `aria-describedby`).

```tsx
<Input label="Nom d'utilisateur" mono required value={v} onChange={(e) => setV(e.target.value)}
       error={err} hint="Identifiant SFTP" prefix={<Search size={14} />} suffix="Mo" size="sm" />
<Textarea label="Description" rows={3} labelAside={`${n}/255`} />
<PasswordInput label="Mot de passe" value={pw} onChange={(e) => setPw(e.target.value)} />
<NumberInput label="Quota" unit="Mo" min={0} max={1e6} step={512} value={q} onChange={setQ} />  // value: number | null
<Field id="x" label="Custom" hint="…"><MyControl id="x" /></Field>                               // wrap your own control
```

`NumberInput`: ↑/↓ (Shift ×10), PageUp/PageDown, Home/End; accepts "1,5". Values are clamped on blur.
`Input` only accepts text-like `type`s (`text|password|email|search|url|tel`).

## Choices

```tsx
<Checkbox checked={c} onChange={setC} label="Lister" description="…" />
<Checkbox checked={all} indeterminate={some} onChange={toggleAll} aria-label="Tout sélectionner" />
<Switch checked={on} onChange={setOn} label="2FA obligatoire" description="…" labelPosition="end" size="sm" />
<SegmentedControl aria-label="Protocole" value={p} onChange={setP}
  options={[{ value: 'all', label: 'Tous', count: 128 }, { value: 'sftp', label: 'SFTP', icon: Terminal }]} />
<RadioCards label="Stockage" value={b} onChange={setB} columns={3}
  options={[{ value: 's3', label: 'Amazon S3', description: 'Compatible MinIO', icon: Cloud }]} />
```

## Lists

```tsx
<Select label="Backend" value={b} onChange={setB} placeholder="Choisir…" searchable size="sm" mono
  options={[{ value: 's3', label: 'Amazon S3', description: 'eu-west-3', icon: Cloud, disabled: false }]} />
<MultiSelect label="Permissions" values={perms} onChange={setPerms} options={PERMS} maxChips={3} />
<TagInput label="IP autorisées" mono values={ips} onChange={setIps}
  validate={(v) => (isIp(v) ? null : 'IP invalide')} transform={(v) => v.toLowerCase()} />
```

- `Select<T extends string>`: `value: T | null`, `onChange(value: T)`. Keyboard: ↑↓ Home End PageUp/Down,
  Enter, Esc, type-ahead; opens above when there is no room below; closes on outside click, Esc or scroll of an ancestor.
- `MultiSelect`: searchable by default, "Effacer" in the footer. Option `label` must be a string (search/type-ahead).
- `TagInput`: Enter, `,` or `;` adds; pasting "a, b c" adds several; Backspace on an empty field removes the last chip;
  duplicates rejected unless `allowDuplicates`. Rejected text stays in the field with the error under it.
- All three accept `name` (hidden inputs for native form posts).

## Dates

```tsx
<DatePicker label="Expiration" value={d} onChange={setD} clearable min={new Date()} />
<DatePicker label="Planifiée" value={d} onChange={setD} withTime locale="en-GB" />
```

`value: Date | null`. Weeks start on Monday, locale defaults to `fr-FR`. Grid keys: arrows, Home/End (week),
PageUp/PageDown (month, +Shift = year), Enter. `labels={{ today: '…' }}` overrides strings.

## Overlays

```tsx
<Menu trigger={<IconButton icon={Ellipsis} label="Actions" />} placement="bottom-end" items={[
  { label: 'Modifier', icon: Pencil, kbd: 'E', onSelect: edit },
  'separator',
  { label: 'Supprimer', icon: Trash2, danger: true, disabled: !canDelete, onSelect: remove },
]} />

<Modal open={open} onClose={close} title="Nouvel utilisateur" description="…" size="sm|md|lg"
       footer={<><Button variant="ghost" onClick={close}>Annuler</Button><Button variant="primary">Créer</Button></>}>
  …
</Modal>
<Drawer open={!!user} onClose={() => setUser(null)} title={user?.username} size="md">…</Drawer>

const confirm = useConfirm();
if (await confirm({ title: 'Supprimer partenaire-acme ?', message: '…', confirmLabel: 'Supprimer', danger: true })) …

const { toast } = useToast();            // or: const toast = useToast(); toast({...})
toast({ title: 'Utilisateur créé', description: 'partenaire-acme', tone: 'ok' });   // tone: ok | warn | bad | neutral
toast({ title: 'Échec', tone: 'bad', duration: 0, action: { label: 'Réessayer', onClick: retry } });

<CommandPalette open={open} onClose={() => setOpen(false)} commands={[
  { id: 'users', label: 'Utilisateurs', group: 'Navigation', icon: Users, shortcut: 'G U', keywords: ['comptes'], run: () => navigate('/users') },
]} />
```

- Modal/Drawer: portal, focus trap, Esc, focus restored to the opener, body scroll lock, `role="dialog" aria-modal`.
  First text field gets focus (or `initialFocusRef`, or an element with `data-autofocus`).
- Menu triggers must forward refs (Button/IconButton do). ↑↓ Home End, type-ahead, Esc returns focus.
- `Popover` (low level): `<Popover anchorRef={ref} open onClose placement="bottom-start" matchWidth closeOnAncestorScroll>`.
  `usePosition(anchorRef, floatingRef, { enabled, placement, offset, matchWidth })` if you build your own floating UI.
  Popovers/tooltips render above modals.

## Navigation

```tsx
<Tabs idBase="user" value={tab} onChange={setTab}
  tabs={[{ id: 'general', label: 'Général' }, { id: 'acl', label: 'Permissions', count: 12 }]} />
<TabPanel idBase="user" id={tab}>…</TabPanel>

<FilterChips aria-label="Statut" value={f} onChange={setF}
  chips={[{ id: 'all', label: 'Tous', count: 42 }, { id: 'expired', label: 'Expirés', count: 3, tone: 'warn' }]} />

<Pagination page={page} pageSize={50} total={1284} onPageChange={setPage}
            pageSizeOptions={[25, 50, 100]} onPageSizeChange={setPageSize} />
<Pagination page={page} pageSize={50} hasMore={rows.length === 50} pageCount={rows.length} onPageChange={setPage} />
```

## Data display

```tsx
<Badge tone="neutral|ok|warn|bad|accent" mono dot icon={KeyRound}>v2.6.4</Badge>
<StatusDot tone="ok" label="Actif" pulse />
<ProgressBar value={used} max={quota} label="Quota" valueText="9,2 Go / 10 Go" />   // tone auto: ≥90 % bad, ≥80 % warn
<Card title="Serveur" description="…" actions={<IconButton …/>} footer={…} padded={false}>…</Card>
<KeyValue columns={2} labelWidth={120} items={[{ label: 'Bucket', value: 's3://acme', mono: true }]} />
```

## DataTable

```tsx
const columns: Column<User>[] = [
  { id: 'username', header: 'Utilisateur', sortable: true, mono: true, cell: (u) => u.username },
  { id: 'quota', header: 'Quota', align: 'right', width: 160, cell: (u) => <ProgressBar value={u.used} max={u.quota} size="sm" /> },
  { id: 'actions', header: <span className="sr-only">Actions</span>, width: 48, cell: (u) => <Menu … /> },
];

<DataTable columns={columns} rows={users} rowKey={(u) => u.username}
  selectable selected={sel} onSelectionChange={setSel}          // Set<string> of row keys
  sort={sort} onSortChange={setSort}                            // { id, dir: 'asc'|'desc' } | null (asc → desc → none)
  loading={isLoading} empty={<EmptyState icon={Users} title="Aucun utilisateur" />}
  onRowClick={(u) => navigate(`/users/${u.username}`)} maxHeight={520} dense />
```

Sorting is controlled: sort `rows` yourself. Clicks on buttons/links/menus inside cells do not trigger `onRowClick`.
The header is sticky inside the scroll container (set `maxHeight` for vertical scroll). `Column` is also exported as `DataTableColumn`.

## States

```tsx
<EmptyState icon={Inbox} title="Aucun élément" description="…" action={<Button>Créer</Button>} compact />
<Skeleton width={120} height={12} />  <Skeleton lines={3} />  <Skeleton circle height={32} />
<Spinner size={16} label="Chargement…" />          // label={null} = decorative
```

## Files and saving

```tsx
<FileDrop label="Importer une sauvegarde" hint=".json" accept=".json" onFiles={(files) => …} multiple compact />

<SaveBar dirtyCount={n} saving={mutation.isPending} onCancel={reset} onSave={save} />
```

`SaveBar` is sticky at the bottom of its scroll container, hidden when `dirtyCount` is 0, and binds ⌘S / Ctrl+S
while mounted (also inside inputs).

## Hooks and helpers

```ts
useHotkey('mod+k', () => setOpen(true), { allowInInputs: true });   // also ['mod+k', '/'], 'shift+?', 'escape'
useControllableState({ value, defaultValue, onChange });
useOutsideClick([ref1, ref2], close, open);
useStableId('prefix', props.id);   useScrollLock(open);   useFocusReturn(open);   trapTabKey(e, rootEl);
cx('a', cond && 'b');   formatShortcut('mod+shift+p');   normalizeText('Élément') // 'element'
```
