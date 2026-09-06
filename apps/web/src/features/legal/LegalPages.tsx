import type { ReactNode } from "react";
import { Seo } from "../../components/Seo";
import "./LegalPages.css";
import { useSiteLanguage } from "../../app/providers";

const LAST_UPDATED = "5 September 2026";
const WHATSAPP_URL = "https://wa.me/97477551056";

function LegalShell({
  eyebrow,
  title,
  description,
  path,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  path: string;
  children: ReactNode;
}) {
  const { isArabic } = useSiteLanguage();
  return (
    <section className="page-shell legal-page">
      <Seo title={title} description={description} path={path} />
      <div className="page-shell__header">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
      </div>
      <p className="legal-page__updated">{isArabic ? "آخر تحديث: 5 سبتمبر 2026" : `Last updated: ${LAST_UPDATED}`}</p>
      <div className="legal-page__content">{children}</div>
    </section>
  );
}

function SupportLink() {
  const { isArabic } = useSiteLanguage();
  return (
    <a href={WHATSAPP_URL} target="_blank" rel="noreferrer">
      {isArabic ? "تواصل مع QLeaves عبر واتساب" : "Contact QLeaves on WhatsApp"}
    </a>
  );
}

export function PrivacyPage() {
  const { isArabic } = useSiteLanguage();
  if (isArabic) return <LegalShell eyebrow="معلوماتك" title="سياسة الخصوصية" description="كيف تجمع QLeaves معلومات العملاء وتستخدمها وتحميها." path="/privacy">
    <section><h2>المعلومات التي نجمعها</h2><p>عند تقديم طلب، تجمع QLeaves المعلومات التي تدخلها عند الدفع، ومنها الاسم ورقم الهاتف والبريد الإلكتروني وعنوان التوصيل والمنطقة وملاحظات التوصيل الاختيارية وطريقة الدفع والمنتجات والكميات المطلوبة.</p><p>قد يعالج الموقع ومزودو الاستضافة أيضًا معلومات الطلب التقنية الأساسية اللازمة لتقديم الخدمة وتشخيص الأخطاء وحماية المتجر من إساءة الاستخدام.</p></section>
    <section><h2>كيفية استخدام معلوماتك</h2><ul><li>لإنشاء طلبك وتأكيده وتجهيزه وتوصيله أو تحديثه أو إلغائه.</li><li>للتواصل معك بشأن توفر المنتجات أو التوصيل أو الدفع أو الدعم.</li><li>لإدارة سجلات الطلبات والمخزون وتشغيل المتجر بأمان.</li><li>للوفاء بمتطلبات حفظ السجلات أو الالتزامات القانونية.</li></ul></section>
    <section><h2>ملفات تعريف الارتباط والتتبع</h2><p>لا يستخدم المتجر حاليًا ملفات تعريف ارتباط إعلانية أو تحليلية عن قصد. تستخدم منطقة الإدارة ملف تعريف ارتباط ضروريًا للمصادقة حتى يظل الموظفون المخولون مسجلين.</p></section>
    <section><h2>التخزين ومزودو الخدمات</h2><p>تستخدم QLeaves مزودين خارجيين لاستضافة الموقع وواجهة البرمجة وقاعدة البيانات وصور المنتجات. يعالج هؤلاء المزودون المعلومات بالقدر اللازم لتشغيل خدماتهم، وقد تُشارك معلومات الطلب مع الأطراف المشاركة في تنفيذه عند الضرورة.</p></section>
    <section><h2>الاحتفاظ وطلباتك</h2><p>نحتفظ بمعلومات الطلب والعملاء للمدة المعقولة اللازمة لتنفيذ الطلبات وحفظ سجلات العمل وحل النزاعات وتأمين الخدمة والوفاء بالالتزامات القانونية. للتصحيح أو الحذف أو الاستفسار عن معلوماتك، تواصل معنا.</p><p><SupportLink /></p></section>
  </LegalShell>;
  return (
    <LegalShell
      eyebrow="Your information"
      title="Privacy Policy"
      description="How QLeaves collects, uses, and protects customer information when you browse or place an order."
      path="/privacy"
    >
      <section>
        <h2>Information we collect</h2>
        <p>
          When you place an order, QLeaves collects the information you submit at checkout, including your name, phone number, email address, delivery address, area, optional delivery notes, selected payment method, and the products and quantities in your order.
        </p>
        <p>
          The site and its hosting providers may also process basic technical request information needed to deliver the service, diagnose errors, and protect the storefront from abuse.
        </p>
      </section>

      <section>
        <h2>How we use your information</h2>
        <ul>
          <li>To create, confirm, prepare, deliver, update, or cancel your order.</li>
          <li>To contact you about product availability, delivery details, payment, or support.</li>
          <li>To maintain order and inventory records and operate the storefront securely.</li>
          <li>To meet record-keeping or legal obligations that apply to the business.</li>
        </ul>
      </section>

      <section>
        <h2>Cookies and tracking</h2>
        <p>
          The current storefront does not intentionally use advertising or analytics tracking cookies. The admin area uses a strictly necessary authentication cookie so authorized staff can remain signed in. If optional analytics or advertising tools are introduced later, this policy and any required consent controls should be updated before those tools are enabled.
        </p>
      </section>

      <section>
        <h2>Storage and service providers</h2>
        <p>
          QLeaves uses third-party infrastructure providers to host the website, API, database, and product-image storage. Those providers process information only as needed to operate those services. Order information may also be shared with people or services involved in fulfilling the order when necessary.
        </p>
      </section>

      <section>
        <h2>Retention and your requests</h2>
        <p>
          Order and customer information is retained only for as long as reasonably needed to fulfil orders, maintain business records, resolve disputes, secure the service, and meet applicable legal obligations. If you want to ask what information QLeaves holds about you or request a correction or deletion, contact QLeaves. Some records may need to be retained where required for legitimate business or legal reasons.
        </p>
        <p><SupportLink /></p>
      </section>
    </LegalShell>
  );
}

export function TermsPage() {
  const { isArabic } = useSiteLanguage();
  if (isArabic) return <LegalShell eyebrow="قواعد المتجر" title="الشروط والأحكام" description="شروط استخدام متجر QLeaves في قطر وتقديم طلبات النباتات." path="/terms">
    <section><h2>استخدام المتجر</h2><p>يمكنك تصفح كتالوج QLeaves وتقديم طلبات لأغراض شخصية أو قانونية. لا تسئ استخدام الموقع أو تعرقل تشغيله أو تحاول الوصول غير المصرح به أو تقدم طلبات زائفة أو مسيئة.</p></section>
    <section><h2>المنتجات والأسعار والتوفر</h2><p>تظهر الأسعار بالريال القطري وقد يتغير التوفر والمخزون. النباتات منتجات حية، لذلك يُتوقع اختلاف طبيعي في الحجم والشكل واللون والأوراق والمظهر، والصور تمثيلية وليست ضمانًا للتطابق التام.</p></section>
    <section><h2>الطلبات والدفع</h2><p>يؤدي إرسال نموذج الدفع إلى إنشاء طلب وفق الأسعار والتوفر المؤكدين من خادم QLeaves. قد نتواصل معك لتأكيد التوفر أو تفاصيل التوصيل أو الدفع. يدعم المتجر الدفع نقدًا عند الاستلام أو عبر رابط دفع.</p><p>يجوز رفض الطلب أو إلغاؤه إذا كان المنتج غير متوفر أو تعذر التحقق من البيانات أو إتمام الدفع أو التنفيذ.</p></section>
    <section><h2>معلومات طلبك</h2><p>أنت مسؤول عن تقديم معلومات اتصال وتوصيل دقيقة. إذا لاحظت خطأ بعد إرسال الطلب، تواصل مع QLeaves في أقرب وقت واذكر رقم الطلب.</p></section>
    <section><h2>الملكية الفكرية ومحتوى الموقع</h2><p>لا يجوز نسخ اسم QLeaves أو علامتها أو صورها أو نصوصها أو تصميم موقعها أو إعادة استخدامها بما ينتهك حقوق QLeaves أو الغير.</p></section>
    <section><h2>الأسئلة</h2><p>للاستفسار عن طلب أو هذه الشروط، <SupportLink />.</p></section>
  </LegalShell>;
  return (
    <LegalShell
      eyebrow="Store rules"
      title="Terms & Conditions"
      description="Terms for using the QLeaves Qatar storefront and placing plant orders."
      path="/terms"
    >
      <section>
        <h2>Using the storefront</h2>
        <p>
          You may browse the QLeaves catalogue and submit orders for personal or other lawful purposes. Do not misuse the site, interfere with its operation, attempt unauthorized access, or submit false or abusive orders.
        </p>
      </section>

      <section>
        <h2>Products, prices, and availability</h2>
        <p>
          Product prices are shown in QAR. Availability and stock can change. Because plants are living products, natural variation in size, shape, colour, foliage, and appearance is expected, and photographs are representative rather than a guarantee that every plant will look identical.
        </p>
      </section>

      <section>
        <h2>Orders and payment</h2>
        <p>
          Submitting checkout creates an order request using the prices and availability confirmed by the QLeaves server. QLeaves may contact you to confirm availability, delivery details, or payment before fulfilment. The storefront currently supports cash on delivery and payment link as payment-method options.
        </p>
        <p>
          An order may be declined or cancelled when a product is unavailable, the supplied order information cannot be verified, payment cannot be completed where required, or fulfilment is otherwise not possible.
        </p>
      </section>

      <section>
        <h2>Your order information</h2>
        <p>
          You are responsible for providing accurate contact and delivery information. If you notice an error after submitting an order, contact QLeaves as soon as possible and include the order number.
        </p>
      </section>

      <section>
        <h2>Intellectual property and site content</h2>
        <p>
          The QLeaves name, branding, photographs, written content, and site design may not be copied or reused in a way that infringes QLeaves or third-party rights. Product information may be updated when stock, care information, pricing, or catalogue details change.
        </p>
      </section>

      <section>
        <h2>Questions</h2>
        <p>For questions about an order or these terms, <SupportLink />.</p>
      </section>
    </LegalShell>
  );
}

export function ShippingReturnsPage() {
  const { isArabic } = useSiteLanguage();
  if (isArabic) return <LegalShell eyebrow="دعم الطلبات" title="الشحن والإرجاع" description="إرشادات QLeaves للتوصيل والإلغاء والتلف والإرجاع داخل قطر." path="/shipping-returns">
    <section><h2>التوصيل</h2><p>تخدم QLeaves العملاء في قطر. يعتمد توفر التوصيل وموعده على المنطقة وتوفر المنتجات وحالة الطلب. قدم رقم هاتف متاحًا وعنوانًا كاملًا حتى نتمكن من التواصل عند الحاجة.</p></section>
    <section><h2>تعديل الطلب أو إلغاؤه</h2><p>إذا احتجت إلى تعديل طلب أو إلغائه، تواصل مع QLeaves في أسرع وقت واذكر رقم الطلب. تعتمد إمكانية التعديل أو الإلغاء على مرحلة التجهيز والتوصيل.</p></section>
    <section><h2>العناصر التالفة أو الخاطئة أو الناقصة</h2><p>إذا وصل عنصر تالفًا أو مختلفًا عما طلبته أو كان ناقصًا، تواصل معنا سريعًا مع رقم الطلب والمعلومات اللازمة لمراجعة المشكلة. قد نطلب صورة لتأكيد حالة النبات أو المنتج.</p></section>
    <section><h2>حالة النبات والاختلاف الطبيعي</h2><p>النباتات منتجات حية والاختلاف الطبيعي متوقع. الاختلاف في الأوراق أو النمو أو الحجم أو الشكل أو اللون لا يعني وحده أن المنتج معيب. تراجع QLeaves مشكلات الحالة أو التنفيذ الحقيقية بصورة فردية.</p></section>
    <section><h2>الإرجاع والحلول</h2><p>تواصل مع QLeaves قبل إعادة أي عنصر. تعتمد الأهلية والحل المناسب على المنتج وحالته وسبب الطلب وحالة الطلب. سنؤكد خطوات الاستبدال أو الاسترداد أو الرصيد أو أي حل مناسب مباشرة.</p><p><SupportLink /></p></section>
  </LegalShell>;
  return (
    <LegalShell
      eyebrow="Order support"
      title="Shipping & Returns"
      description="QLeaves delivery, cancellation, damaged-item, and return guidance for plant orders in Qatar."
      path="/shipping-returns"
    >
      <section>
        <h2>Delivery</h2>
        <p>
          QLeaves serves customers in Qatar. Delivery availability and timing can depend on the delivery area, product availability, and the order status. Provide a reachable phone number and a complete delivery address so QLeaves can contact you if fulfilment details need to be confirmed.
        </p>
      </section>

      <section>
        <h2>Changing or cancelling an order</h2>
        <p>
          If you need to change or cancel an order, contact QLeaves as soon as possible and provide your order number. Whether a change or cancellation is possible depends on how far the order has progressed through preparation and delivery.
        </p>
      </section>

      <section>
        <h2>Damaged, incorrect, or missing items</h2>
        <p>
          If an item arrives damaged, is different from what was ordered, or is missing, contact QLeaves promptly with your order number and enough information to review the issue. A photo may be requested where it helps confirm the condition of a plant or product.
        </p>
      </section>

      <section>
        <h2>Plant condition and natural variation</h2>
        <p>
          Plants are living products and natural variation is expected. Differences in foliage, growth, size, shape, colour, or other natural characteristics do not by themselves mean that an item is defective. QLeaves will review genuine condition or fulfilment issues individually.
        </p>
      </section>

      <section>
        <h2>Returns and resolutions</h2>
        <p>
          Contact QLeaves before sending or returning any item. Return eligibility and the appropriate resolution depend on the product, its condition, the reason for the request, and the order status. Where a refund, replacement, credit, or other resolution is appropriate, QLeaves will confirm the next steps directly with you. Nothing on this page is intended to remove rights that cannot lawfully be excluded.
        </p>
        <p><SupportLink /></p>
      </section>
    </LegalShell>
  );
}
