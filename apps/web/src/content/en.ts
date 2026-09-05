export const content = {
  brand: "QLeaves",
  tagline: "Indoor plants, thoughtfully selected in Qatar",
  nav: { shop: "Shop", cart: "Cart", admin: "Admin" },
  home: {
    heroTitle: "For the love of art and plants.",
    heroSubtitle: "A living tally of what is actually ready to bring warmth, texture and quiet life into your space in Qatar.",
    shopCta: "Shop plants",
    featuredTitle: "What's actually available",
    motto: "Thoughtfully chosen greenery to bring a little more life, warmth and beauty into the spaces you call home.",
  },
  catalog: {
    title: "Plant collection", searchPlaceholder: "Search plants", filterCategory: "Category", filterLight: "Light", filterAllCategories: "All categories", filterAllLights: "All light levels", sortBy: "Sort by", sortNameAsc: "Name (A–Z)", sortPriceAsc: "Price (low to high)", sortPriceDesc: "Price (high to low)", noResults: "No plants matched your filters.", viewProduct: (name: string) => `View ${name}`, page: (page: number, total: number) => `Page ${page} of ${total}`,
  },
  product: { inStock: "In stock", outOfStock: "Out of stock", addToCart: "Add to cart", quantity: "Quantity", careFacts: "Care facts", lightNeeds: "Light", category: "Category" },
  cart: { title: "Your cart", emptyHeading: "Your cart is empty", emptyMessage: "Add a little green to begin.", continueShopping: "Continue shopping", subtotal: "Subtotal", checkout: "Checkout", itemCount: (count: number, _total: number) => `${count} item(s)`, remove: "Remove", quantity: "Quantity", updated: "Cart updated" },
  checkout: { title: "Checkout", guestHeading: "Guest checkout", guestNotice: "No account needed. Enter your details and place your order.", customerName: "Full name", phone: "Phone number", email: "Email address", addressLine1: "Address line 1", area: "Area or town", deliveryNotes: "Delivery notes (optional)", paymentMethod: "Payment method", paymentCod: "Cash on delivery", paymentCodHint: "Pay with cash when your plants arrive.", paymentLink: "Payment link", paymentLinkHint: "We send a payment link after you place your order.", placeOrder: "Place order", submitting: "Placing your order…", errorSummary: "Please fix the problems below." },
  order: { confirmation: "Thank you for your order", orderNumber: "Order number", summary: "Order summary", subtotal: "Subtotal", statusPending: "Pending confirmation", statusConfirmed: "Confirmed", statusPreparing: "Preparing", statusOutForDelivery: "Out for delivery", statusDelivered: "Delivered", statusCancelled: "Cancelled", paymentPending: "Payment pending", paymentPaid: "Paid", paymentFailed: "Payment failed", backToShop: "Back to shop" },
  admin: { loginTitle: "Admin sign in", password: "Password", signIn: "Sign in", dashboard: "Admin dashboard", products: "Products", orders: "Orders", sales: "Sales reports", logout: "Log out", stock: "Stock", price: "Price (QAR)" },
  common: { loading: "Loading…", noOrders: "No orders right now", deleteAll: "Delete all visible", deleteAllPrompt: "Delete all visible orders in this tab? This cannot be undone." },
  errors: { unexpected: "An unexpected error occurred.", retry: "Retry", retryFailed: "Could not load this content." },
} as const;
