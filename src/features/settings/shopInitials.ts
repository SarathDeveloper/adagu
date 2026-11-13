/** One or two letters for the sidebar mark when the shop has not uploaded a logo. */
export function shopInitials(shopName: string): string {
  const parts = shopName.trim().split(/\s+/).filter(Boolean)
  // No shop name yet: show the product's initials.
  if (parts.length === 0) return 'PD'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase()
}
