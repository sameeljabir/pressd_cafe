"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  buildWhatsappMessage,
  cartDetailsFor,
  cartImageFor,
  publicImageUrl,
  readCart,
  refreshCart,
  saveCart,
  type CartItem,
  type MenuSource,
} from "@/lib/cart";
import { useBusiness, useMenuData } from "@/components/SiteContentContext";
import type { MenuItem } from "@/data/menu";
import { phoneDigits } from "@/lib/content/hours";
import { customizationExtra, type Customization } from "@/lib/customization";
import { readCustomizations, readInstructions } from "@/lib/cart";

interface AddToCartInput {
  id: string;
  name: string;
  basePrice: number;
  image: string;
}

interface CartContextValue {
  cart: CartItem[];
  quantity: number;
  total: number;
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  addToCart: (input: AddToCartInput) => void;
  changeQty: (index: number, delta: 1 | -1) => void;
  applyCustomization: (id: string, customization: Customization, instructions: string) => void;
  whatsappHref: string;
  cartImageFor: (item: CartItem) => string;
  cartDetailsFor: (item: CartItem) => string;
  /** The published menu the cart prices from. */
  menuSource: MenuSource;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const { byId: liveById, isHidden } = useMenuData();
  const business = useBusiness();
  const src = useMemo<MenuSource>(() => {
    const byName = new Map<string, MenuItem>();
    for (const it of liveById.values()) byName.set(it[0], it);
    return { byId: liveById, byName };
  }, [liveById]);

  useEffect(() => {
    // Intentional one-time hydration from localStorage (unavailable during
    // SSR): starting from [] on the server and syncing here avoids a
    // server/client markup mismatch, which a lazy useState initializer would
    // reintroduce.
    // Saved lines are re-priced from the published menu (hidden products removed).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCart(refreshCart(readCart(src), src, isHidden));
    setHydrated(true);
  }, [src, isHidden]);

  useEffect(() => {
    if (hydrated) saveCart(cart);
  }, [cart, hydrated]);

  const quantity = useMemo(() => cart.reduce((sum, item) => sum + item.qty, 0), [cart]);
  const total = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.qty, 0), [cart]);

  const addToCart = useCallback(({ id, name, basePrice, image }: AddToCartInput) => {
    const instructions = readInstructions(src)[id] || "";
    const customization = readCustomizations(src)[id];
    const price = basePrice + customizationExtra(customization);
    setCart((prev) => {
      const existing = prev.find((item) => item.id === id);
      if (existing) {
        return prev.map((item) =>
          item.id === id
            ? { ...item, qty: item.qty + 1, basePrice, price, image: image || item.image, instructions, customization }
            : item
        );
      }
      return [...prev, { id, name, basePrice, price, image, instructions, customization, qty: 1 }];
    });
  }, [src]);

  const changeQty = useCallback((index: number, delta: 1 | -1) => {
    setCart((prev) =>
      prev
        .map((item, i) => (i === index ? { ...item, qty: item.qty + delta } : item))
        .filter((item) => item.qty > 0)
    );
  }, []);

  const applyCustomization = useCallback(
    (id: string, customization: Customization, instructions: string) => {
      setCart((prev) =>
        prev.map((item) => {
          if (item.id !== id) return item;
          const basePrice = item.basePrice ?? item.price - customizationExtra(item.customization);
          return {
            ...item,
            basePrice,
            price: basePrice + customizationExtra(customization),
            customization,
            instructions,
          };
        })
      );
    },
    []
  );

  const whatsappHref = useMemo(() => {
    if (!cart.length || typeof window === "undefined") return "#";
    const message = buildWhatsappMessage(cart, total, window.location.href, src);
    return `https://wa.me/${phoneDigits(business.whatsapp)}?text=${encodeURIComponent(message)}`;
  }, [cart, total, src, business.whatsapp]);

  const value: CartContextValue = {
    cart,
    quantity,
    total,
    isOpen,
    openCart: () => setIsOpen(true),
    closeCart: () => setIsOpen(false),
    addToCart,
    changeQty,
    applyCustomization,
    whatsappHref,
    cartImageFor: (item) => cartImageFor(item, src),
    cartDetailsFor: (item) => cartDetailsFor(item, src),
    menuSource: src,
  };

  useEffect(() => {
    document.body.classList.toggle("cart-open", isOpen);
  }, [isOpen]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}

export { publicImageUrl };
