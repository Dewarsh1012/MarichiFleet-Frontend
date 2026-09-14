import { createFileRoute } from "@tanstack/react-router";
import { Download, ShieldCheck } from "lucide-react";
import { DataTable } from "@/components/mf/data-table";
import { NoAccess, PageHeader } from "@/components/mf/primitives";
import { Button } from "@/components/ui/button";
import { fmtDateTime, useDb } from "@/domain/hooks";
import { useSession } from "@/domain/session";
import type { AuditEntry } from "@/domain/types";

export const Route = createFileRoute("/app/audit")({
  head: () => ({
    meta: [
      { title: "Audit log — MarichiFleet" },
      { name: "description", content: "Immutable record of every operational and financial state change." },
    ],
  }),
  component: Audit,
});

function Audit() {
  const db = useDb();
  const { can } = useSession();

  if (!can("view_admin") && !can("audit:read")) {
    return (
      <>
        <PageHeader title="Audit log" />
        <NoAccess what="the audit log" />
      </>
    );
  }

  const exportCsv = () => {
    const headers = ["Timestamp", "Actor", "Action", "Entity Type", "Entity ID", "From State", "To State"];
    const rows = db.audit.map((a) => [
      a.atISO,
      a.actor,
      `"${(a.action || "").replace(/"/g, '""')}"`,
      a.entity,
      a.entityId,
      a.from || "",
      a.to || "",
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `marichifleet-audit-log-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader
        title="Audit log"
        subtitle="Immutable event reduction history — who did what, to which record, and when."
        actions={
          <Button size="sm" variant="outline" className="gap-1.5" onClick={exportCsv}>
            <Download className="size-3.5" /> Export Audit to CSV
          </Button>
        }
      />
      <DataTable<AuditEntry>
        rows={db.audit}
        searchKeys={(a) => `${a.actor} ${a.action} ${a.entity} ${a.entityId}`}
        chips={[
          { id: "booking", label: "Bookings", test: (a) => a.entity === "booking" },
          { id: "trip", label: "Trips", test: (a) => a.entity === "trip" },
          { id: "invoice", label: "Invoices", test: (a) => a.entity === "invoice" },
          { id: "vehicle", label: "Fleet", test: (a) => a.entity === "vehicle" },
          { id: "tenant", label: "Settings", test: (a) => a.entity === "tenant" || a.entity === "branch" },
        ]}
        emptyTitle="No activity recorded"
        emptyMessage="Actions taken in the app appear here immediately."
        columns={[
          { key: "at", header: "When", cell: (a) => fmtDateTime(a.atISO), sortValue: (a) => a.atISO },
          { key: "actor", header: "Actor", cell: (a) => <span className="font-medium">{a.actor}</span> },
          { key: "action", header: "Action", cell: (a) => a.action },
          {
            key: "entity",
            header: "Entity",
            cell: (a) => (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-muted text-muted-foreground uppercase tracking-wide">
                {a.entity}
              </span>
            ),
            hideOnMobile: true,
          },
          {
            key: "change",
            header: "State Transition",
            cell: (a) => (a.from && a.to ? <span className="text-xs text-primary font-mono">{a.from} → {a.to}</span> : <span className="text-muted-foreground">—</span>),
            hideOnMobile: true,
          },
        ]}
      />
    </>
  );
}
