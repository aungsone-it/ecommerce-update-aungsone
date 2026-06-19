/** Shared admin panel skeletons — match live super-admin / vendor-admin shells. */

export function AdminPanelContentSkeleton() {
  return (
    <div className="p-4 sm:p-8">
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-slate-200" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-white shadow-sm ring-1 ring-slate-200" />
          ))}
        </div>
        <div className="h-96 animate-pulse rounded-2xl bg-white shadow-sm ring-1 ring-slate-200" />
      </div>
    </div>
  );
}

function AdminSidebarSkeleton({ itemCount = 8 }: { itemCount?: number }) {
  return (
    <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white h-screen">
      <div className="h-16 flex items-center px-6 border-b border-slate-200 animate-pulse">
        <div className="h-9 w-9 rounded-lg bg-slate-200 mr-3" />
        <div className="h-5 w-28 rounded bg-slate-200" />
      </div>
      <div className="flex-1 p-4 space-y-2">
        {Array.from({ length: itemCount }).map((_, i) => (
          <div key={i} className="h-10 rounded-lg bg-slate-100 animate-pulse" />
        ))}
      </div>
      <div className="p-4 border-t border-slate-200 animate-pulse">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-slate-200" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-24 rounded bg-slate-200" />
            <div className="h-3 w-32 rounded bg-slate-200" />
          </div>
        </div>
      </div>
    </aside>
  );
}

function AdminTopBarSkeleton() {
  return (
    <header className="h-16 bg-white border-b border-slate-200 shrink-0">
      <div className="h-full px-4 md:px-6 flex items-center justify-between gap-4 animate-pulse">
        <div className="h-9 w-9 rounded-lg bg-slate-200 lg:hidden" />
        <div className="hidden sm:block h-10 flex-1 max-w-xl mx-auto rounded-lg bg-slate-100" />
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-full bg-slate-200" />
          <div className="h-9 w-9 rounded-full bg-slate-200" />
          <div className="h-9 w-24 rounded-full bg-slate-200 hidden md:block" />
        </div>
      </div>
    </header>
  );
}

/** Full super-admin shell while route chunks or first section load. */
export function SuperAdminPanelSkeleton() {
  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <AdminSidebarSkeleton />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <AdminTopBarSkeleton />
        <main className="flex-1 overflow-auto">
          <AdminPanelContentSkeleton />
        </main>
      </div>
    </div>
  );
}

/** Full vendor-admin shell while route chunks, auth, or first section load. */
export function VendorAdminPanelSkeleton() {
  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <AdminSidebarSkeleton itemCount={7} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <AdminTopBarSkeleton />
        <main className="flex-1 overflow-auto">
          <AdminPanelContentSkeleton />
        </main>
      </div>
    </div>
  );
}
