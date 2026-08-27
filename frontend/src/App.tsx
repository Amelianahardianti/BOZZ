import { useEffect, useState } from "react";

const BACKEND_URL = "http://localhost:3000";
const URGENT_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24h — PoC heuristic, bukan SLA resmi Shopee

interface ShopeeStatus {
  connected: boolean;
  shopId?: string;
}

interface OrderItem {
  id: number;
  itemId: string;
  itemName: string;
  itemSku?: string | null;
  modelSku?: string | null;
  modelQuantityPurchased: number;
  modelOriginalPrice?: number | null;
  modelDiscountedPrice?: number | null;
}

interface Order {
  id: number;
  orderSn: string;
  orderStatus: string;
  marketplace: string;
  fulfillmentStatus: "PENDING" | "PACKING" | "PACKED";
  totalAmount?: number | null;
  buyerUsername?: string | null;
  orderCreateTime?: number | null;
  createdAt: string;
  items: OrderItem[];
}

function isPriority(order: Order): boolean {
  if (order.fulfillmentStatus === "PACKED") return false;
  const createdMs = order.orderCreateTime ? order.orderCreateTime * 1000 : new Date(order.createdAt).getTime();
  return Date.now() - createdMs > URGENT_THRESHOLD_MS;
}

function formatItems(order: Order): string {
  return order.items.map((i) => `${i.itemName} x${i.modelQuantityPurchased}`).join(", ");
}

function totalQuantity(order: Order): number {
  return order.items.reduce((sum, i) => sum + i.modelQuantityPurchased, 0);
}

function App() {
  const [view, setView] = useState<"owner" | "packer">("owner");
  const [status, setStatus] = useState<ShopeeStatus | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [packerOrders, setPackerOrders] = useState<Order[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const fetchStatus = () => {
    fetch(`${BACKEND_URL}/api/shopee/status`)
      .then((res) => res.json())
      .then(setStatus)
      .catch(() => setStatus(null));
  };

  const fetchOrders = () => {
    fetch(`${BACKEND_URL}/api/orders`)
      .then((res) => res.json())
      .then(setOrders)
      .catch(() => setOrders([]));
  };

  const fetchPackerOrders = () => {
    fetch(`${BACKEND_URL}/api/orders?fulfillmentStatus=PACKING`)
      .then((res) => res.json())
      .then(setPackerOrders)
      .catch(() => setPackerOrders([]));
  };

  useEffect(() => {
    fetchStatus();
    fetchOrders();
  }, []);

  useEffect(() => {
    if (view === "owner") fetchOrders();
    if (view === "packer") fetchPackerOrders();
  }, [view]);

  const handleConnect = () => {
    window.location.href = `${BACKEND_URL}/api/shopee/authorize`;
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/shopee/orders/sync`);
      const data = await res.json();
      if (!res.ok) {
        setSyncMessage(`Sync failed: ${data.error}`);
      } else {
        setSyncMessage(`Synced ${data.synced} order(s) — ${data.created} new, ${data.updated} updated`);
        fetchOrders();
      }
    } catch {
      setSyncMessage("Sync failed: network error");
    } finally {
      setSyncing(false);
    }
  };

  const handleSendToPacker = async (orderSn: string) => {
    setActionMessage(null);
    const res = await fetch(`${BACKEND_URL}/api/orders/${orderSn}/send-to-packer`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setActionMessage(`Send to Packer failed: ${data.error}`);
      return;
    }
    fetchOrders();
  };

  const handleMarkAsPacked = async (orderSn: string) => {
    setActionMessage(null);
    const res = await fetch(`${BACKEND_URL}/api/orders/${orderSn}/mark-packed`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setActionMessage(`Mark as Packed failed: ${data.error}`);
      return;
    }
    fetchPackerOrders();
  };

  return (
    <main style={{ fontFamily: "sans-serif", padding: "2rem" }}>
      <h1>Shopee Order PoC</h1>

      <p>
        Shopee status:{" "}
        {status === null
          ? "checking..."
          : status.connected
          ? `Connected (shop_id: ${status.shopId})`
          : "Not Connected"}
      </p>

      <button onClick={handleConnect}>Connect Shopee</button>
      <button onClick={fetchStatus} style={{ marginLeft: "0.5rem" }}>
        Refresh status
      </button>
      <button onClick={handleSync} disabled={syncing} style={{ marginLeft: "0.5rem" }}>
        {syncing ? "Syncing..." : "Sync Shopee Orders"}
      </button>
      {syncMessage && <p>{syncMessage}</p>}

      <hr />

      <nav style={{ marginBottom: "1rem" }}>
        <button onClick={() => setView("owner")} disabled={view === "owner"}>
          Owner Dashboard
        </button>
        <button onClick={() => setView("packer")} disabled={view === "packer"} style={{ marginLeft: "0.5rem" }}>
          Packer Tasks
        </button>
      </nav>

      {actionMessage && <p style={{ color: "red" }}>{actionMessage}</p>}

      {view === "owner" && (
        <section>
          <h2>Owner Dashboard — Unified Orders ({orders.length})</h2>
          <p style={{ fontSize: "0.85rem", color: "#555" }}>
            "Priority" = heuristik PoC internal (order berumur &gt;24 jam & belum PACKED), bukan SLA resmi
            Shopee.
          </p>
          <table border={1} cellPadding={6} style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Marketplace</th>
                <th>Product</th>
                <th>Qty</th>
                <th>Order Status</th>
                <th>Fulfillment Status</th>
                <th>Created At</th>
                <th>Priority</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.orderSn}>
                  <td>{order.orderSn}</td>
                  <td>{order.marketplace}</td>
                  <td>{formatItems(order)}</td>
                  <td>{totalQuantity(order)}</td>
                  <td>{order.orderStatus}</td>
                  <td>{order.fulfillmentStatus}</td>
                  <td>
                    {order.orderCreateTime
                      ? new Date(order.orderCreateTime * 1000).toLocaleString()
                      : new Date(order.createdAt).toLocaleString()}
                  </td>
                  <td>{isPriority(order) ? "⚠ Priority (PoC)" : "-"}</td>
                  <td>
                    {order.fulfillmentStatus === "PENDING" && (
                      <button onClick={() => handleSendToPacker(order.orderSn)}>Send to Packer</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {view === "packer" && (
        <section>
          <h2>Packer Tasks ({packerOrders.length})</h2>
          <table border={1} cellPadding={6} style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Marketplace</th>
                <th>Items</th>
                <th>Qty</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {packerOrders.map((order) => (
                <tr key={order.orderSn}>
                  <td>{order.orderSn}</td>
                  <td>{order.marketplace}</td>
                  <td>{formatItems(order)}</td>
                  <td>{totalQuantity(order)}</td>
                  <td>{order.fulfillmentStatus}</td>
                  <td>
                    <button onClick={() => handleMarkAsPacked(order.orderSn)}>Mark as Packed</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}

export default App;
