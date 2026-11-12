// Cart data model + localStorage persistence. Keys are unchanged from the
// original site so existing customers' carts survive the migration:
//   pressd-cart, pressd-customizations, pressd-instructions
// Records are keyed by stable product `id`, not by the (now translatable)
// display name, so switching Menu language never loses or duplicates items.
// Lookups use the menu as published from SEO Studio when the caller passes it
// (CartProvider does); otherwise the code menu.
import { menuItemById, menuItemByName, type MenuItem } from "@/data/menu";
import {
  customizationExtra,
  customizationText,
  sanitizeCustomization,
  type Customization,
} from "@/lib/customization";

export const STORAGE_KEYS = {
  cart: "pressd-cart",
  customizations: "pressd-customizations",
  instructions: "pressd-instructions",
} as const;

export interface CartItem {
  id: string;
  /** Canonical English name — used for the WhatsApp order message and as a
   *  display fallback; the UI itself renders the translated name via `id`. */
  name: string;
  basePrice: number;
  price: number;
  image: string;
  instructions: string;
  customization: Customization;
  qty: number;
}

export interface MenuSource {
  byId: ReadonlyMap<string, MenuItem>;
  byName: ReadonlyMap<string, MenuItem>;
}
export const CODE_MENU_SOURCE: MenuSource = { byId: menuItemById, byName: menuItemByName };

export const cartMenuItem = (item: { id?: string; name: string }, src: MenuSource = CODE_MENU_SOURCE) =>
  (item.id && src.byId.get(item.id)) || src.byName.get(item.name);
export const cartImageFor = (item: CartItem, src: MenuSource = CODE_MENU_SOURCE) => item.image || cartMenuItem(item, src)?.[3] || "";
export const cartDetailsFor = (item: CartItem, src: MenuSource = CODE_MENU_SOURCE) => cartMenuItem(item, src)?.[1] || "";

export { refreshCart } from "@/lib/content/cartRefresh";

export function readCart(src: MenuSource = CODE_MENU_SOURCE): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.cart) || "[]") as CartItem[];
    return parsed.map((item) => {
      // Carts saved before product IDs existed only have `name` — backfill
      // the stable id from the live menu so language switching works for them too.
      const id = item.id || src.byName.get(item.name)?.[7] || "";
      const customization = item.customization;
      if (!customization || !("beans" in customization) || !customization.beans) {
        return { ...item, id };
      }
      const oldExtra = Number((customization as { extraPrice?: number }).extraPrice || 0);
      const basePrice = item.basePrice ?? item.price - oldExtra;
      const sanitized = sanitizeCustomization(customization);
      return {
        ...item,
        id,
        basePrice,
        price: basePrice + customizationExtra(sanitized),
        customization: sanitized,
      };
    });
  } catch {
    return [];
  }
}

export function saveCart(cart: CartItem[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.cart, JSON.stringify(cart));
}

/** Remaps any legacy name-keyed record to id-keyed, for records saved before product IDs existed. */
function byId<T>(raw: Record<string, T>, src: MenuSource): Record<string, T> {
  const result: Record<string, T> = {};
  for (const [key, value] of Object.entries(raw)) {
    const id = src.byId.has(key) ? key : src.byName.get(key)?.[7];
    if (id) result[id] = value;
  }
  return result;
}

export function readInstructions(src: MenuSource = CODE_MENU_SOURCE): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEYS.instructions) || "{}") as Record<string, string>;
    return byId(raw, src);
  } catch {
    return {};
  }
}

export function saveInstructions(value: Record<string, string>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.instructions, JSON.stringify(value));
}

export function readCustomizations(src: MenuSource = CODE_MENU_SOURCE): Record<string, Customization> {
  if (typeof window === "undefined") return {};
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEYS.customizations) || "{}") as Record<
      string,
      Customization
    >;
    return Object.fromEntries(
      Object.entries(byId(raw, src)).map(([product, customization]) => [
        product,
        sanitizeCustomization(customization),
      ])
    );
  } catch {
    return {};
  }
}

export function saveCustomizations(value: Record<string, Customization>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.customizations, JSON.stringify(value));
}

export const escapeCartText = (value: string) =>
  String(value || "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] || char
  );

export function publicImageUrl(item: CartItem, origin: string, src: MenuSource = CODE_MENU_SOURCE) {
  const image = cartImageFor(item, src);
  return image ? new URL(image, origin).href : "";
}

/** Code default; the live number comes from Business info (WhatsApp). */
export const WHATSAPP_NUMBER = "971556838426";

export function buildWhatsappMessage(cart: CartItem[], total: number, origin: string, src: MenuSource = CODE_MENU_SOURCE) {
  const lines = cart.map((item) => {
    const details = cartDetailsFor(item, src);
    const customizationLine = item.customization
      ? `\n  Customized: ${customizationText(item.customization)}`
      : "";
    const instructionsLine = item.instructions
      ? `\n  Special instructions: ${item.instructions}`
      : "";
    return `• ${item.name} x${item.qty} — AED ${item.price * item.qty}\n  Details: ${details}${customizationLine}${instructionsLine}\n  Image: ${publicImageUrl(item, origin, src)}`;
  });
  return `Hello PRESS'D! I'd like to order:\n\n${lines.join(
    "\n\n"
  )}\n\nTotal: AED ${total}\n\nPlease confirm availability and delivery/pickup details.`;
}
