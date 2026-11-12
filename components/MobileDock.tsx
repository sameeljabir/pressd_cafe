"use client";

import { useAlt } from "@/components/AltTextContext";
import { useCart } from "@/components/cart/CartContext";
import { useSectionLinkHandler } from "@/components/navigation/SectionNavContext";
import { BagIcon, HomeIcon, MenuLinesIcon } from "@/components/icons";
import { useBusiness, usePage } from "@/components/SiteContentContext";
import { NAVIGATION } from "@/lib/content/pages";
import { whatsappLink } from "@/lib/content/hours";

export default function MobileDock() {
  const alt = useAlt();
  const { quantity, openCart } = useCart();
  const handleLink = useSectionLinkHandler();
  const { t } = usePage(NAVIGATION);
  const business = useBusiness();

  return (
    <nav className="mobile-dock" aria-label="Mobile quick navigation">
      <a href="#home" onClick={handleLink("#home")}>
        <span><HomeIcon /></span>{t("dockHome")}
      </a>
      <a href="#menu" onClick={handleLink("#menu")}>
        <span><MenuLinesIcon /></span>{t("dockMenu")}
      </a>
      <button className="dock-cart" onClick={openCart}>
        <span>
          <BagIcon />
          <i>{quantity}</i>
        </span>
        {t("dockCart")}
      </button>
      <a
        href={whatsappLink(business.whatsapp, t("dockWhatsappMessage"))}
        target="_blank"
        rel="noopener noreferrer"
      >
        <img src="/assets/whatsapp-transparent.webp" alt={alt("chrome.dock.whatsapp")} />
        {t("dockWhatsapp")}
      </a>
    </nav>
  );
}
