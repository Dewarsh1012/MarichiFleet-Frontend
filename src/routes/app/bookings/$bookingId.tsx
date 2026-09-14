import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  CheckCircle,
  CheckCircle2,
  CreditCard,
  FileCheck,
  Receipt,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
  Truck,
  Upload,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Metric, PageHeader, Panel, StatusBadge } from "@/components/mf/primitives";
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
import { Separator } from "@/components/ui/separator";
import { fmtDate, fmtDateTime, inr, timeAgo, useAction, useDb } from "@/domain/hooks";
import { bookingOrder } from "@/domain/machines";
import { useSession } from "@/domain/session";
import {
  capturePod,
  confirmBooking,
  createInvoice,
  deleteBooking,
  dispatchBooking,
  invoiceEligibility,
  invoiceOutstanding,
  markVehicleDelivered,
  recordPayment,
  setBookingStatus,
  tripProfit,
} from "@/domain/store";

export const Route = createFileRoute("/app/bookings/$bookingId")({
  head: () => ({
    meta: [
      { title: "Booking detail — MarichiFleet" },
      { name: "description", content: "Full lifecycle of a freight order: dispatch, trip, POD, invoice and payment." },
    ],
  }),
  component: BookingDetail,
});

function BookingDetail() {
  const { bookingId } = Route.useParams();
  const db = useDb();
  const run = useAction();
  const navigate = useNavigate();
  const { persona, can } = useSession();

  // POD modal state
  const [podModalOpen, setPodModalOpen] = useState(false);
  const [receiverName, setReceiverName] = useState("");
  const [otp, setOtp] = useState("4821");
  const [signatureSeed, setSignatureSeed] = useState("SIG-BAY-" + Math.floor(1000 + Math.random() * 9000));
  const [photoNote, setPhotoNote] = useState("Consignment photo & signed physical gate pass verified at destination dock.");

  // Payment modal state
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState<string>("");
  const [paymentMode, setPaymentMode] = useState<"NEFT" | "UPI" | "Cheque" | "Cash">("NEFT");
  const [paymentRef, setPaymentRef] = useState<string>("");

  const b = db.bookings.find((x) => x.id === bookingId);
  if (!b) {
    return (
      <>
        <PageHeader title="Booking not found" breadcrumb={[{ label: "Bookings", to: "/app/bookings" }]} />
        <p className="text-sm text-muted-foreground">This booking reference no longer exists.</p>
      </>
    );
  }

  const client = db.clients.find((c) => c.id === b.clientId)!;
  const trip = db.trips.find((t) => t.id === b.tripId);
  const pod = db.pods.find((p) => p.bookingId === b.id);
  const invoice = db.invoices.find((i) => i.id === b.invoiceId);
  const history = db.audit.filter((a) => a.entityId === b.id || (trip && a.entityId === trip.id));
  const canInvoiceNow = invoiceEligibility(b.id);

  const outstanding = invoice ? invoiceOutstanding(invoice) : 0;

  const handleCapturePod = () => {
    if (!trip) {
      toast.error("Trip not linked to this booking");
      return;
    }
    const res = run(
      () =>
        capturePod({
          tripId: trip.id,
          receiverName: receiverName.trim() || client?.contactName || "Gate Officer",
          otp: otp.trim() || "4821",
          photoNote: photoNote.trim(),
          signatureSeed: signatureSeed.trim() || "SIG-VERIFIED",
          actor: persona.name,
        }),
      "Proof of Delivery verified and uploaded successfully!",
    );
    if (res.ok) {
      setPodModalOpen(false);
    }
  };

  const handleQuickPod = () => {
    if (!trip) return;
    run(
      () =>
        capturePod({
          tripId: trip.id,
          receiverName: client?.contactName || "Warehouse Supervisor",
          otp: "4821",
          photoNote: "Verified digital OTP and stamped gate receipt.",
          signatureSeed: "SIG-QUICK-" + Math.floor(1000 + Math.random() * 9000),
          actor: persona.name,
        }),
      "ePOD captured and verified instantly!",
    );
  };

  const handleCreateInvoice = () => {
    const res = run(() => createInvoice(b.id, persona.name), "Tax invoice generated successfully");
    if (res.ok && res.id) {
      navigate({ to: "/app/finance/invoices/$invoiceId", params: { invoiceId: res.id } });
    }
  };

  const handleRecordPayment = () => {
    if (!invoice) return;
    const amt = Number(paymentAmount) || outstanding;
    if (amt <= 0) {
      toast.error("Please enter a valid payment amount");
      return;
    }
    const res = run(
      () =>
        recordPayment(
          invoice.id,
          amt,
          paymentMode,
          paymentRef.trim() || `UTR${Date.now().toString().slice(-8)}`,
          persona.name,
        ),
      `Payment of ${inr(amt)} recorded successfully!`,
    );
    if (res.ok) {
      setPaymentModalOpen(false);
      setPaymentAmount("");
      setPaymentRef("");
    }
  };

  const handleCloseConsignment = () => {
    const res = run(() => setBookingStatus(b.id, "closed", persona.name), "Consignment reconciled, audited and closed!");
    if (res.ok) {
      toast.success(`Consignment ${b.ref} is now permanently closed.`);
    }
  };

  return (
    <>
      <PageHeader
        title={`${b.ref} · ${b.pickup.city} → ${b.drop.city}`}
        breadcrumb={[{ label: "Bookings", to: "/app/bookings" }, { label: b.ref }]}
        subtitle={`${client.name} · ${b.cargo} · ${b.weightTons}t · ${b.vehicleType}`}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={b.status} />

            {/* STAGE 1: DRAFT */}
            {can("edit_booking") && b.status === "draft" && (
              <Button size="sm" onClick={() => run(() => setBookingStatus(b.id, "submitted", persona.name), "Booking submitted")}>
                Submit Booking
              </Button>
            )}

            {/* STAGE 2: SUBMITTED */}
            {can("edit_booking") && b.status === "submitted" && (
              <Button
                size="sm"
                onClick={() => {
                  const res = run(() => confirmBooking(b.id, persona.name), "Booking confirmed");
                  if (res.ok) navigate({ to: "/app/dispatch", search: { booking: b.id } });
                }}
              >
                Confirm & Move to Dispatch <ArrowRight className="size-3.5 ml-1" />
              </Button>
            )}

            {/* STAGE 3: CONFIRMED */}
            {can("dispatch") && b.status === "confirmed" && (
              <Button size="sm" onClick={() => navigate({ to: "/app/dispatch", search: { booking: b.id } })}>
                Assign vehicle & Dispatch <ArrowRight className="size-3.5 ml-1" />
              </Button>
            )}

            {/* STAGE 4: ASSIGNED */}
            {can("dispatch") && b.status === "assigned" && (
              <>
                <Button size="sm" variant="outline" onClick={() => navigate({ to: "/app/dispatch", search: { booking: b.id } })}>
                  <RefreshCw className="size-3.5 mr-1" /> Reassign
                </Button>
                <Button
                  size="sm"
                  className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium gap-1.5"
                  onClick={() => run(() => dispatchBooking(b.id, persona.name), "Booking dispatched — vehicle is on trip")}
                >
                  <Truck className="size-3.5" /> Dispatch Load
                </Button>
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-sm gap-1.5"
                  onClick={() => run(() => markVehicleDelivered(b.id, persona.name), `Vehicle marked delivered for ${b.ref}`)}
                >
                  <CheckCircle className="size-3.5" /> Mark Vehicle Delivered
                </Button>
              </>
            )}

            {/* STAGE 5 & 6: DISPATCHED / IN TRANSIT */}
            {can("dispatch") && ["dispatched", "in_transit"].includes(b.status) && (
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-sm gap-1.5"
                onClick={() => run(() => markVehicleDelivered(b.id, persona.name), `Vehicle marked delivered for ${b.ref}`)}
              >
                <CheckCircle className="size-3.5" /> Mark Vehicle Delivered
              </Button>
            )}

            {/* STAGE 7: POD PENDING */}
            {b.status === "pod_pending" && (
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow-sm gap-1.5"
                  onClick={() => setPodModalOpen(true)}
                >
                  <FileCheck className="size-3.5" /> Upload / Verify POD
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-indigo-300 text-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 text-xs"
                  onClick={handleQuickPod}
                  title="Quick 1-click verify with demo OTP 4821"
                >
                  Quick Verify
                </Button>
              </div>
            )}

            {/* STAGE 8: POD RECEIVED */}
            {b.status === "pod_received" && (
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-sm gap-1.5"
                onClick={handleCreateInvoice}
              >
                <Receipt className="size-3.5" /> Generate Tax Invoice
              </Button>
            )}

            {/* STAGE 9 & 10: INVOICED & PARTIALLY PAID */}
            {["invoiced", "partially_paid"].includes(b.status) && (
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-sm gap-1.5"
                  onClick={() => {
                    setPaymentAmount(String(outstanding || ""));
                    setPaymentModalOpen(true);
                  }}
                >
                  <CreditCard className="size-3.5" /> Record Payment ({inr(outstanding)} due)
                </Button>
                {b.invoiceId && (
                  <Button size="sm" variant="outline" asChild>
                    <Link to="/app/finance/invoices/$invoiceId" params={{ invoiceId: b.invoiceId }}>
                      View Invoice →
                    </Link>
                  </Button>
                )}
              </div>
            )}

            {/* STAGE 11: PAID */}
            {b.status === "paid" && (
              <Button
                size="sm"
                className="bg-purple-600 hover:bg-purple-700 text-white font-medium shadow-sm gap-1.5"
                onClick={handleCloseConsignment}
              >
                <CheckCircle2 className="size-3.5" /> Reconcile & Close Consignment
              </Button>
            )}

            {/* STAGE 12: CLOSED */}
            {b.status === "closed" && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-purple-500/10 text-purple-600 border border-purple-500/30 text-xs font-semibold">
                <ShieldCheck className="size-3.5" /> Consignment Reconciled & Closed
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (confirm(`Are you sure you want to delete booking ${b.ref}?`)) {
                  deleteBooking(b.id, persona.name);
                  toast.success(`Booking ${b.ref} deleted`);
                  navigate({ to: "/app/bookings" });
                }
              }}
              className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30"
            >
              <Trash2 className="size-4" />
              Delete Booking
            </Button>
          </div>
        }
      />

      {/* State Machine Visualization */}
      <Panel title="Lifecycle" description="Guarded state machine — full progression from Draft to Closed">
        <ol className="flex flex-wrap gap-1.5">
          {bookingOrder.map((s) => {
            const idx = bookingOrder.indexOf(b.status);
            const here = bookingOrder.indexOf(s);
            const done = idx >= 0 && here <= idx;
            const isCurrent = b.status === s;
            return (
              <li
                key={s}
                className={
                  isCurrent
                    ? "rounded-md border border-primary bg-primary text-primary-foreground px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide shadow-sm"
                    : done
                    ? "rounded-md border border-primary/50 bg-primary/10 px-2.5 py-1 text-[11px] uppercase tracking-wide text-primary"
                    : "rounded-md border border-border px-2.5 py-1 text-[11px] uppercase tracking-wide text-muted-foreground"
                }
              >
                {s.replace(/_/g, " ")}
              </li>
            );
          })}
        </ol>
      </Panel>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <Panel title="Consignment Details">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Metric label="Distance" value={`${b.distanceKm} km`} />
              <Metric label="Rate" value={inr(b.rate)} />
              <Metric label="Priority" value={b.priority} />
              <Metric label="Pickup" value={fmtDate(b.pickupISO)} />
            </div>
            <Separator className="my-4" />
            <div className="grid gap-4 sm:grid-cols-2 text-sm">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Pickup Location</p>
                <p className="mt-1 font-medium">{b.pickup.city}</p>
                <p className="text-muted-foreground">{b.pickup.address}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Destination Location</p>
                <p className="mt-1 font-medium">{b.drop.city}</p>
                <p className="text-muted-foreground">{b.drop.address}</p>
              </div>
            </div>
          </Panel>

          <Panel
            title="Trip & Dispatch"
            description={trip ? `${trip.ref} · ${Math.round(trip.progress * 100)}% complete` : "Not dispatched yet"}
            actions={
              <div className="flex items-center gap-2">
                {can("dispatch") && (b.status === "assigned" || trip?.status === "driver_assigned") && (
                  <Button size="sm" onClick={() => run(() => dispatchBooking(b.id, persona.name), "Trip dispatched — vehicle is on trip")}>
                    <Truck className="size-3.5 mr-1.5" /> Dispatch Trip
                  </Button>
                )}
                {trip && ["driver_assigned", "driver_accepted", "started", "in_transit", "arrived"].includes(trip.status) && (
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium gap-1.5"
                    onClick={() => run(() => markVehicleDelivered(b.id, persona.name), `Vehicle marked delivered for ${b.ref}`)}
                  >
                    <CheckCircle className="size-3.5" /> Mark Vehicle Delivered
                  </Button>
                )}
                {trip && (
                  <Button asChild size="sm" variant="ghost">
                    <Link to="/app/trips/$tripId" params={{ tripId: trip.id }}>Open trip</Link>
                  </Button>
                )}
              </div>
            }
          >
            {trip ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Metric label="Status" value={<StatusBadge status={trip.status} />} />
                <Metric label="Vehicle" value={db.vehicles.find((v) => v.id === trip.vehicleId)?.regNo ?? "—"} />
                <Metric label="Driver" value={db.drivers.find((d) => d.id === trip.driverId)?.name ?? "—"} />
                <Metric label="ETA" value={fmtDateTime(trip.etaISO)} tone={trip.delayMins > 30 ? "warning" : undefined} />
                <Metric label="Revenue" value={inr(trip.revenue)} />
                <Metric label="Fuel" value={inr(trip.fuelCost)} />
                <Metric label="Tolls + driver" value={inr(trip.tollCost + trip.driverCost)} />
                <Metric label="Contribution" value={inr(tripProfit(trip))} tone="success" />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Confirm the booking, then assign a vehicle and driver from the dispatch board.
              </p>
            )}
          </Panel>

          {/* Proof of Delivery Card */}
          <Panel
            title="Proof of Delivery (ePOD)"
            description={pod ? "Legally signed & time-stamped proof of delivery" : "Required for tax invoicing"}
            actions={
              !pod && b.status === "pod_pending" ? (
                <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium gap-1.5" onClick={() => setPodModalOpen(true)}>
                  <FileCheck className="size-3.5" /> Upload / Capture POD
                </Button>
              ) : undefined
            }
          >
            {pod ? (
              <div className="space-y-3">
                <div className="grid gap-4 sm:grid-cols-3 text-sm">
                  <Metric label="Received by" value={pod.receiverName} />
                  <Metric label="Captured" value={fmtDateTime(pod.capturedISO)} />
                  <Metric label="OTP verified" value={pod.verified ? "Yes (4821)" : "No"} tone={pod.verified ? "success" : "warning"} />
                </div>
                <div className="rounded-md border p-3 bg-surface/50 text-xs">
                  <span className="font-semibold block mb-1">Unloading Bay Note:</span>
                  <p className="text-muted-foreground">{pod.photoNote}</p>
                  <span className="font-mono text-[11px] text-muted-foreground block mt-2">
                    Digital Signature Key: {pod.signatureSeed}
                  </span>
                </div>
              </div>
            ) : b.status === "pod_pending" ? (
              <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-900/60 rounded-lg">
                <div>
                  <p className="text-sm font-semibold text-indigo-950 dark:text-indigo-200">Consignment Delivered at Destination</p>
                  <p className="text-xs text-muted-foreground">Receiver OTP and signed gate pass must be uploaded to release billing.</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium gap-1.5" onClick={() => setPodModalOpen(true)}>
                    <Upload className="size-3.5" /> Upload Signed ePOD
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleQuickPod}>
                    Quick Verify
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">POD will unlock as soon as the vehicle completes delivery at destination.</p>
            )}
          </Panel>

          {/* Billing & Settlement Panel */}
          {can("view_finance") && (
            <Panel
              title="Freight Billing & Accounting Settlement"
              description={invoice ? `Invoice ${invoice.ref} · Double-entry ledger tracked` : "GST compliant freight billing"}
              actions={
                invoice && (
                  <Button asChild size="sm" variant="ghost">
                    <Link to="/app/finance/invoices/$invoiceId" params={{ invoiceId: invoice.id }}>
                      Open Invoice Document
                    </Link>
                  </Button>
                )
              }
            >
              {invoice ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <Metric label="Invoice" value={invoice.ref} />
                    <Metric label="Total (incl. GST)" value={inr(invoice.total)} />
                    <Metric label="Paid / Settled" value={inr(invoice.paid)} tone={invoice.paid >= invoice.total ? "success" : undefined} />
                    <Metric label="Status" value={<StatusBadge status={invoice.status} />} />
                  </div>

                  {outstanding > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/60 rounded-lg">
                      <div>
                        <p className="text-sm font-semibold text-amber-950 dark:text-amber-200">
                          Outstanding Balance: {inr(outstanding)}
                        </p>
                        <p className="text-xs text-muted-foreground">Payment due on {fmtDate(invoice.dueISO)} ({client.creditDays} days credit)</p>
                      </div>
                      <Button
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700 text-white font-medium gap-1.5 shadow-sm"
                        onClick={() => {
                          setPaymentAmount(String(outstanding));
                          setPaymentModalOpen(true);
                        }}
                      >
                        <CreditCard className="size-3.5" /> Record Payment
                      </Button>
                    </div>
                  )}

                  {outstanding === 0 && b.status !== "closed" && (
                    <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-purple-50/60 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/60 rounded-lg">
                      <div>
                        <p className="text-sm font-semibold text-purple-950 dark:text-purple-200">Full Payment Received ({inr(invoice.paid)})</p>
                        <p className="text-xs text-muted-foreground">All driver advances, fuel receipts and invoices balanced in general ledger.</p>
                      </div>
                      <Button
                        size="sm"
                        className="bg-purple-600 hover:bg-purple-700 text-white font-medium gap-1.5 shadow-sm"
                        onClick={handleCloseConsignment}
                      >
                        <CheckCircle2 className="size-3.5" /> Reconcile & Close Consignment
                      </Button>
                    </div>
                  )}
                </div>
              ) : b.status === "pod_received" ? (
                <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/60 rounded-lg">
                  <div>
                    <p className="text-sm font-semibold text-emerald-950 dark:text-emerald-200">ePOD Verified — Ready for Invoicing</p>
                    <p className="text-xs text-muted-foreground">Freight standard rate: {inr(b.rate)} + loading & 12% GST.</p>
                  </div>
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium gap-1.5 shadow-sm" onClick={handleCreateInvoice}>
                    <Receipt className="size-3.5" /> Generate Tax Invoice
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {canInvoiceNow.ok ? "Ready to invoice." : canInvoiceNow.reason}
                </p>
              )}
            </Panel>
          )}
        </div>

        <div className="space-y-4">
          <Panel title="Client">
            <p className="font-medium">{client.name}</p>
            <p className="text-sm text-muted-foreground">{client.contactName} · {client.phone}</p>
            <p className="text-sm text-muted-foreground">{client.email}</p>
            <Separator className="my-3" />
            <div className="grid grid-cols-2 gap-3">
              <Metric label="Segment" value={client.segment} />
              <Metric label="Credit days" value={String(client.creditDays)} />
            </div>
          </Panel>

          <Panel title="Audit trail" description="Immutable event reduction history">
            <ol className="space-y-3">
              {history.slice(0, 12).map((a) => (
                <li key={a.id} className="text-sm">
                  <p className="font-medium">{a.action}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.actor} · {timeAgo(a.atISO)}
                    {a.from && a.to ? ` · ${a.from} → ${a.to}` : ""}
                  </p>
                </li>
              ))}
              {history.length === 0 && <p className="text-sm text-muted-foreground">No changes recorded yet.</p>}
            </ol>
          </Panel>
        </div>
      </div>

      {/* Upload / Capture POD Modal */}
      <Dialog open={podModalOpen} onOpenChange={setPodModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileCheck className="size-5 text-indigo-600" />
              Capture & Verify Proof of Delivery (ePOD)
            </DialogTitle>
            <DialogDescription>
              Shipment {b.ref} · Unloading at {b.drop.city} ({b.drop.address})
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Receiver Name / Bay Officer</Label>
              <Input
                value={receiverName}
                onChange={(e) => setReceiverName(e.target.value)}
                placeholder={client?.contactName || "e.g. Ramesh Chandra (Warehouse In-Charge)"}
              />
            </div>

            <div>
              <Label className="text-xs">Consignee Delivery OTP (4-6 digits)</Label>
              <Input
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="4821"
                maxLength={6}
                className="font-mono text-base font-semibold tracking-wider"
              />
              <p className="text-[11px] text-muted-foreground mt-1">SMS / WhatsApp OTP sent to {client?.phone || "consignee"}.</p>
            </div>

            <div>
              <Label className="text-xs">Digital Signature Reference</Label>
              <Input
                value={signatureSeed}
                onChange={(e) => setSignatureSeed(e.target.value)}
                placeholder="SIG-BAY-XXXX"
                className="font-mono text-xs"
              />
            </div>

            <div>
              <Label className="text-xs">Gate Pass & Unloading Bay Photo Note</Label>
              <Input
                value={photoNote}
                onChange={(e) => setPhotoNote(e.target.value)}
                placeholder="Consignment photo & signed physical gate pass verified."
              />
            </div>
          </div>

          <DialogFooter className="flex gap-2 sm:justify-between">
            <Button variant="ghost" size="sm" onClick={() => setPodModalOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium" onClick={handleCapturePod}>
              Verify & Accept ePOD
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record Payment Modal */}
      <Dialog open={paymentModalOpen} onOpenChange={setPaymentModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="size-5 text-blue-600" />
              Record Customer Payment Receipt
            </DialogTitle>
            <DialogDescription>
              {invoice ? `Against Invoice ${invoice.ref} · Total ${inr(invoice.total)}` : "Record Freight Payment"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs">Payment Amount (INR)</Label>
                {outstanding > 0 && (
                  <button
                    type="button"
                    onClick={() => setPaymentAmount(String(outstanding))}
                    className="text-[11px] text-primary hover:underline font-medium"
                  >
                    Set full balance ({inr(outstanding)})
                  </button>
                )}
              </div>
              <Input
                type="number"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder={String(outstanding)}
                className="font-mono text-base font-semibold"
              />
            </div>

            <div>
              <Label className="text-xs">Payment Mode</Label>
              <div className="grid grid-cols-4 gap-2 mt-1">
                {(["NEFT", "UPI", "Cheque", "Cash"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPaymentMode(m)}
                    className={`py-1.5 text-xs font-medium rounded-md border text-center transition-colors ${
                      paymentMode === m
                        ? "border-primary bg-primary/10 text-primary font-bold"
                        : "border-border hover:bg-surface"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs">Bank UTR / Transaction Reference</Label>
              <Input
                value={paymentRef}
                onChange={(e) => setPaymentRef(e.target.value)}
                placeholder={`UTR${Date.now().toString().slice(-8)}`}
                className="font-mono text-xs"
              />
            </div>
          </div>

          <DialogFooter className="flex gap-2 sm:justify-between">
            <Button variant="ghost" size="sm" onClick={() => setPaymentModalOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white font-medium" onClick={handleRecordPayment}>
              Confirm Payment Receipt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
