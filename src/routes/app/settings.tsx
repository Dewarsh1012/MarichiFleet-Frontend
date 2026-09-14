import { createFileRoute } from "@tanstack/react-router";
import { Download, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { KpiCard, NoAccess, PageHeader, Panel, StatusBadge } from "@/components/mf/primitives";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getExtras, toggleFlag } from "@/domain/extras";
import { fmtDateTime, inr, useAction, useDb } from "@/domain/hooks";
import { PERSONAS, roleLabel, useSession } from "@/domain/session";
import { audit } from "@/domain/store";
import { useTheme } from "@/domain/theme";

export const Route = createFileRoute("/app/settings")({
  head: () => ({
    meta: [
      { title: "Settings — MarichiFleet" },
      { name: "description", content: "Company profile, branches, users and roles, rate cards, tax setup, message templates and appearance." },
      { property: "og:title", content: "Settings — MarichiFleet" },
      { property: "og:description", content: "Configure your company, team, rate cards, taxes and notifications." },
    ],
  }),
  component: Settings,
});

const TEMPLATES = [
  ["BOOKING_CONFIRMED", "Hi {client}, your booking {ref} is confirmed for pickup on {date}."],
  ["DRIVER_ASSIGNED", "{driver} ({vehicle}) is assigned to {ref}. Track live: {link}"],
  ["TRIP_DELAYED", "Trip {ref} is running {mins} minutes late. Updated ETA {eta}."],
  ["POD_AVAILABLE", "Delivery of {ref} is complete. Proof of delivery: {link}"],
  ["PAYMENT_REMINDER", "Invoice {ref} of {amount} is due on {date}. Pay here: {link}"],
];

function Settings() {
  const db = useDb();
  const extras = getExtras();
  const run = useAction();
  const { persona, can } = useSession();
  const { theme, setTheme } = useTheme();

  // Company profile form
  const [company, setCompany] = useState(db.tenant.name);
  const [gstin, setGstin] = useState("07AAAAA0000A1Z5");
  const [pan, setPan] = useState("AAAAA0000A");
  const [regAddress, setRegAddress] = useState("Plot 42, Okhla Industrial Area Phase III, New Delhi 110020");
  const [licenseNo, setLicenseNo] = useState("DL-TRANS-2026-9912");
  const [supportPhone, setSupportPhone] = useState("+91 98111 00001");
  const [supportEmail, setSupportEmail] = useState("support@marichifleet.com");
  const [taxPct, setTaxPct] = useState("12");

  // Add Branch dialog
  const [branchModalOpen, setBranchModalOpen] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [newBranchCity, setNewBranchCity] = useState("");

  if (!can("view_admin")) return <NoAccess what="company settings" />;

  const handleSaveProfile = () => {
    db.tenant.name = company;
    audit(persona.name, `Updated company profile to ${company} (GST: ${gstin})`, "tenant", db.tenant.id);
    toast.success("Company profile updated and saved to audit ledger!");
  };

  const handleAddBranch = () => {
    if (!newBranchName.trim() || !newBranchCity.trim()) {
      toast.error("Please enter branch name and operating city");
      return;
    }
    const branchId = `br_${Date.now()}`;
    db.branches.push({
      id: branchId,
      tenantId: db.tenant.id,
      name: newBranchName.trim(),
      city: newBranchCity.trim(),
      lat: 28.6139,
      lng: 77.209,
    });
    audit(persona.name, `Added operating branch ${newBranchName.trim()} (${newBranchCity.trim()})`, "branch", branchId);
    toast.success(`Branch ${newBranchName} added successfully!`);
    setNewBranchName("");
    setNewBranchCity("");
    setBranchModalOpen(false);
  };

  const exportAuditCsv = () => {
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
      <PageHeader title="Settings" subtitle="Company profile, branches, user permissions, audit trail, tax setup, and system appearance." />

      <Tabs defaultValue="company">
        <TabsList className="flex-wrap">
          <TabsTrigger value="company">Company Profile</TabsTrigger>
          <TabsTrigger value="branches">Branches & Hubs</TabsTrigger>
          <TabsTrigger value="audit">Audit Log</TabsTrigger>
          <TabsTrigger value="people">Users & Roles</TabsTrigger>
          <TabsTrigger value="pricing">Rate Cards & GST</TabsTrigger>
          <TabsTrigger value="messaging">WhatsApp Templates</TabsTrigger>
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
        </TabsList>

        {/* Company Profile Tab */}
        <TabsContent value="company" className="mt-4 space-y-4">
          <Panel title="Company Profile & Legal Details" description="Used on GST Tax Invoices, LR Consignment Notes, and WhatsApp alerts.">
            <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
              <div>
                <Label className="text-xs font-semibold">Registered Company Name</Label>
                <Input className="mt-1" value={company} onChange={(e) => setCompany(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs font-semibold">Company GSTIN</Label>
                <Input className="mt-1 font-mono uppercase" value={gstin} onChange={(e) => setGstin(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs font-semibold">PAN Number</Label>
                <Input className="mt-1 font-mono uppercase" value={pan} onChange={(e) => setPan(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs font-semibold">Transport Operating License (TOL)</Label>
                <Input className="mt-1 font-mono uppercase" value={licenseNo} onChange={(e) => setLicenseNo(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs font-semibold">Registered Head Office Address</Label>
                <Input className="mt-1" value={regAddress} onChange={(e) => setRegAddress(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs font-semibold">Operational Support Phone</Label>
                <Input className="mt-1 font-mono" value={supportPhone} onChange={(e) => setSupportPhone(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs font-semibold">Accounts / Billing Email</Label>
                <Input className="mt-1" value={supportEmail} onChange={(e) => setSupportEmail(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs font-semibold">Operating Country</Label>
                <Input className="mt-1 bg-muted/30" value={db.tenant.country} readOnly />
              </div>
              <div>
                <Label className="text-xs font-semibold">Billing Currency</Label>
                <Input className="mt-1 bg-muted/30" value={db.tenant.currency} readOnly />
              </div>
            </div>
            <div className="mt-5">
              <Button size="sm" className="bg-primary text-primary-foreground font-medium" onClick={handleSaveProfile}>
                Save Company Profile
              </Button>
            </div>
          </Panel>
        </TabsContent>

        {/* Branches & Operating Hubs Tab */}
        <TabsContent value="branches" className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Branches" value={String(db.branches.length)} hint="Depots in operation" />
            <KpiCard label="Vehicles" value={String(db.vehicles.length)} hint="Across all depots" />
            <KpiCard label="Drivers" value={String(db.drivers.length)} hint="On the roster" />
            <KpiCard label="Clients" value={String(db.clients.length)} hint="Active accounts" />
          </div>

          <Panel
            title="Operating Depots & Logistics Hubs"
            description="Manage your regional transit hubs, maintenance depots, and cross-docking centers."
            actions={
              <Button size="sm" className="gap-1.5" onClick={() => setBranchModalOpen(true)}>
                <Plus className="size-3.5" /> Add Operating Branch
              </Button>
            }
          >
            <ul className="space-y-2">
              {db.branches.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3 text-sm">
                  <div>
                    <span className="font-semibold">{b.name}</span>
                    <span className="text-xs text-muted-foreground block">{b.city}</span>
                  </div>
                  <span className="numeric text-xs px-2.5 py-1 rounded bg-muted font-medium text-muted-foreground">
                    {db.vehicles.filter((v) => v.branchId === b.id).length} vehicles assigned
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </TabsContent>

        {/* Audit Log Tab */}
        <TabsContent value="audit" className="mt-4 space-y-4">
          <Panel
            title="System Audit Ledger"
            description="Immutable record of every operational, dispatch, compliance, and financial event."
            actions={
              <Button size="sm" variant="outline" className="gap-1.5" onClick={exportAuditCsv}>
                <Download className="size-3.5" /> Export Audit Trail to CSV
              </Button>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 pr-3">Timestamp</th>
                    <th className="py-2 pr-3">Actor</th>
                    <th className="py-2 pr-3">Action Description</th>
                    <th className="py-2 pr-3">Entity</th>
                    <th className="py-2">State Transition</th>
                  </tr>
                </thead>
                <tbody>
                  {db.audit.slice(0, 30).map((a) => (
                    <tr key={a.id} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-3 text-xs text-muted-foreground font-mono">{fmtDateTime(a.atISO)}</td>
                      <td className="py-2 pr-3 font-medium">{a.actor}</td>
                      <td className="py-2 pr-3">{a.action}</td>
                      <td className="py-2 pr-3">
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-muted text-muted-foreground">
                          {a.entity}
                        </span>
                      </td>
                      <td className="py-2 text-xs">
                        {a.from && a.to ? <span className="font-mono text-primary">{a.from} → {a.to}</span> : <span className="text-muted-foreground">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </TabsContent>

        {/* Users & Roles Tab */}
        <TabsContent value="people" className="mt-4">
          <Panel title="Users & Roles" description="Roles decide navigation, page access and permissions in accordance with the 17-role enterprise model.">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 pr-3">User</th>
                    <th className="py-2 pr-3">Role</th>
                    <th className="py-2">Current Active Session</th>
                  </tr>
                </thead>
                <tbody>
                  {PERSONAS.map((p) => (
                    <tr key={p.id} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-3">
                        <span className="block font-medium">{p.name}</span>
                        <span className="text-xs text-muted-foreground">{p.title}</span>
                      </td>
                      <td className="py-2 pr-3">{roleLabel(p.role)}</td>
                      <td className="py-2">{p.id === persona.id ? <StatusBadge status="available" /> : <span className="text-xs text-muted-foreground">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </TabsContent>

        {/* Rate Cards & GST Tab */}
        <TabsContent value="pricing" className="mt-4 space-y-4">
          <Panel title="GST Tax Configuration">
            <div className="flex max-w-xs items-end gap-3">
              <div className="flex-1">
                <Label className="text-xs font-semibold">Standard Road Transport GST %</Label>
                <Input className="mt-1 font-mono" value={taxPct} inputMode="numeric" onChange={(e) => setTaxPct(e.target.value)} />
              </div>
              <Button size="sm" onClick={() => toast.success(`Default tax set to ${taxPct}%`)}>Save GST Rate</Button>
            </div>
          </Panel>
          <Panel title="Client Rate Cards (Freight Tariff)">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 pr-3">Client</th>
                    <th className="py-2 pr-3">Vehicle Type</th>
                    <th className="py-2 pr-3 text-right">Per KM Rate</th>
                    <th className="py-2 text-right">Minimum Charge</th>
                  </tr>
                </thead>
                <tbody>
                  {db.rateCards.slice(0, 24).map((rc) => (
                    <tr key={rc.id} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-3 font-medium">{db.clients.find((c) => c.id === rc.clientId)?.name ?? rc.clientId}</td>
                      <td className="py-2 pr-3">{rc.vehicleType}</td>
                      <td className="numeric py-2 pr-3 text-right">{inr(rc.perKm)}</td>
                      <td className="numeric py-2 text-right">{inr(rc.minCharge)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </TabsContent>

        {/* Messaging Templates Tab */}
        <TabsContent value="messaging" className="mt-4 space-y-4">
          <Panel title="WhatsApp Outbound Templates" description="Approved WhatsApp Business API notification templates.">
            <div className="space-y-3">
              {TEMPLATES.map(([name, text]) => (
                <div key={name} className="rounded-md border border-border p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-primary">{name}</span>
                    <span className="text-[11px] text-success font-medium">Meta Verified</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground font-mono bg-muted/30 p-2 rounded">{text}</p>
                </div>
              ))}
            </div>
          </Panel>
        </TabsContent>

        {/* Appearance Tab */}
        <TabsContent value="appearance" className="mt-4 space-y-4">
          <Panel title="Theme Setup">
            <div className="flex items-center justify-between max-w-sm">
              <div>
                <p className="text-sm font-medium">Dark Mode Control Tower</p>
                <p className="text-xs text-muted-foreground">High contrast for dispatch desks and night shifts</p>
              </div>
              <Switch checked={theme === "dark"} onCheckedChange={(c) => setTheme(c ? "dark" : "light")} />
            </div>
          </Panel>
        </TabsContent>
      </Tabs>

      {/* Add Branch Modal */}
      <Dialog open={branchModalOpen} onOpenChange={setBranchModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Operating Branch / Depot</DialogTitle>
            <DialogDescription>
              Register a new regional hub for vehicle allocation, fuel storage and crew operations.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Hub / Branch Name</Label>
              <Input
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                placeholder="e.g. Indore Transshipment Hub"
              />
            </div>
            <div>
              <Label className="text-xs">Operating City</Label>
              <Input
                value={newBranchCity}
                onChange={(e) => setNewBranchCity(e.target.value)}
                placeholder="e.g. Indore"
              />
            </div>
          </div>

          <DialogFooter className="flex gap-2 sm:justify-between">
            <Button variant="ghost" size="sm" onClick={() => setBranchModalOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleAddBranch}>
              Register Branch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
