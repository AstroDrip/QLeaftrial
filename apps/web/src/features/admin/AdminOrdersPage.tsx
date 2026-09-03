import { content } from "../../content/en";

const orders = [
  { id: "QL-2048", customer: "Aisha Rahman", total: 800, status: content.order.statusPending },
  { id: "QL-2049", customer: "Samir Ali", total: 560, status: content.order.statusPreparing },
  { id: "QL-2050", customer: "Nour Hadi", total: 980, status: content.order.statusOutForDelivery },
];

export function AdminOrdersPage() {
  return (
    <section className="page-shell admin-page" data-testid="admin-orders-page">
      <div className="page-shell__header">
        <p className="eyebrow">{content.admin.orders}</p>
        <h1>{content.admin.orders}</h1>
      </div>

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Customer</th>
              <th>Total</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td>{order.id}</td>
                <td>{order.customer}</td>
                <td>{order.total} QAR</td>
                <td>
                  <span className="status-pill">{order.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
