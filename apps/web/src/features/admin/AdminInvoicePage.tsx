import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { useSiteLanguage, useStoreSettings } from "../../app/providers";
import { adminApi, type AdminOrder } from "./admin-api";
import { invoiceNumber, invoiceTotal, isInvoiceable } from "./invoice-utils";
import "./invoice.css";

const copy = {
  en: {
    title: "Invoice", back: "All invoices", print: "Print / save as PDF", loading: "Loading invoice…", missing: "This invoice could not be found.", declined: "Declined orders do not have an invoice.",
    number: "Invoice no.", date: "Date and time (Qatar)", orderNo: "Order no.", billTo: "Bill to", payment: "Payment", method: { COD: "Cash on delivery", PAYMENT_LINK: "Payment link" },
    status: { PAID: "Paid", PENDING: "Payment pending", FAILED: "Payment failed" } as Record<string, string>,
    item: "Item", sku: "SKU", qty: "Qty", unit: "Unit price", amount: "Amount", subtotal: "Subtotal", delivery: "Delivery", total: "Total", notes: "Delivery notes", toConfirm: "To be confirmed by QLeaves", totalBefore: "Total before delivery",
    cr: "Commercial Registration", license: "E-commerce license", thanks: "Thank you for choosing QLeaves.", currency: "All amounts are in Qatari Riyals (QAR).",
  },
  ar: {
    title: "فاتورة", back: "كل الفواتير", print: "طباعة / حفظ PDF", loading: "جارٍ تحميل الفاتورة…", missing: "تعذر العثور على هذه الفاتورة.", declined: "الطلبات المرفوضة ليس لها فاتورة.",
    number: "رقم الفاتورة", date: "التاريخ والوقت (بتوقيت قطر)", orderNo: "رقم الطلب", billTo: "العميل", payment: "الدفع", method: { COD: "الدفع عند الاستلام", PAYMENT_LINK: "رابط دفع" },
    status: { PAID: "مدفوع", PENDING: "الدفع معلق", FAILED: "فشل الدفع" } as Record<string, string>,
    item: "المنتج", sku: "الرمز", qty: "الكمية", unit: "سعر الوحدة", amount: "المبلغ", subtotal: "المجموع الفرعي", delivery: "التوصيل", total: "الإجمالي", notes: "ملاحظات التوصيل", toConfirm: "ستؤكدها QLeaves", totalBefore: "الإجمالي قبل التوصيل",
    cr: "السجل التجاري", license: "ترخيص التجارة الإلكترونية", thanks: "شكرًا لاختياركم QLeaves.", currency: "جميع المبالغ بالريال القطري (QAR).",
  },
};

function formatDate(iso: string, language: "en" | "ar"): string {
  return new Intl.DateTimeFormat(language === "ar" ? "ar-QA-u-nu-latn" : "en-GB", { timeZone: "Asia/Qatar", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso));
}

// The part of an order an invoice needs; customers receive this without their email address.
export type InvoiceOrder = Pick<AdminOrder, "id" | "orderNumber" | "createdAt" | "customerName" | "phone" | "addressLine1" | "area" | "deliveryNotes" | "paymentMethod" | "paymentStatus" | "status" | "subtotalQar" | "deliveryFeeQar" | "deliveryChargePending"> & {
  items: Array<Pick<AdminOrder["items"][number], "id" | "productName" | "sku" | "unitPriceQar" | "quantity">>;
};

export function InvoiceDocument({ order, language }: { order: InvoiceOrder; language: "en" | "ar" }) {
  const t = copy[language];
  const settings = useStoreSettings().data;
  const business = [
    settings?.commercialRegistration ? `${t.cr}: ${settings.commercialRegistration}` : null,
    settings?.ecommerceLicense ? `${t.license}: ${settings.ecommerceLicense}` : null,
    settings?.businessAddress ?? null,
    settings?.supportPhone ?? null,
    settings?.supportEmail ?? null,
  ].filter((line): line is string => Boolean(line));

  return (
    <article className="invoice" dir={language === "ar" ? "rtl" : "ltr"} lang={language} data-testid="invoice">
      <header className="invoice__head">
        <div>
          <img className="invoice__logo" src="/brand/qleaves-logo.png" alt="QLeaves" width={150} height={52} />
          {business.map((line) => <p key={line} className="invoice__muted">{line}</p>)}
        </div>
        <div className="invoice__title">
          <h1>{t.title}</h1>
          <dl>
            <div><dt>{t.number}</dt><dd dir="ltr">{invoiceNumber(order)}</dd></div>
            <div><dt>{t.date}</dt><dd>{formatDate(order.createdAt, language)}</dd></div>
            <div><dt>{t.orderNo}</dt><dd dir="ltr">{order.orderNumber}</dd></div>
          </dl>
        </div>
      </header>

      <section className="invoice__parties">
        <div>
          <h2>{t.billTo}</h2>
          <p><strong>{order.customerName}</strong></p>
          <p dir="ltr" className="invoice__start">{order.phone}</p>
          <p>{order.addressLine1}, {order.area}</p>
          {order.deliveryNotes ? <p className="invoice__muted">{t.notes}: {order.deliveryNotes}</p> : null}
        </div>
        <div>
          <h2>{t.payment}</h2>
          <p>{t.method[order.paymentMethod]}</p>
          <p className={`invoice__status invoice__status--${order.paymentStatus.toLowerCase()}`}>{t.status[order.paymentStatus] ?? order.paymentStatus}</p>
        </div>
      </section>

      <table className="invoice__lines">
        <thead>
          <tr><th scope="col">{t.item}</th><th scope="col">{t.sku}</th><th scope="col">{t.qty}</th><th scope="col">{t.unit}</th><th scope="col">{t.amount}</th></tr>
        </thead>
        <tbody>
          {order.items.map((item) => (
            <tr key={item.id}>
              <td>{item.productName}</td>
              <td dir="ltr">{item.sku}</td>
              <td>{item.quantity}</td>
              <td>{item.unitPriceQar}</td>
              <td>{item.unitPriceQar * item.quantity}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="invoice__totals">
        <div><dt>{t.subtotal}</dt><dd>{order.subtotalQar} QAR</dd></div>
        {order.deliveryChargePending
          ? <div><dt>{t.delivery}</dt><dd>{t.toConfirm}</dd></div>
          : order.deliveryFeeQar > 0 ? <div><dt>{t.delivery}</dt><dd>{order.deliveryFeeQar} QAR</dd></div> : null}
        <div className="invoice__grand"><dt>{order.deliveryChargePending ? t.totalBefore : t.total}</dt><dd>{invoiceTotal(order)} QAR</dd></div>
      </dl>

      <footer className="invoice__foot">
        <p>{t.thanks}</p>
        <p className="invoice__muted">{t.currency}</p>
      </footer>
    </article>
  );
}

export function AdminInvoicePage() {
  const { orderId } = useParams();
  const { language } = useSiteLanguage();
  const t = copy[language];
  const orders = useQuery({ queryKey: ["admin", "orders"], queryFn: adminApi.orders });
  const order = orders.data?.find((item) => item.id === orderId);

  return (
    <section className="page-shell admin-page invoice-page" data-testid="admin-invoice-page">
      <div className="invoice-toolbar">
        <Link to="/admin/invoices" className="primary-button primary-button--secondary">{t.back}</Link>
        {order && isInvoiceable(order) ? <button type="button" className="primary-button" onClick={() => window.print()}>{t.print}</button> : null}
      </div>
      {orders.isPending ? <p className="admin-state" role="status">{t.loading}</p> : null}
      {orders.isError ? <p className="admin-state" role="alert">{t.missing}</p> : null}
      {orders.isSuccess && !order ? <p className="admin-state" role="alert">{t.missing}</p> : null}
      {order && !isInvoiceable(order) ? <p className="admin-state" role="alert">{t.declined}</p> : null}
      {order && isInvoiceable(order) ? <InvoiceDocument order={order} language={language} /> : null}
    </section>
  );
}
