"use client";

import { useAlt } from "@/components/AltTextContext";
import { useCart } from "@/components/cart/CartContext";
import { useSectionLinkHandler } from "@/components/navigation/SectionNavContext";
import { BagIcon, HomeIcon, MenuLinesIcon } from "@/components/icons";

export default function MobileDock() {
  const alt = useAlt();
  const { quantity, openCart } = useCart();
  const handleLink = useSectionLinkHandler();

  return (
    <nav className="mobile-dock" aria-label="Mobile quick navigation">
      <a href="#home" onClick={handleLink("#home")}>
        <span><HomeIcon /></span>Home
      </a>
      <a href="#menu" onClick={handleLink("#menu")}>
        <span><MenuLinesIcon /></span>Menu
      </a>
      <button className="dock-cart" onClick={openCart}>
        <span>
          <BagIcon />
          <i>{quantity}</i>
        </span>
        Cart
      </button>
      <a
        href="https://wa.me/971556838426?text=Hello%20PRESS%27D!%20I%27d%20like%20to%20place%20an%20order."
        target="_blank"
        rel="noopener noreferrer"
      >
        <img src="/assets/whatsapp-transparent.webp" alt={alt("chrome.dock.whatsapp")} />
        WhatsApp
      </a>
    </nav>
  );
}
