import { useEffect, useState } from "react";
import { api } from "../lib/api";
import {
  WorkflowStatusBadge,
  QcStatusBadge,
  VerificationAuditEntry,
} from "./WorkflowStatus";

export default function SupervisorOrderDetails({
  orderId,
  onClose,
  onResubmitted,
}) {
  const [order, setOrder] = useState(null);
  const [fabric, setFabric] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadDetails() {
      setLoading(true);
      setError("");

      try {
        const data = await api(`/orders/${orderId}`, {
          signal: controller.signal,
        });

        if (!controller.signal.aborted) {
          setOrder(data.order);
          setFabric(String(data.order.actualFabricYds));
        }
      } catch (err) {
        if (!controller.signal.aborted && err.name !== "AbortError") {
          setError(err.message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadDetails();

    return () => controller.abort();
  }, [orderId, reloadKey]);

  async function handleResubmit(event) {
    event.preventDefault();

    if (busy || !order) return;

    setError("");
    setSuccess("");

    const text = fabric.trim();
    const total = Number(text);

    if (
      !/^\d+(\.\d{1,2})?$/.test(text) ||
      !Number.isFinite(total) ||
      total <= 0 ||
      total > 99999999.99
    ) {
      setError(
        "Enter positive total fabric yards with at most 2 decimal places."
      );
      return;
    }

    if (total < Number(order.actualFabricYds)) {
      setError(
        "Total fabric usage cannot be lower than the recorded usage."
      );
      return;
    }

    setBusy(true);

    try {
      const data = await api(`/orders/${orderId}/resubmit`, {
        method: "POST",
        body: { actualFabricYds: total },
      });

      setSuccess(data.message);

      onResubmitted({
        id: orderId,
        status: data.status,
        actualFabricYds: total.toFixed(2),
      });

      setReloadKey((current) => current + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="section-heading">
        <h2>Order details</h2>

        <button
          type="button"
          onClick={onClose}
          disabled={busy}
        >
          Close
        </button>
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {success && <p role="status">{success}</p>}

      {loading ? (
        <p role="status">Loading order details...</p>
      ) : !order ? (
        <button
          type="button"
          onClick={() => setReloadKey((current) => current + 1)}
        >
          Retry
        </button>
      ) : (
        <>
          <p style={{ overflowWrap: "anywhere" }}>
            Order: {order.orderNo}
          </p>
          <p>Recipe: {order.recipe.name}</p>
          <p>Target quantity: {order.targetQty}</p>
          <p>Fabric roll: {order.fabricRollId}</p>
          <p>
            Recorded fabric:{" "}
            {Number(order.actualFabricYds).toFixed(2)} yards
          </p>
          <p>
            Status: <WorkflowStatusBadge status={order.status} />
          </p>

          <h3>Component counts</h3>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Component</th>
                  <th>Expected</th>
                  <th>Actual</th>
                  <th>QC status</th>
                </tr>
              </thead>

              <tbody>
                {order.verificationItems.map((item) => (
                  <tr key={item.id}>
                    <td>{item.component.componentName}</td>
                    <td>{item.expectedQty}</td>
                    <td>{item.actualQty ?? "Not counted"}</td>
                    <td>
                      <QcStatusBadge status={item.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 style={{ marginTop: "24px" }}>
            Verification history
          </h3>

          {order.verificationLogs.length === 0 ? (
            <p>No verification decisions yet.</p>
          ) : (
            order.verificationLogs.map((log) => (
              <VerificationAuditEntry
                key={log.id}
                decision={log.decision}
              >
                <p>
                  Decision:{" "}
                  <WorkflowStatusBadge status={log.decision} />
                </p>
                <p>Verifier: {log.verifier.fullName}</p>
                <p>
                  Time: {new Date(log.createdAt).toLocaleString()}
                </p>
                <p>
                  Fabric variance:{" "}
                  {log.wastagePct == null
                    ? "Not recorded"
                    : `${Number(log.wastagePct).toFixed(2)}%`}
                </p>

                {log.rejectionNote && (
                  <p style={{ color: "#b3374b" }}>
                    Rejection reason: {log.rejectionNote}
                  </p>
                )}
              </VerificationAuditEntry>
            ))
          )}

          {order.status === "REJECTED" && (
            <section
              style={{
                marginTop: "24px",
                padding: "20px",
                border: "1px solid #f4bdc5",
                borderRadius: "5px",
                backgroundColor: "#fffafb",
              }}
            >
              <h3>Resubmit after re-cutting</h3>

              <p>
                Enter total fabric used, including any extra fabric
                used for re-cutting. Every component must be counted
                again after resubmission.
              </p>

              <form onSubmit={handleResubmit} noValidate>
                <label htmlFor="resubmitFabric">
                  Total fabric used (yards)
                </label>

                <input
                  id="resubmitFabric"
                  type="text"
                  inputMode="decimal"
                  value={fabric}
                  onChange={(event) => {
                    setFabric(event.target.value);
                    setError("");
                  }}
                  disabled={busy}
                />

                <button type="submit" disabled={busy}>
                  {busy
                    ? "Resubmitting..."
                    : "Resubmit for Verification"}
                </button>
              </form>
            </section>
          )}
        </>
      )}
    </section>
  );
}