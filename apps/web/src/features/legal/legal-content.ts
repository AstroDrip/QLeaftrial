// Customer policies written for an online plant store operating in Qatar, with
// reference to Law No. 13 of 2016 (Personal Data Privacy Protection),
// Decree-Law No. 16 of 2010 (Electronic Commerce and Transactions) and
// Law No. 8 of 2008 (Consumer Protection). A string array renders as a list.
export type LegalSection = { title: string; body: Array<string | string[]> };
export type LegalDocument = { eyebrow: string; title: string; description: string; sections: LegalSection[] };

export const LEGAL_UPDATED = { en: "Last updated: 28 October 2026", ar: "آخر تحديث: 28 أكتوبر 2026" };

export const legalContent: Record<"en" | "ar", { privacy: LegalDocument; terms: LegalDocument; shipping: LegalDocument; contactTitle: string; contactBody: string }> = {
  en: {
    contactTitle: "Contact us",
    contactBody: "For questions about these policies, your order or your personal data, message us with your order number and we will reply as soon as we can.",
    privacy: {
      eyebrow: "Your information",
      title: "Privacy Policy",
      description: "How QLeaves collects, uses, shares and protects personal data under Qatar's Law No. 13 of 2016 on Personal Data Privacy Protection.",
      sections: [
        { title: "Who we are", body: ["QLeaves is an online plant store operating in the State of Qatar and is responsible for the personal data collected through qleaves.qa. We process personal data in line with Law No. 13 of 2016 on the Protection of Personal Data Privacy and its implementing guidelines. Our business registration details are listed on our About us page."] },
        { title: "Information we collect", body: [
          "When you place an order we collect your name, phone number, email address, delivery address and area, optional delivery notes, your chosen payment method, and the products and quantities you order.",
          "We do not collect or store payment card details on this website. To protect the store from abuse, our servers keep limited technical information such as error logs and a one-way hashed form of your IP address.",
        ] },
        { title: "Why we use it", body: [
          "We use your information only for clear, specific purposes:",
          ["To confirm, prepare and deliver your order and to contact you about it by phone, WhatsApp or email.", "To handle questions, complaints, replacements and refunds.", "To keep the business and accounting records required by Qatari law.", "To keep the store secure and prevent fraud or misuse."],
          "We process this information because it is needed to fulfil your order, to meet our legal obligations, or for our legitimate interest in operating the store safely. We will not send you marketing messages without your consent, and you can withdraw consent at any time.",
        ] },
        { title: "Cookies and local storage", body: ["The storefront does not use advertising or analytics tracking cookies. Your browser stores your cart and language choice on your own device so they are remembered between visits; you can clear them at any time in your browser settings. The staff admin area uses one strictly necessary sign-in cookie."] },
        { title: "Who we share it with", body: [
          "We do not sell personal data. We share only what is needed with:",
          ["The people delivering your order.", "A licensed payment provider, if you choose to pay by payment link.", "Our technology providers for website hosting, database and image storage.", "A private Google Sheet kept by the shop, where order details (but not your email address) may be copied for record keeping."],
          "Some of these providers may store data on servers outside Qatar. Where that happens we use reputable providers that apply appropriate security safeguards to protect your data, as the law requires.",
        ] },
        { title: "How long we keep it", body: ["We keep order and customer information only for as long as needed for the purposes above, including any period required for accounting, tax or legal reasons. After that it is deleted or anonymised."] },
        { title: "How we protect it", body: ["Connections to our store are encrypted (HTTPS), access to customer data is limited to authorised staff, staff passwords are stored as secure hashes, and automated limits protect against abuse. If a data breach is likely to cause you serious harm, we will notify you and the competent authority as required by law."] },
        { title: "Your rights", body: [
          "Under Qatar's personal data privacy law you have the right to:",
          ["Be informed about how and why your data is processed.", "Access your personal data and receive a copy of it.", "Ask us to correct inaccurate or incomplete data.", "Ask us to delete data we no longer need for a lawful purpose.", "Object to processing that is not necessary, and withdraw your consent, including for marketing."],
          "To use any of these rights, contact us with your order number. If you are not satisfied with our response, you may complain to the competent personal data protection authority in Qatar.",
        ] },
        { title: "Children", body: ["Our store is intended for adults. Anyone under 18 should place orders with the consent of a parent or guardian, and we do not knowingly collect personal data from children."] },
        { title: "Changes to this policy", body: ["We may update this policy when our services or the law change. The date at the top of this page shows when it was last updated."] },
      ],
    },
    terms: {
      eyebrow: "Store rules",
      title: "Terms & Conditions",
      description: "Terms for buying plants from QLeaves in Qatar, governed by Qatari law including the Electronic Commerce and Consumer Protection laws.",
      sections: [
        { title: "About these terms", body: ["These terms apply to purchases made on qleaves.qa from QLeaves, a business operating in the State of Qatar. By placing an order you agree to them. They are governed by the laws of Qatar, including Decree-Law No. 16 of 2010 on Electronic Commerce and Transactions and Law No. 8 of 2008 on Consumer Protection, and nothing in them limits the rights those laws give you. Our business registration details are on our About us page."] },
        { title: "Using the store", body: ["You may browse the catalogue and place orders for lawful purposes. Do not misuse the site, interfere with its operation, attempt unauthorised access, or submit false or abusive orders."] },
        { title: "Products and prices", body: ["Prices are shown in Qatari Riyals (QAR). The delivery charge is shown before you place your order. Plants are living products, so natural variation in size, shape, colour and foliage is expected and photos are representative."] },
        { title: "Orders", body: ["When you submit checkout you send us an order request at the prices and availability confirmed by our server. We confirm your order by phone, WhatsApp or email. We may decline or cancel an order if a product is unavailable, your details cannot be verified, or a price was shown in error; if this happens we will tell you and refund anything you have paid."] },
        { title: "Payment", body: ["You can pay by cash on delivery, or by a payment link that we send after you place your order through a licensed payment provider. We will never ask for your card details on this website, by phone or by chat."] },
        { title: "Delivery", body: ["Delivery areas, charges and timing are explained on our Shipping & Returns page."] },
        { title: "Faulty or incorrect products", body: ["In line with the Consumer Protection Law, if a product is defective or does not match what you ordered, you are entitled to a replacement, a refund, or a free repair of the problem. Please see our Shipping & Returns page for how to report it."] },
        { title: "Your order information", body: ["You are responsible for giving us accurate contact and delivery information. If you notice a mistake after placing an order, contact us as soon as possible with your order number."] },
        { title: "Intellectual property", body: ["The QLeaves name, logo, photographs, text and site design may not be copied or reused without our permission."] },
        { title: "Our responsibility", body: ["We are responsible for supplying the products you order as described. Once delivered, a plant's health depends on its care conditions, but this never affects your rights under Qatari law."] },
        { title: "Complaints and governing law", body: ["Please contact us first so we can try to resolve any problem quickly. You may also contact the Consumer Protection Department of the Ministry of Commerce and Industry. These terms are governed by the laws of the State of Qatar, and the courts of Qatar have jurisdiction over any dispute."] },
      ],
    },
    shipping: {
      eyebrow: "Order support",
      title: "Shipping & Returns",
      description: "QLeaves delivery areas, charges, cancellations, faulty items and returns for plant orders in Qatar.",
      sections: [
        { title: "Delivery areas and charges", body: ["We deliver to Doha, Al Rayyan, Al Wakrah and Al Khor. The delivery charge is shown in QAR at checkout before you place your order. After ordering, we contact you to confirm a delivery time."] },
        { title: "Receiving your plants", body: ["Please keep your phone available on the delivery day and check your plants when they arrive. Unpack them promptly and keep them out of harsh direct sun until they settle in."] },
        { title: "Changing or cancelling an order", body: ["To change or cancel an order, contact us as soon as possible with your order number. Orders that have not been prepared or dispatched can be changed or cancelled; after dispatch it depends on how far the delivery has progressed."] },
        { title: "Damaged, incorrect or missing items", body: ["If an item arrives damaged, is different from what you ordered, or is missing, contact us promptly with your order number and a photo. In line with the Consumer Protection Law we will replace it, refund it, or fix the problem free of charge, including any collection needed."] },
        { title: "Plant condition and natural variation", body: ["Plants are living products and natural variation is expected. Differences in foliage, growth, size, shape or colour do not by themselves mean an item is defective, but we review every condition concern individually."] },
        { title: "Other returns", body: ["Because plants are perishable, returns for other reasons are reviewed case by case. Please contact us before sending anything back so we can agree the next steps with you."] },
        { title: "Refunds", body: ["Approved refunds are paid using your original payment method, or in cash for cash-on-delivery orders, as soon as the issue is confirmed."] },
      ],
    },
  },
  ar: {
    contactTitle: "تواصل معنا",
    contactBody: "لأي استفسار حول هذه السياسات أو طلبك أو بياناتك الشخصية، راسلنا مع رقم الطلب وسنرد في أقرب وقت.",
    privacy: {
      eyebrow: "معلوماتك",
      title: "سياسة الخصوصية",
      description: "كيف تجمع QLeaves البيانات الشخصية وتستخدمها وتشاركها وتحميها وفق القانون القطري رقم 13 لسنة 2016 بشأن حماية خصوصية البيانات الشخصية.",
      sections: [
        { title: "من نحن", body: ["QLeaves متجر إلكتروني للنباتات يعمل في دولة قطر، وهو المسؤول عن البيانات الشخصية التي تُجمع عبر qleaves.qa. نعالج البيانات الشخصية وفق القانون رقم 13 لسنة 2016 بشأن حماية خصوصية البيانات الشخصية وإرشاداته التنفيذية. تفاصيل تسجيل النشاط التجاري موجودة في صفحة من نحن."] },
        { title: "المعلومات التي نجمعها", body: [
          "عند تقديم طلب نجمع اسمك ورقم هاتفك وبريدك الإلكتروني وعنوان التوصيل والمنطقة وملاحظات التوصيل الاختيارية وطريقة الدفع والمنتجات والكميات المطلوبة.",
          "لا نجمع ولا نخزن بيانات بطاقات الدفع على هذا الموقع. ولحماية المتجر من إساءة الاستخدام تحتفظ خوادمنا بمعلومات تقنية محدودة مثل سجلات الأخطاء وصيغة مشفرة باتجاه واحد من عنوان IP.",
        ] },
        { title: "لماذا نستخدمها", body: [
          "نستخدم معلوماتك لأغراض محددة وواضحة فقط:",
          ["لتأكيد طلبك وتجهيزه وتوصيله والتواصل معك بشأنه عبر الهاتف أو واتساب أو البريد الإلكتروني.", "لمعالجة الاستفسارات والشكاوى والاستبدال والاسترداد.", "للاحتفاظ بالسجلات التجارية والمحاسبية التي يفرضها القانون القطري.", "لحماية المتجر ومنع الاحتيال أو إساءة الاستخدام."],
          "نعالج هذه المعلومات لأنها لازمة لتنفيذ طلبك أو للوفاء بالتزاماتنا القانونية أو لمصلحتنا المشروعة في تشغيل المتجر بأمان. لن نرسل إليك رسائل تسويقية دون موافقتك، ويمكنك سحب موافقتك في أي وقت.",
        ] },
        { title: "ملفات تعريف الارتباط والتخزين المحلي", body: ["لا يستخدم المتجر ملفات تعريف ارتباط إعلانية أو تحليلية للتتبع. يحفظ متصفحك سلة التسوق واختيار اللغة على جهازك فقط ليتذكرهما بين الزيارات، ويمكنك حذفهما في أي وقت من إعدادات المتصفح. وتستخدم منطقة إدارة الموظفين ملف تعريف ارتباط ضروريًا واحدًا لتسجيل الدخول."] },
        { title: "مع من نشاركها", body: [
          "لا نبيع البيانات الشخصية. نشارك فقط ما يلزم مع:",
          ["الأشخاص الذين يوصلون طلبك.", "مزود دفع مرخص، إذا اخترت الدفع عبر رابط الدفع.", "مزودي التقنية لاستضافة الموقع وقاعدة البيانات وتخزين الصور.", "جدول Google خاص يحتفظ به المتجر، قد تُنسخ إليه تفاصيل الطلب (دون بريدك الإلكتروني) لأغراض حفظ السجلات."],
          "قد يخزن بعض هؤلاء المزودين البيانات على خوادم خارج قطر، وفي هذه الحالة نستخدم مزودين موثوقين يطبقون ضمانات أمنية مناسبة لحماية بياناتك كما يتطلب القانون.",
        ] },
        { title: "مدة الاحتفاظ", body: ["نحتفظ بمعلومات الطلبات والعملاء فقط للمدة اللازمة للأغراض المذكورة أعلاه، بما في ذلك أي مدة مطلوبة لأسباب محاسبية أو ضريبية أو قانونية، ثم تُحذف أو تُجعل مجهولة الهوية."] },
        { title: "كيف نحميها", body: ["الاتصال بمتجرنا مشفر (HTTPS)، والوصول إلى بيانات العملاء مقتصر على الموظفين المخولين، وكلمات مرور الموظفين محفوظة بصيغة مشفرة آمنة، وتوجد حدود تلقائية للحماية من إساءة الاستخدام. وإذا كان من المرجح أن يسبب اختراق البيانات ضررًا جسيمًا لك، فسنبلغك ونبلغ الجهة المختصة وفق القانون."] },
        { title: "حقوقك", body: [
          "بموجب قانون حماية خصوصية البيانات الشخصية في قطر يحق لك:",
          ["معرفة كيفية معالجة بياناتك وسبب ذلك.", "الاطلاع على بياناتك الشخصية والحصول على نسخة منها.", "طلب تصحيح البيانات غير الدقيقة أو غير المكتملة.", "طلب حذف البيانات التي لم نعد بحاجة إليها لغرض مشروع.", "الاعتراض على المعالجة غير الضرورية وسحب موافقتك، بما في ذلك للتسويق."],
          "لممارسة أي من هذه الحقوق تواصل معنا مع رقم الطلب. وإذا لم تكن راضيًا عن ردنا، يمكنك تقديم شكوى إلى الجهة المختصة بحماية البيانات الشخصية في قطر.",
        ] },
        { title: "الأطفال", body: ["متجرنا مخصص للبالغين. يجب على من هم دون 18 عامًا تقديم الطلبات بموافقة أحد الوالدين أو ولي الأمر، ولا نجمع عن علم بيانات شخصية من الأطفال."] },
        { title: "تغييرات هذه السياسة", body: ["قد نحدّث هذه السياسة عند تغير خدماتنا أو القانون، ويوضح التاريخ أعلى الصفحة آخر تحديث لها."] },
      ],
    },
    terms: {
      eyebrow: "قواعد المتجر",
      title: "الشروط والأحكام",
      description: "شروط شراء النباتات من QLeaves في قطر، وتخضع للقانون القطري بما في ذلك قانوني التجارة الإلكترونية وحماية المستهلك.",
      sections: [
        { title: "عن هذه الشروط", body: ["تنطبق هذه الشروط على المشتريات من qleaves.qa التابع لـ QLeaves، وهو نشاط تجاري يعمل في دولة قطر. بتقديم طلبك فإنك توافق عليها. تخضع هذه الشروط لقوانين دولة قطر، بما في ذلك المرسوم بقانون رقم 16 لسنة 2010 بشأن المعاملات والتجارة الإلكترونية والقانون رقم 8 لسنة 2008 بشأن حماية المستهلك، ولا يحد أي شيء فيها من الحقوق التي تمنحها لك هذه القوانين. تفاصيل تسجيل النشاط التجاري موجودة في صفحة من نحن."] },
        { title: "استخدام المتجر", body: ["يمكنك تصفح الكتالوج وتقديم الطلبات لأغراض مشروعة. لا تسئ استخدام الموقع أو تعرقل تشغيله أو تحاول الوصول غير المصرح به أو تقدم طلبات زائفة أو مسيئة."] },
        { title: "المنتجات والأسعار", body: ["تظهر الأسعار بالريال القطري، وتظهر رسوم التوصيل قبل تقديم الطلب. النباتات منتجات حية، لذا يُتوقع اختلاف طبيعي في الحجم والشكل واللون والأوراق، والصور تمثيلية."] },
        { title: "الطلبات", body: ["عند إرسال نموذج الدفع فإنك ترسل طلبًا وفق الأسعار والتوفر المؤكدين من خادمنا، ونؤكد طلبك عبر الهاتف أو واتساب أو البريد الإلكتروني. يجوز لنا رفض الطلب أو إلغاؤه إذا كان المنتج غير متوفر أو تعذر التحقق من بياناتك أو ظهر السعر بالخطأ، وفي هذه الحالة سنبلغك ونرد أي مبلغ دفعته."] },
        { title: "الدفع", body: ["يمكنك الدفع نقدًا عند الاستلام أو عبر رابط دفع نرسله بعد تقديم الطلب من خلال مزود دفع مرخص. لن نطلب بيانات بطاقتك على هذا الموقع أو عبر الهاتف أو المحادثة."] },
        { title: "التوصيل", body: ["مناطق التوصيل ورسومه ومواعيده موضحة في صفحة الشحن والإرجاع."] },
        { title: "المنتجات المعيبة أو غير المطابقة", body: ["وفقًا لقانون حماية المستهلك، إذا كان المنتج معيبًا أو غير مطابق لما طلبته، يحق لك استبداله أو استرداد قيمته أو إصلاح المشكلة مجانًا. يرجى مراجعة صفحة الشحن والإرجاع لمعرفة طريقة الإبلاغ."] },
        { title: "معلومات طلبك", body: ["أنت مسؤول عن تقديم معلومات اتصال وتوصيل دقيقة. إذا لاحظت خطأ بعد تقديم الطلب، تواصل معنا في أقرب وقت مع رقم الطلب."] },
        { title: "الملكية الفكرية", body: ["لا يجوز نسخ اسم QLeaves أو شعارها أو صورها أو نصوصها أو تصميم موقعها أو إعادة استخدامها دون إذننا."] },
        { title: "مسؤوليتنا", body: ["نحن مسؤولون عن توريد المنتجات التي تطلبها كما هي موصوفة. بعد التوصيل تعتمد صحة النبات على ظروف العناية به، لكن ذلك لا يمس أبدًا حقوقك بموجب القانون القطري."] },
        { title: "الشكاوى والقانون الواجب التطبيق", body: ["يرجى التواصل معنا أولًا حتى نحاول حل أي مشكلة بسرعة، ويمكنك أيضًا التواصل مع إدارة حماية المستهلك في وزارة التجارة والصناعة. تخضع هذه الشروط لقوانين دولة قطر، وتختص محاكم قطر بأي نزاع."] },
      ],
    },
    shipping: {
      eyebrow: "دعم الطلبات",
      title: "الشحن والإرجاع",
      description: "مناطق التوصيل والرسوم والإلغاء والمنتجات المعيبة والإرجاع لطلبات النباتات من QLeaves في قطر.",
      sections: [
        { title: "مناطق التوصيل والرسوم", body: ["نوصل إلى الدوحة والريان والوكرة والخور. تظهر رسوم التوصيل بالريال القطري عند الدفع قبل تقديم الطلب، وبعد الطلب نتواصل معك لتأكيد موعد التوصيل."] },
        { title: "استلام نباتاتك", body: ["يرجى إبقاء هاتفك متاحًا يوم التوصيل وفحص النباتات عند وصولها. أخرجها من التغليف سريعًا وأبعدها عن الشمس المباشرة القوية حتى تستقر."] },
        { title: "تعديل الطلب أو إلغاؤه", body: ["لتعديل طلب أو إلغائه تواصل معنا في أسرع وقت مع رقم الطلب. يمكن تعديل الطلبات أو إلغاؤها قبل تجهيزها أو إرسالها، وبعد الإرسال يعتمد ذلك على مرحلة التوصيل."] },
        { title: "العناصر التالفة أو الخاطئة أو الناقصة", body: ["إذا وصل عنصر تالفًا أو مختلفًا عما طلبته أو كان ناقصًا، تواصل معنا سريعًا مع رقم الطلب وصورة. ووفقًا لقانون حماية المستهلك سنستبدله أو نرد قيمته أو نصلح المشكلة مجانًا، بما في ذلك أي استلام لازم."] },
        { title: "حالة النبات والاختلاف الطبيعي", body: ["النباتات منتجات حية والاختلاف الطبيعي متوقع. الاختلاف في الأوراق أو النمو أو الحجم أو الشكل أو اللون لا يعني وحده أن المنتج معيب، لكننا نراجع كل ملاحظة على حدة."] },
        { title: "حالات الإرجاع الأخرى", body: ["لأن النباتات منتجات قابلة للتلف، تُراجع طلبات الإرجاع لأسباب أخرى حسب كل حالة. يرجى التواصل معنا قبل إعادة أي عنصر لنتفق على الخطوات التالية."] },
        { title: "الاسترداد", body: ["تُدفع المبالغ المستردة الموافق عليها بطريقة الدفع الأصلية، أو نقدًا لطلبات الدفع عند الاستلام، فور تأكيد المشكلة."] },
      ],
    },
  },
};
