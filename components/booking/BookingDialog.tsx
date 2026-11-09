"use client";

import { useState } from "react";
import { useBooking } from "@/components/booking/BookingContext";
import { WHATSAPP_NUMBER } from "@/lib/cart";

export default function BookingDialog() {
  const { dialogRef, closeBooking } = useBooking();
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);

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
      <p className="eyebrow dark">SAVE YOUR SPOT</p>
      <h2>BOOK A TABLE.</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          // The request used to go nowhere: send it to the café on WhatsApp,
          // the same channel as cart orders.
          const form = new FormData(event.currentTarget);
          const message = [
            "Hello PRESS'D! I'd like to book a table.",
            `Name: ${form.get("name")}`,
            `Phone: ${form.get("phone")}`,
            `Date: ${form.get("date")}`,
            `Guests: ${form.get("guests")}`,
          ].join("\n");
          window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`, "_blank", "noopener");
          setNote("Your request is ready in WhatsApp — send it and we’ll confirm your table.");
          setSubmitted(true);
        }}
      >
        <label>
          Name
          <input name="name" required placeholder="Your name" />
        </label>
        <label>
          Phone
          <input name="phone" required type="tel" placeholder="+971" />
        </label>
        <div>
          <label>
            Date
            <input name="date" required type="date" />
          </label>
          <label>
            Guests
            <select name="guests">
              <option>2 guests</option>
              <option>3 guests</option>
              <option>4 guests</option>
              <option>5+ guests</option>
            </select>
          </label>
        </div>
        <button type="submit">{submitted ? "Request received ✓" : "Request table ↗"}</button>
        <p className="form-note" aria-live="polite">
          {note}
        </p>
      </form>
    </dialog>
  );
}
