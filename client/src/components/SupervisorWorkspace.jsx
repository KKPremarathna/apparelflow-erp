import { useEffect, useState } from "react";
import { api } from "../lib/api";

const emptyForm = {
  recipeId: "",
  targetQty: "",
  fabricRollId: "",
  actualFabricYds: "",
};

function validateForm(form, recipe) {
  const errors = {};
  const quantityText = form.targetQty.trim();
  const fabricText = form.actualFabricYds.trim();
  const quantity = Number(quantityText);
  const fabric = Number(fabricText);

  if (!recipe) {
    errors.recipeId = "Select a recipe.";
  }

  if (
    !/^\d+$/.test(quantityText) ||
    !Number.isSafeInteger(quantity) ||
    quantity <= 0
  ) {
    errors.targetQty = "Enter a positive whole number.";
  } else if (
    recipe?.components.some((component) => {
      const expected = component.piecesPerGarment * quantity;
      return (
        !Number.isSafeInteger(expected) ||
        expected <= 0 ||
        expected > 2147483647
      );
    })
  ) {
    errors.targetQty = "Quantity exceeds supported component counts.";
  }

  const rollId = form.fabricRollId.trim();

  if (!rollId || rollId.length > 100) {
    errors.fabricRollId = "Enter a fabric roll ID of 1–100 characters.";
  }

  if (
    !/^\d+(\.\d{1,2})?$/.test(fabricText) ||
    !Number.isFinite(fabric) ||
    fabric <= 0 ||
    fabric > 99999999.99
  ) {
    errors.actualFabricYds =
      "Enter positive fabric yards with at most 2 decimal places.";
  }

  return errors;
}

export default function SupervisorWorkspace() {
  const [recipes, setRecipes] = useState([]);
  const [orders, setOrders] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const selectedRecipe = recipes.find(
    (recipe) => recipe.id === form.recipeId
  );

  const fieldErrors = validateForm(form, selectedRecipe);
  const quantity = Number(form.targetQty);
  const validQuantity =
    /^\d+$/.test(form.targetQty.trim()) &&
    Number.isSafeInteger(quantity) &&
    quantity > 0 &&
    !fieldErrors.targetQty;

  useEffect(() => {
    const controller = new AbortController();

    async function loadWorkspace() {
      setLoading(true);
      setError("");

      try {
        const [recipeData, orderData] = await Promise.all([
          api("/recipes", { signal: controller.signal }),
          api("/orders", { signal: controller.signal }),
        ]);

        setRecipes(recipeData.recipes);
        setOrders(orderData.orders);
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

    loadWorkspace();

    return () => controller.abort();
  }, [reloadKey]);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setSuccess("");
  }

  async function handleCreate(event) {
    event.preventDefault();
    setSubmitted(true);
    setError("");
    setSuccess("");

    if (Object.keys(fieldErrors).length > 0) return;

    setSaving(true);

    try {
      const data = await api("/orders", {
        method: "POST",
        body: {
          recipeId: form.recipeId,
          targetQty: Number(form.targetQty),
          fabricRollId: form.fabricRollId.trim(),
          actualFabricYds: Number(form.actualFabricYds),
        },
      });

      // Update the list directly after a successful creation.
      setOrders((current) => [data.order, ...current]);
      setForm({ ...emptyForm });
      setSubmitted(false);
      setSuccess(data.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p role="status">Loading Supervisor workspace...</p>;
  }

  return (
    <div>
      <section className="panel">
        <h2>Create cutting order</h2>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        {success && <p role="status">{success}</p>}

        <form onSubmit={handleCreate} noValidate>
          <label htmlFor="recipeId">Recipe</label>
          <select
            id="recipeId"
            name="recipeId"
            value={form.recipeId}
            onChange={updateField}
            disabled={saving}
            aria-invalid={submitted && Boolean(fieldErrors.recipeId)}
          >
            <option value="">Select a recipe</option>
            {recipes.map((recipe) => (
              <option key={recipe.id} value={recipe.id}>
                {recipe.recipeCode} — {recipe.name}
              </option>
            ))}
          </select>
          {submitted && fieldErrors.recipeId && (
            <p className="error">{fieldErrors.recipeId}</p>
          )}

          <label htmlFor="targetQty">Target batch quantity</label>
          <input
            id="targetQty"
            name="targetQty"
            type="text"
            inputMode="numeric"
            value={form.targetQty}
            onChange={updateField}
            disabled={saving}
            aria-invalid={submitted && Boolean(fieldErrors.targetQty)}
          />
          {submitted && fieldErrors.targetQty && (
            <p className="error">{fieldErrors.targetQty}</p>
          )}

          <label htmlFor="fabricRollId">Fabric roll ID</label>
          <input
            id="fabricRollId"
            name="fabricRollId"
            type="text"
            maxLength={100}
            placeholder="FAB-ROLL-882"
            value={form.fabricRollId}
            onChange={updateField}
            disabled={saving}
            aria-invalid={submitted && Boolean(fieldErrors.fabricRollId)}
          />
          {submitted && fieldErrors.fabricRollId && (
            <p className="error">{fieldErrors.fabricRollId}</p>
          )}

          <label htmlFor="actualFabricYds">
            Actual fabric used (yards)
          </label>
          <input
            id="actualFabricYds"
            name="actualFabricYds"
            type="text"
            inputMode="decimal"
            value={form.actualFabricYds}
            onChange={updateField}
            disabled={saving}
            aria-invalid={
              submitted && Boolean(fieldErrors.actualFabricYds)
            }
          />
          {submitted && fieldErrors.actualFabricYds && (
            <p className="error">{fieldErrors.actualFabricYds}</p>
          )}

          <button
            type="submit"
            disabled={saving || recipes.length === 0}
          >
            {saving
              ? "Creating..."
              : "Create & Submit for Verification"}
          </button>
        </form>

        {recipes.length === 0 && (
          <p>No recipes available. Check the database seed.</p>
        )}
      </section>

      {selectedRecipe && (
        <section className="panel">
          <h2>Expected component counts</h2>
          <p>
            Preview only. The backend calculates the saved counts.
          </p>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Component</th>
                  <th>Pieces per garment</th>
                  <th>Expected pieces</th>
                </tr>
              </thead>
              <tbody>
                {selectedRecipe.components.map((component) => (
                  <tr key={component.id}>
                    <td>{component.componentName}</td>
                    <td>{component.piecesPerGarment}</td>
                    <td>
                      {validQuantity
                        ? component.piecesPerGarment * quantity
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="panel">
        <div className="section-heading">
          <h2>My cutting orders</h2>
          <button
            type="button"
            disabled={saving}
            onClick={() => setReloadKey((current) => current + 1)}
          >
            Refresh
          </button>
        </div>

        {orders.length === 0 ? (
          <p>No cutting orders yet.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Recipe</th>
                  <th>Quantity</th>
                  <th>Fabric yards</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td>{order.orderNo}</td>
                    <td>{order.recipe.name}</td>
                    <td>{order.targetQty}</td>
                    <td>{Number(order.actualFabricYds).toFixed(2)}</td>
                    <td>{order.status}</td>
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