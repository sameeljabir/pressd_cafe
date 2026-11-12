"use client";

import { useAlt } from "@/components/AltTextContext";
import { useBooking } from "@/components/booking/BookingContext";
import SectionHomeButton from "@/components/SectionHomeButton";
import { useBusiness, usePage } from "@/components/SiteContentContext";
import { VISIT } from "@/lib/content/pages";
import { phoneDigits, socialHandle, visibleHours } from "@/lib/content/hours";

const GALLERY_KEYS = [
  ["visit.sofa", "gallery1"],
  ["visit.dish", "gallery2"],
  ["visit.counter", "gallery3"],
  ["visit.pour", "gallery4"],
] as const;

/** Minimal continuous-line sketch of a cat and dog cuddling — understated warm-gold linework */
function PetLoveArt() {
  return (
    <svg
      className="visit-pet-art"
      viewBox="0 0 460 300"
      fill="none"
      aria-hidden="true"
    >
      <g strokeLinecap="round" strokeLinejoin="round">
        {/* Hearts */}
        <path
          d="M225,108 C211,94 211,82 221,80 C227,79 225,86 225,90 C225,86 223,79 229,80 C239,82 239,94 225,108 Z"
          stroke="var(--orange, #fbb019)"
          strokeWidth="1.8"
          opacity="0.85"
        />
        <path
          d="M258,82 C250,74 250,67 256,66 C259,65.5 258,69 258,71 C258,69 257,65.5 260,66 C266,67 266,74 258,82 Z"
          stroke="#c9922f"
          strokeWidth="1.4"
          opacity="0.65"
        />

        {/* Cat */}
        <path
          d="M118,260 C112,230 112,205 122,188 C128,176 136,168 146,165 C156,168 160,178 158,190 C170,195 182,205 190,218 C196,228 198,240 196,252 L196,260"
          stroke="var(--orange, #fbb019)"
          strokeWidth="2.2"
        />
        <path d="M134,166 L130,146 L146,160" stroke="var(--orange, #fbb019)" strokeWidth="2" />
        <path d="M150,163 L156,144 L166,160" stroke="var(--orange, #fbb019)" strokeWidth="2" />
        <path
          d="M196,255 C215,250 225,230 215,210 C208,196 190,192 180,200"
          stroke="var(--orange, #fbb019)"
          strokeWidth="2"
        />
        <circle cx="149" cy="179" r="1.5" fill="var(--orange, #fbb019)" stroke="none" />

        {/* Dog */}
        <circle cx="280" cy="168" r="27" stroke="#c9922f" strokeWidth="2.2" />
        <path
          d="M300,146 C315,152 318,172 306,186 C301,192 292,193 286,188"
          stroke="#c9922f"
          strokeWidth="2"
        />
        <path d="M256,182 C250,205 248,230 252,250 L254,260" stroke="#c9922f" strokeWidth="2.2" />
        <path
          d="M300,150 C330,148 365,160 385,185 C398,202 400,225 394,248 L390,260"
          stroke="#c9922f"
          strokeWidth="2.2"
        />
        <path
          d="M390,250 C404,242 408,226 400,214 C396,207 386,206 382,212"
          stroke="#c9922f"
          strokeWidth="2"
        />
        <circle cx="269" cy="160" r="1.8" fill="#c9922f" stroke="none" />
        <circle cx="258" cy="186" r="1.6" fill="#c9922f" stroke="none" />
      </g>
    </svg>
  );
}

export default function VisitSection() {
  const alt = useAlt();
  const { openBooking } = useBooking();
  const { t, shared } = usePage(VISIT);
  const business = useBusiness();
  const MAPS_URL = business.mapsUrl;
  const SCHEDULE = visibleHours(business.openingHours);

  return (
    <section className="visit section" id="visit" aria-label="Visit PRESS'D Wellness Café">
      <div className="visit-grid">
        {/* 1. UPPER LEFT: OPENING HOURS PANEL */}
        <div className="visit-panel visit-hours-panel">
          <div className="visit-panel-header">
            <span className="visit-line-dec" aria-hidden="true" />
            <div className="visit-heading-wrap">
              <span className="visit-micro-eyebrow">{t("hoursEyebrow")}</span>
              <h2 className="visit-panel-serif-title">
                <span>{t("hoursTitle1")}</span>
                <span>{t("hoursTitle2")}</span>
              </h2>
            </div>
            <span className="visit-line-dec" aria-hidden="true" />
          </div>

          <div className="visit-schedule-list">
            {SCHEDULE.map((item) => (
              <div key={item.day} className="visit-schedule-row">
                <span className="visit-schedule-day">{item.day}</span>
                <span className="visit-schedule-dots" aria-hidden="true" />
                <span className="visit-schedule-time">{item.hours}</span>
              </div>
            ))}
          </div>

          <div className="visit-hours-footer">
            <p className="visit-hours-service-note">{t("serviceNote")}</p>
            <p className="visit-hours-narrative">{t("narrative")}</p>

            <div className="visit-action-group">
              <button
                type="button"
                className="visit-btn-book"
                onClick={openBooking}
                aria-label="Book a table at PRESS'D"
              >
                {t("bookLabel")} <span>↗</span>
              </button>
              <a
                href={MAPS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="visit-link-directions"
                aria-label="Get directions to PRESS'D on Google Maps"
              >
                {t("directionsLabel")} <span>→</span>
              </a>
            </div>
          </div>
        </div>

        {/* 2. UPPER RIGHT: 2x2 IMAGE GALLERY */}
        <div className="visit-gallery-grid" aria-label="Café gallery">
          {GALLERY_KEYS.map(([key, field], i) => (
            <figure key={i} className="visit-gallery-tile">
              <img src={shared[field] as string} alt={alt(key)} loading="lazy" />
            </figure>
          ))}
        </div>

        {/* 3. LOWER LEFT: MAP / LOCATION PANEL */}
        <div className="visit-panel visit-map-panel">
          <div className="visit-map-header">
            <div>
              <span className="visit-micro-eyebrow">{t("locationEyebrow")}</span>
              <h3 className="visit-location-title">{t("locationTitle")}</h3>
              <p className="visit-location-text">{t("locationLine")}</p>
            </div>
            <a
              href={MAPS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="visit-map-route-cta"
              aria-label="Show route to PRESS'D on Google Maps"
            >
              {t("routeLabel")} <span>→</span>
            </a>
          </div>

          <div className="visit-map-viewport">
            <iframe
              title="PRESS'D Wellness Café Google Maps Location"
              src="https://maps.google.com/maps?q=PRESS%E2%80%99D%20Wellness%20Caf%C3%A9&ftid=0x3e5f69b12bacfaa1:0xf705edb34aadfb3c&t=&z=16&ie=UTF8&iwloc=&output=embed"
              className="visit-map-iframe"
              loading="lazy"
              allowFullScreen
            />
            <a
              href={MAPS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="visit-map-badge"
              aria-label="Open in Google Maps"
            >
              {t("openMapsLabel")} ↗
            </a>
          </div>
        </div>

        {/* 4. LOWER RIGHT: GET IN TOUCH PANEL */}
        <div className="visit-panel visit-touch-panel">
          <div className="visit-touch-head">
            <span className="visit-micro-eyebrow">{t("touchEyebrow")}</span>
            <h2 className="visit-panel-serif-title">
              <span>{t("touchTitle1")}</span>
              <span>{t("touchTitle2")}</span>
            </h2>
            <div className="visit-title-divider" aria-hidden="true" />
          </div>

          <div className="visit-contact-entries">
            <div className="visit-contact-entry">
              <span className="visit-entry-label">{t("addressLabel")}</span>
              <a
                href={MAPS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="visit-entry-val visit-entry-address-link"
                title={`View ${(business.addressLines[0] ?? "").replace(",", "")} on Google Maps`}
              >
                {business.addressLines.map((line, i) => (
                  <span key={i}>
                    {i > 0 && <br />}
                    {line}
                  </span>
                ))}
              </a>
            </div>

            <div className="visit-contact-entry">
              <span className="visit-entry-label">{t("phoneLabel")}</span>
              <a href={`tel:+${phoneDigits(business.telephone)}`} className="visit-entry-link">
                {business.telephone}
              </a>
            </div>

            <div className="visit-contact-entry">
              <span className="visit-entry-label">{t("emailLabel")}</span>
              <a href={`mailto:${business.email}`} className="visit-entry-link">
                {business.email}
              </a>
            </div>

            <div className="visit-contact-entry">
              <span className="visit-entry-label">{t("followLabel")}</span>
              <a
                href={business.instagram}
                target="_blank"
                rel="noopener noreferrer"
                className="visit-entry-link visit-entry-instagram"
              >
                <svg
                  className="visit-insta-icon"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--orange, #fbb019)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                  <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                  <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
                </svg>
                <span>{socialHandle(business.instagram)}</span>
              </a>
            </div>
          </div>

          <div className="visit-touch-signature">
            {shared.showNote ? <p className="visit-touch-note">{t("note")}</p> : null}
            <div className="visit-pet-sig-wrap" title="Pet friendly café with love">
              <PetLoveArt />
            </div>
          </div>
        </div>

        {/* 5. BOTTOM ROW: BRAND COLOPHON */}
        <div className="visit-colophon-bar">
          <span className="visit-colophon-tag">{t("colophonTag")}</span>
          <span className="visit-colophon-sep" aria-hidden="true">◇</span>
          <span className="visit-colophon-copy">{t("colophonCopy")}</span>
        </div>
      </div>

      <SectionHomeButton />
    </section>
  );
}
