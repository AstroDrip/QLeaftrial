/**
 * Centralized customer-facing copy for the QLeaves storefront.
 * All user-visible strings live here so the interface can be localized later.
 */
export const content = {
  brand: "QLeaves",
  tagline: "Qatar home and office plants",

  nav: {
    shop: "Shop",
    cart: "Cart",
    admin: "Admin",
  },

  home: {
    heroTitle: "Plants change a room",
    heroSubtitle:
      "Carefully sourced indoor plants and trees, delivered to your door across Qatar.",
    shopCta: "Shop plants",
    featuredTitle: "Featured plants",
    arIntro:
      "Bring plants into your space with interactive 3D and phone-based augmented reality.",
  },

  catalog: {
    title: "Plant catalogue",
    searchPlaceholder: "Search plants",
    filterCategory: "Category",
    filterLight: "Light",
    filterAllCategories: "All categories",
    filterAllLights: "All light levels",
    sortBy: "Sort by",
    sortNameAsc: "Name (A–Z)",
    sortPriceAsc: "Price (low to high)",
    sortPriceDesc: "Price (high to low)",
    noResults: "No plants matched your filters.",
    viewProduct: (name: string) => `View ${name}`,
    page: (page: number, total: number) => `Page ${page} of ${total}`,
  },

  product: {
    inStock: "In stock",
    outOfStock: "Out of stock",
    addToCart: "Add to cart",
    quantity: "Quantity",
    careFacts: "Care facts",
    lightNeeds: "Light",
    category: "Category",
    noModel: "3D preview is not available for this plant.",
  },

  cart: {
    title: "Your cart",
    emptyHeading: "Your cart is empty",
    emptyMessage: "Add plants to get started.",
    continueShopping: "Continue shopping",
    subtotal: "Subtotal",
    checkout: "Checkout",
    itemCount: (count: number, total: number) => `${count} item(s)`,
    remove: "Remove",
    quantity: "Quantity",
    updated: "Cart updated",
  },

  checkout: {
    title: "Checkout",
    guestHeading: "Guest checkout",
    guestNotice:
      "No account needed. Enter your details and place your order.",
    customerName: "Full name",
    phone: "Phone number",
    email: "Email address",
    addressLine1: "Address line 1",
    area: "Area or town",
    deliveryNotes: "Delivery notes (optional)",
    paymentMethod: "Payment method",
    paymentCod: "Cash on delivery",
    paymentCodHint: "Pay with cash when your plants arrive.",
    paymentLink: "Payment link",
    paymentLinkHint: "We send a payment link after you place your order.",
    placeOrder: "Place order",
    submitting: "Placing your order…",
    errorSummary: "Please fix the problems below.",
  },

  order: {
    confirmation: "Thank you for your order",
    orderNumber: "Order number",
    summary: "Order summary",
    subtotal: "Subtotal",
    statusPending: "Pending confirmation",
    statusConfirmed: "Confirmed",
    statusPreparing: "Preparing",
    statusOutForDelivery: "Out for delivery",
    statusDelivered: "Delivered",
    statusCancelled: "Cancelled",
    paymentPending: "Payment pending",
    paymentPaid: "Paid",
    paymentFailed: "Payment failed",
    backToShop: "Back to shop",
  },

  admin: {
    loginTitle: "Admin sign in",
    email: "Email address",
    password: "Password",
    signIn: "Sign in",
    dashboard: "Admin dashboard",
    products: "Products",
    orders: "Orders",
    logout: "Log out",
    newPassword: "New development password",
    stock: "Stock",
    price: "Price (QAR)",
  },

  errors: {
    unexpected: "An unexpected error occurred.",
    retry: "Retry",
    retryFailed: "Could not load this content.",
  },
} as const;
