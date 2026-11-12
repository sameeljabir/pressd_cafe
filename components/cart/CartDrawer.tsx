"use client";

import { useEffect, useRef } from "react";
import { useCart } from "@/components/cart/CartContext";
import { escapeCartText } from "@/lib/cart";
import { useBusiness } from "@/components/SiteContentContext";
import { customizationText } from "@/lib/customization";
import { useLocale } from "@/lib/i18n/LocaleContext";

export default function CartDrawer() {
  const { cart, quantity, total, isOpen, closeCart, changeQty, whatsappHref, cartImageFor } = useCart();
  const business = useBusiness();
  const { t, dir } = useLocale();
  const closeRef = useRef<HTMLButtonElement>(null);
  const closeCartRef = useRef(closeCart);
  useEffect(() => {
    closeCartRef.current = closeCart;
  });

  // Keyboard: Escape closes the drawer (like the site's dialogs) and focus
  // moves into it when it opens.
  useEffect(() => {
    if (!isOpen) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeCartRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen]);

  return (
    <>
      <div
        className={`cart-backdrop${isOpen ? " open" : ""}`}
        aria-hidden="true"
        onClick={closeCart}
      />
      <aside
        className={`cart-drawer${isOpen ? " open" : ""}`}
        aria-hidden={!isOpen}
        // Off-screen when closed; inert keeps its buttons out of the Tab order.
        inert={!isOpen}
        aria-labelledby="cart-title"
        dir={dir}
      >
        <header>
          <div>
            <p>{t("ui.cartEyebrow", "YOUR ORDER")}</p>
            <h2 id="cart-title">
              {t("ui.cart", "CART")} <span className="cart-heading-count">{quantity}</span>
            </h2>
          </div>
          <button ref={closeRef} className="cart-close" aria-label={t("ui.closeCartAria", "Close cart")} onClick={closeCart}>
            ×
          </button>
        </header>
        <div className="cart-items" hidden={!cart.length}>
          {cart.map((item, index) => {
            const displayName = t(`products.${item.id}.name`, item.name);
            return (
              <article className="cart-item" key={`${item.id}-${index}`}>
                <img
                  className="cart-item-image"
                  src={cartImageFor(item)}
                  alt={escapeCartText(displayName)}
                />
                <div className="cart-item-copy">
                  <h3>{displayName}</h3>
                  <p>
                    {t("ui.currencyPrefix", "AED")} {item.price}
                  </p>
                  {item.customization && (
                    <p className="cart-item-customization">
                      <b>{t("ui.customizedLabel", "Customized:")}</b> {customizationText(item.customization)}
                    </p>
                  )}
                  {item.instructions && (
                    <p className="cart-item-instructions">
                      <b>{t("ui.specialInstructionsLabel", "Special instructions:")}</b> {item.instructions}
                    </p>
                  )}
                </div>
                <div className="cart-quantity">
                  <button
                    data-cart-action="minus"
                    aria-label={t("ui.removeOneAria", "Remove one {name}", { name: displayName })}
                    onClick={() => changeQty(index, -1)}
                  >
                    −
                  </button>
                  <span>{item.qty}</span>
                  <button
                    data-cart-action="plus"
                    aria-label={t("ui.addOneAria", "Add one {name}", { name: displayName })}
                    onClick={() => changeQty(index, 1)}
                  >
                    +
                  </button>
                </div>
              </article>
            );
          })}
        </div>
        <div className="cart-empty" hidden={cart.length > 0}>
          {t("ui.emptyCart", "Your cart is empty.")}
          <br />
          <a href="#menu">{t("ui.exploreMenu", "Explore the menu →")}</a>
        </div>
        <footer>
          <div className="cart-total">
            <span>{t("ui.total", "Total")}</span>
            <strong>
              {t("ui.currencyPrefix", "AED")} {total}
            </strong>
          </div>
          <a
            className={`whatsapp-order${cart.length ? "" : " disabled"}`}
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={!cart.length}
            onClick={(event) => {
              if (!cart.length) event.preventDefault();
            }}
          >
            <img src="/assets/whatsapp-transparent.webp" alt="" />
            {t("ui.orderOnWhatsapp", "Order on WhatsApp")}
          </a>
          <small>{t("ui.orderSentTo", "Order will be sent to {phone}", { phone: business.whatsapp })}</small>
        </footer>
      </aside>
    </>
  );
}
