"use client";

import { CartProvider } from "@/components/cart/CartContext";
import { BookingProvider } from "@/components/booking/BookingContext";
import { SectionNavProvider } from "@/components/navigation/SectionNavContext";
import { LocaleProvider } from "@/lib/i18n/LocaleContext";
import { SiteContentProvider } from "@/components/SiteContentContext";
import type { SiteContent } from "@/lib/content/site";

export default function AppProviders({ content, children }: { content?: SiteContent | null; children: React.ReactNode }) {
  return (
    <SiteContentProvider content={content ?? null}>
      <SectionNavProvider>
        <LocaleProvider>
          <CartProvider>
            <BookingProvider>{children}</BookingProvider>
          </CartProvider>
        </LocaleProvider>
      </SectionNavProvider>
    </SiteContentProvider>
  );
}
