"use client";

import type { ReactNode } from "react";
import SectionHomeButton from "@/components/SectionHomeButton";
import AboutReviews from "@/components/AboutReviews";
import type { GoogleReviewsData } from "@/lib/googleReviews";

type Value = { name: string; text: string; icon: ReactNode };

// Fine-line icons drawn on a 24px grid, stroked in currentColor (gold).
const iconProps = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.3,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

const VALUES: Value[] = [
  {
    name: "Wellness Food",
    text: "Honest ingredients and thoughtful preparation.",
    icon: (
      <svg {...iconProps}>
        <path d="M3.5 11.5h17a8.5 8.5 0 0 1-17 0Z" />
        <path d="M12 11.5c0-3.6 2.3-6.2 5.6-6.9-.3 3.6-2.4 6.2-5.6 6.9" />
        <path d="M12 11.5C11.4 8.8 9.6 7 7 6.6c.1 2.7 1.9 4.5 5 4.9" />
      </svg>
    ),
  },
  {
    name: "Pet Friendly",
    text: "Four-legged regulars are always welcome.",
    icon: (
      <svg {...iconProps}>
        <ellipse cx="6.2" cy="10.2" rx="1.7" ry="2.2" />
        <ellipse cx="10" cy="6.3" rx="1.7" ry="2.3" />
        <ellipse cx="14.4" cy="6.3" rx="1.7" ry="2.3" />
        <ellipse cx="18" cy="10.2" rx="1.7" ry="2.2" />
        <path d="M12.2 11.6c-2.6 0-5 3.4-5 5.6 0 1.5 1.2 2.3 2.6 2.3 1 0 1.5-.5 2.4-.5s1.4.5 2.4.5c1.4 0 2.6-.8 2.6-2.3 0-2.2-2.4-5.6-5-5.6Z" />
      </svg>
    ),
  },
  {
    name: "Work Friendly",
    text: "A calm corner for productive afternoons.",
    icon: (
      <svg {...iconProps}>
        <rect x="4.5" y="5.5" width="15" height="10" rx="1.2" />
        <path d="M2.5 18.5h19" />
        <path d="M10 18.5l.6-1.2h2.8l.6 1.2" />
      </svg>
    ),
  },
  {
    name: "Specialty Coffee",
    text: "Specialty roasts, poured with care.",
    icon: (
      <svg {...iconProps}>
        <path d="M4.5 9.5h12v4.5a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5Z" />
        <path d="M16.5 11h1.2a2.3 2.3 0 0 1 0 4.6h-1.6" />
        <path d="M8.5 3.5c-.6.8.6 1.4 0 2.2M12.5 3.5c-.6.8.6 1.4 0 2.2" />
      </svg>
    ),
  },
];

/**
 * About panel (right side of the About split screen). One continuous
 * editorial sheet rather than a grid of cards:
 *   masthead → story (headline + copy) → four values → Google reviews → colophon
 *   (location + copyright).
 * The left-side hero video is rendered by <Hero /> and is not touched here.
 */
export default function IntroSection({ googleReviews }: { googleReviews: GoogleReviewsData | null }) {
  return (
    <section className="intro about-panel section" id="about" aria-label="About PRESS'D Wellness Café">
      <div className="abx">
        <div className="abx-mast" aria-hidden="true">
          <span>About</span>
          <span className="abx-mast-rule" />
          <span>Wellness Café &amp; Specialty Roasts</span>
        </div>

        <div className="abx-story">
          <p className="abx-eyebrow">Our Story</p>
          <h2 className="abx-title">
            A Space Made <span className="abx-title-break">for <em>Good Days.</em></span>
          </h2>
          <div className="abx-copy">
            <p className="abx-lead abx-lead-full">
              PRESS’D was created around the idea that good food, good coffee and good energy belong together. Born at
              Meydan Polo Residence, we built an unhurried sanctuary where nutrition meets uncompromising flavour.
            </p>
            {/* Shorter story for small phones, where the About panel must fit one screen. */}
            <p className="abx-lead abx-lead-short">
              Good food, good coffee and good energy, together in one unhurried wellness café at Meydan Polo Residence.
            </p>
            <p className="abx-pull">
              A thoughtfully crafted space for morning rituals, productive afternoons and genuine community.
            </p>
          </div>
        </div>

        <ul className="abx-values" aria-label="What PRESS'D stands for">
          {VALUES.map((value) => (
            <li key={value.name} className="abx-value">
              <span className="abx-value-icon">{value.icon}</span>
              <span className="abx-value-name">{value.name}</span>
              <span className="abx-value-text">{value.text}</span>
            </li>
          ))}
        </ul>

        <AboutReviews data={googleReviews} />

        <div className="abx-foot">
          <span>Meydan Polo Residence · Nad Al Sheba 1 · Dubai</span>
          <span className="abx-foot-sep" aria-hidden="true">◇</span>
          <span>© PRESS’D Wellness Café</span>
        </div>
      </div>

      <SectionHomeButton />
    </section>
  );
}
