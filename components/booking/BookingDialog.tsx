"use client";

import { useState } from "react";
import { useBooking } from "@/components/booking/BookingContext";
import { useBusiness, usePage } from "@/components/SiteContentContext";
import { BOOKING } from "@/lib/content/pages";
import { phoneDigits } from "@/lib/content/hours";

export default function BookingDialog() {
  const { dialogRef, closeBooking } = useBooking();
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const { t, en, list } = usePage(BOOKING);
  const business = useBusiness();

  return (
    <dialog
      className="booking"
      ref={dialogRef}
      onClick={(event) => {
        if (event.target === event.currentTarget) closeBooking();
      }}
      onClose={() => {
        setSubmitted(false);
        setNote("");
      }}
    >
      <button className="dialog-close" aria-label="Close" onClick={closeBooking}>
        ×
      </button>
      <p className="eyebrow dark">{t("eyebrow")}</p>
      <h2>{t("heading")}</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          // The request used to go nowhere: send it to the café on WhatsApp,
          // the same channel as cart orders.
          const form = new FormData(event.currentTarget);
          const message = [
            en("messageIntro"),
            `Name: ${form.get("name")}`,
            `Phone: ${form.get("phone")}`,
            `Date: ${form.get("date")}`,
            `Guests: ${form.get("guests")}`,
          ].join("\n");
          window.open(`https://wa.me/${phoneDigits(business.whatsapp)}?text=${encodeURIComponent(message)}`, "_blank", "noopener");
          setNote(t("confirmation"));
          setSubmitted(true);
        }}
      >
        <label>
          {t("nameLabel")}
          <input name="name" required placeholder={t("namePlaceholder")} />
        </label>
        <label>
          {t("phoneLabel")}
          <input name="phone" required type="tel" placeholder={t("phonePlaceholder")} />
        </label>
        <div>
          <label>
            {t("dateLabel")}
            <input name="date" required type="date" />
          </label>
          <label>
            {t("guestsLabel")}
            <select name="guests">
              {list("guests").map((g) => {
                const label = t(`guests.${g.id}.label`);
                const english = en(`guests.${g.id}.label`);
                // The café receives the English option; visitors see their language.
                return (
                  <option key={g.id} value={english === label ? undefined : english}>
                    {label}
                  </option>
                );
              })}
            </select>
          </label>
        </div>
        <button type="submit">{submitted ? t("submitted") : t("submit")}</button>
        <p className="form-note" aria-live="polite">
          {note}
        </p>
      </form>
    </dialog>
  );
}
