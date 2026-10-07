import { useEffect, useState } from "react";
import { api } from "../lib/api";

function formatDate(value) {
  if (!value) return "—";

  return new Date(value).toLocaleString();
}

function formatSnapshot(snapshot) {
  if (!Array.isArray(snapshot)) return [];

  return snapshot;
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

      try {
        const data = await api(`/sewing/orders/${orderId}`, {
          signal: controller.signal,
        });

        setOrder(data.order);
      } catch (err) {
        if (err.name !== "AbortError") {
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
  const snapshot = formatSnapshot(
    approvedLog?.componentSnapshot
  );

  async function handleStartSewing() {
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
    <section className="panel">
      <div className="section-heading">
        <h2>Sewing batch details</h2>

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

      {message && <p role="status">{message}</p>}

      {loading ? (
        <p role="status">Loading sewing batch...</p>
      ) : !order ? (
        <p>Unable to load this sewing batch.</p>
      ) : (
        <>
          <p>Order: {order.orderNo}</p>
          <p>Recipe: {order.recipe.name}</p>
          <p>Category: {order.recipe.category}</p>
          <p>Target quantity: {order.targetQty}</p>
          <p>Fabric roll: {order.fabricRollId}</p>
          <p>
            Actual fabric:{" "}
            {Number(order.actualFabricYds).toFixed(2)} yards
          </p>
          <p>Status: {order.status}</p>

          <h3>Verification audit</h3>

          {approvedLog ? (
            <>
              <p>
                Verified by:{" "}
                {approvedLog.verifier?.fullName || "Unknown verifier"}
              </p>
              <p>
                Verified at: {formatDate(approvedLog.createdAt)}
              </p>
              <p>
                Fabric wastage:{" "}
                {approvedLog.wastagePct == null
                  ? "—"
                  : `${Number(approvedLog.wastagePct).toFixed(2)}%`}
              </p>
            </>
          ) : (
            <p>No approved verification log found.</p>
          )}

          <h3>Verified component counts</h3>

          {snapshot.length === 0 ? (
            <p>No component snapshot available.</p>
          ) : (
            <div className="table-scroll">
              <table>
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
                      <td>{item.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {order.status === "VERIFIED" ? (
            <button
              type="button"
              onClick={handleStartSewing}
              disabled={busy || !approvedLog}
            >
              {busy
                ? "Starting..."
                : "Start Sewing Assembly"}
            </button>
          ) : (
            <p>
              Sewing assembly has already started for this batch.
            </p>
          )}
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

        setOrders(data.orders);
      } catch (err) {
        if (err.name !== "AbortError") {
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

      <section className="panel">
        <div className="section-heading">
          <h2>Sewing Queue</h2>

          <button
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

        {message && <p role="status">{message}</p>}

        {loading ? (
          <p role="status">Loading sewing queue...</p>
        ) : orders.length === 0 ? (
          <p>No verified batches are waiting for sewing.</p>
        ) : (
          <div className="table-scroll">
            <table>
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
                    <td>{order.orderNo}</td>
                    <td>{order.recipe.name}</td>
                    <td>{order.targetQty}</td>
                    <td>{order.fabricRollId}</td>
                    <td>{order.status}</td>
                    <td>
                      <button
                        type="button"
                        disabled={selectedOrderId !== null}
                        onClick={() =>
                          setSelectedOrderId(order.id)
                        }
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