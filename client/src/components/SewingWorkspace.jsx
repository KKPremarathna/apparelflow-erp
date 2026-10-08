import { useEffect, useState } from "react";
import { api } from "../lib/api";
import "./WorkspaceLayouts.css";

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString();
}

function formatNumber(value, suffix = "") {
  if (value == null || value === "") return "—";

  const number = Number(value);

  return Number.isFinite(number)
    ? `${number.toFixed(2)}${suffix}`
    : "—";
}

function ComponentStatus({ status }) {
  const styles = {
    GREEN: {
      className: "af-badge-match",
      label: "Match",
    },
    YELLOW: {
      className: "af-badge-excess",
      label: "Excess",
    },
    RED: {
      className: "af-badge-shortage",
      label: "Shortage",
    },
  };

  const item = styles[status];

  return (
    <span
      className={`af-badge ${item?.className || "af-badge-neutral"}`}
      title={status || undefined}
    >
      {item?.label || status || "Unknown"}
    </span>
  );
}

function OrderStatus({ status }) {
  return (
    <span
      className={`af-badge ${
        status === "VERIFIED"
          ? "af-badge-match"
          : "af-badge-neutral"
      }`}
    >
      {status ? status.replaceAll("_", " ") : "Unknown"}
    </span>
  );
}

function DetailItem({ label, children, wide = false }) {
  return (
    <div className={`af-detail-item ${wide ? "af-detail-wide" : ""}`}>
      <dt>{label}</dt>
      <dd>{children ?? "—"}</dd>
    </div>
  );
}

function SewingBatchDetails({ orderId, onClose, onStarted }) {
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadDetails() {
      setLoading(true);
      setError("");
      setMessage("");
      setOrder(null);

      try {
        const data = await api(`/sewing/orders/${orderId}`, {
          signal: controller.signal,
        });

        if (!controller.signal.aborted) {
          setOrder(data.order);
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
  }, [orderId]);

  const approvedLog = order?.verificationLogs?.[0];

  const snapshot = Array.isArray(approvedLog?.componentSnapshot)
    ? approvedLog.componentSnapshot
    : [];

  async function handleStartSewing() {
    if (busy || order?.status !== "VERIFIED" || !approvedLog) {
      return;
    }

    setError("");
    setMessage("");
    setBusy(true);

    try {
      const data = await api(`/sewing/orders/${orderId}/start`, {
        method: "POST",
      });

      setMessage(data.message);
      setOrder((current) => ({
        ...current,
        status: data.status,
      }));

      onStarted(orderId, data.status);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel af-layout-panel">
      <div className="section-heading af-section-heading">
        <div>
          <p className="af-kicker">BATCH OVERVIEW</p>
          <h2>Sewing batch details</h2>
          <p className="af-subtitle">
            Review batch information and its verification record.
          </p>
        </div>

        <button
          className="button-secondary"
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

      {message && (
        <p className="af-success" role="status">
          {message}
        </p>
      )}

      {loading ? (
        <p className="af-empty" role="status">
          Loading sewing batch...
        </p>
      ) : !order ? (
        <p className="af-empty">
          Unable to load this sewing batch.
        </p>
      ) : (
        <>
          <div className="af-batch-grid">
            <section className="af-info-card">
              <div className="af-card-heading">
                <span className="af-card-icon" aria-hidden="true">
                  01
                </span>
                <div>
                  <h3>Batch information</h3>
                  <p>Production order and fabric details</p>
                </div>
              </div>

              <dl className="af-detail-grid">
                <DetailItem label="Order ID" wide>
                  <span className="af-order-id">{order.orderNo}</span>
                </DetailItem>

                <DetailItem label="Recipe">
                  {order.recipe?.name}
                </DetailItem>

                <DetailItem label="Category">
                  {order.recipe?.category}
                </DetailItem>

                <DetailItem label="Target quantity">
                  <span className="af-value-emphasis">
                    {order.targetQty}
                  </span>
                  <span className="af-value-unit"> garments</span>
                </DetailItem>

                <DetailItem label="Fabric roll">
                  {order.fabricRollId}
                </DetailItem>

                <DetailItem label="Actual fabric used" wide>
                  {formatNumber(order.actualFabricYds, " yards")}
                </DetailItem>
              </dl>
            </section>

            <section className="af-info-card af-audit-card">
              <div className="af-card-heading">
                <span className="af-card-icon" aria-hidden="true">
                  02
                </span>
                <div>
                  <h3>Verification audit</h3>
                  <p>Recorded verification information</p>
                </div>
              </div>

              <dl className="af-detail-grid">
                <DetailItem label="Batch status" wide>
                  <OrderStatus status={order.status} />
                </DetailItem>

                {approvedLog && (
                  <>
                    <DetailItem label="Verified by" wide>
                      {approvedLog.verifier?.fullName ||
                        "Unknown verifier"}
                    </DetailItem>

                    <DetailItem label="Verified at" wide>
                      {formatDate(approvedLog.createdAt)}
                    </DetailItem>
                  </>
                )}
              </dl>

              {approvedLog ? (
                <div className="af-wastage">
                  <span className="af-wastage-label">
                    Recorded fabric wastage
                  </span>
                  <span className="af-wastage-value">
                    {formatNumber(approvedLog.wastagePct, "%")}
                  </span>
                </div>
              ) : (
                <p className="af-empty">
                  No approved verification log found.
                </p>
              )}
            </section>
          </div>

          <div className="af-components-section">
            <div className="af-table-heading">
              <div>
                <h3>Verified component counts</h3>
                <p className="af-subtitle">
                  Expected and actual quantities from the saved snapshot.
                </p>
              </div>

              <span className="af-badge af-badge-neutral">
                {snapshot.length} components
              </span>
            </div>

            {snapshot.length === 0 ? (
              <p className="af-empty">
                No component snapshot available.
              </p>
            ) : (
              <div className="table-scroll">
                <table className="af-data-table">
                  <thead>
                    <tr>
                      <th>Component</th>
                      <th>Expected</th>
                      <th>Actual</th>
                      <th>Variance</th>
                      <th>Status</th>
                    </tr>
                  </thead>

                  <tbody>
                    {snapshot.map((item) => (
                      <tr key={item.componentId}>
                        <td>{item.componentName}</td>
                        <td>{item.expectedQty}</td>
                        <td>{item.actualQty}</td>
                        <td>
                          {item.varianceQty > 0
                            ? `+${item.varianceQty}`
                            : item.varianceQty}
                        </td>
                        <td>
                          <ComponentStatus status={item.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="af-action-footer">
            <p className="af-subtitle">
              {order.status === "VERIFIED"
                ? "Start assembly after reviewing this verified batch."
                : "Batch status has changed. Review the current status above."}
            </p>

            {order.status === "VERIFIED" && (
              <button
                type="button"
                onClick={handleStartSewing}
                disabled={busy || !approvedLog}
              >
                {busy ? "Starting..." : "Start Sewing Assembly"}
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}

export default function SewingWorkspace() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadQueue() {
      setLoading(true);
      setError("");

      try {
        const data = await api("/sewing/queue", {
          signal: controller.signal,
        });

        if (!controller.signal.aborted) {
          setOrders(data.orders);
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

    loadQueue();

    return () => controller.abort();
  }, [reloadKey]);

  function handleStarted(orderId, status) {
    setOrders((current) =>
      current.filter((order) => order.id !== orderId)
    );

    setSelectedOrderId(null);
    setMessage(`Batch status updated to ${status}.`);
  }

  return (
    <div>
      {selectedOrderId && (
        <SewingBatchDetails
          key={selectedOrderId}
          orderId={selectedOrderId}
          onClose={() => setSelectedOrderId(null)}
          onStarted={handleStarted}
        />
      )}

      <section className="panel af-layout-panel">
        <div className="section-heading af-section-heading">
          <div>
            <p className="af-kicker">PRODUCTION QUEUE</p>
            <h2>Sewing Queue</h2>
            <p className="af-subtitle">
              Verified batches waiting for sewing assembly.
            </p>
          </div>

          <button
            className="button-secondary"
            type="button"
            disabled={loading || selectedOrderId !== null}
            onClick={() => {
              setMessage("");
              setReloadKey((current) => current + 1);
            }}
          >
            Refresh queue
          </button>
        </div>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        {message && (
          <p className="af-success" role="status">
            {message}
          </p>
        )}

        {loading ? (
          <p className="af-empty" role="status">
            Loading sewing queue...
          </p>
        ) : orders.length === 0 ? (
          <p className="af-empty">
            No verified batches are waiting for sewing.
          </p>
        ) : (
          <div className="table-scroll">
            <table className="af-data-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Recipe</th>
                  <th>Quantity</th>
                  <th>Fabric roll</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td className="af-order-cell">{order.orderNo}</td>
                    <td>{order.recipe?.name}</td>
                    <td>{order.targetQty}</td>
                    <td>{order.fabricRollId}</td>
                    <td>
                      <OrderStatus status={order.status} />
                    </td>
                    <td>
                      <button
                        type="button"
                        disabled={selectedOrderId !== null}
                        onClick={() => setSelectedOrderId(order.id)}
                      >
                        View batch
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}