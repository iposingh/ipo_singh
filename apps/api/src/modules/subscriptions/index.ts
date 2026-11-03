/** Public subscription routes are intentionally not mounted. */
export const subscriptionModule = {
  name: "subscriptions",
  publicRoutes: false,
} as const;
