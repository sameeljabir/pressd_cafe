// Re-prices saved cart lines from the published menu. Pure module (tested).
import type { MenuItem } from "../../data/menu.ts";
import { customizationExtra, type Customization } from "../customization.ts";

interface CartLine {
  id: string;
  name: string;
  basePrice: number;
  price: number;
  image: string;
  customization: Customization;
}

/**
 * Brings saved cart lines up to date with the published menu: current price,
 * English name and photo. Products that are hidden are removed (they can no
 * longer be ordered); lines for products the menu does not know are kept as saved.
 */
export function refreshCart<T extends CartLine>(cart: T[], src: { byId: ReadonlyMap<string, MenuItem> }, isHidden: (id: string) => boolean): T[] {
  return cart.flatMap((item) => {
    if (item.id && isHidden(item.id)) return [];
    const current = item.id ? src.byId.get(item.id) : undefined;
    if (!current) return [item];
    const basePrice = current[2];
    const price = basePrice + customizationExtra(item.customization);
    if (basePrice === item.basePrice && price === item.price && current[0] === item.name && current[3] === item.image) return [item];
    return [{ ...item, name: current[0], basePrice, price, image: current[3] }];
  });
}

