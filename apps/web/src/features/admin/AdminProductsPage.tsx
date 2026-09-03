import { content } from "../../content/en";

const products = [
  { name: "Monstera Deliciosa", stock: 24, price: 320 },
  { name: "Snake Plant", stock: 18, price: 240 },
  { name: "ZZ Plant", stock: 14, price: 260 },
  { name: "Fiddle Leaf Fig", stock: 8, price: 430 },
];

export function AdminProductsPage() {
  return (
    <section className="page-shell admin-page" data-testid="admin-products-page">
      <div className="page-shell__header">
        <p className="eyebrow">{content.admin.products}</p>
        <h1>{content.admin.products}</h1>
      </div>

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>{content.admin.stock}</th>
              <th>{content.admin.price}</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.name}>
                <td>{product.name}</td>
                <td>{product.stock}</td>
                <td>{product.price}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
