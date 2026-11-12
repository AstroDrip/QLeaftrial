// Delivery rules, shared by the API and the storefront (apps/web re-exports this file). Pure TypeScript.
//
// Orders of FREE_DELIVERY_THRESHOLD_QAR or more are delivered free (the storefront's free-delivery bar).
// Below it, the delivery charge is not priced online: the QLeaves team contacts the customer to confirm it,
// and the order records that the charge is still to be confirmed. Nothing here invents a delivery price.
export const FREE_DELIVERY_THRESHOLD_QAR = 150;

/** True when the team must confirm the delivery charge: the merchandise subtotal is strictly below the threshold. */
export function deliveryChargeToConfirm(merchandiseSubtotalQar: number): boolean {
  return merchandiseSubtotalQar < FREE_DELIVERY_THRESHOLD_QAR;
}
