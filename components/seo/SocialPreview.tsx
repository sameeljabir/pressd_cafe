"use client";

import { useState } from "react";

interface Props {
  host: string;
  title: string;
  description: string;
  image: string | null;
  card: string;
  onImageError?: () => void;
  onImageLoad?: () => void;
}

const PLATFORMS = [
  { id: "facebook", label: "Facebook" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "x", label: "X" },
] as const;
type Platform = (typeof PLATFORMS)[number]["id"];

/**
 * Link-preview cards built from the Open Graph / X card tags. These are what an
 * app shows automatically when someone shares the URL; a caption typed into the
 * post is separate and is not part of the page.
 */
export default function SocialPreview({ host, title, description, image, card, onImageError, onImageLoad }: Props) {
  const [platform, setPlatform] = useState<Platform>("facebook");
  const small = platform === "x" ? card === "summary" : platform === "whatsapp";
  const img = image ? (
    // eslint-disable-next-line @next/next/no-img-element -- previewing an arbitrary site image as-is
    <img src={image} alt="" onError={onImageError} onLoad={onImageLoad} className={small ? "social-thumb" : ""} />
  ) : <div className="social-noimg">No share image</div>;

  return (
    <section className="card">
      <div className="card-head">
        <h2 className="section">Social link preview</h2>
        <span className="seg" role="tablist" aria-label="Platform">
          {PLATFORMS.map((p) => (
            <button key={p.id} type="button" role="tab" className={platform === p.id ? "on" : ""} aria-selected={platform === p.id} onClick={() => setPlatform(p.id)}>
              {p.label}
            </button>
          ))}
        </span>
      </div>
      <div role="tabpanel" aria-label={`${PLATFORMS.find((p) => p.id === platform)!.label} preview`}>
        {platform === "facebook" ? (
          <div className="social-card social-fb">
            {img}
            <div className="social-text">
              <span className="social-domain">{host.toUpperCase()}</span>
              <b>{title}</b>
              <span className="clamp-1">{description}</span>
            </div>
          </div>
        ) : platform === "linkedin" ? (
          <div className="social-card social-li">
            {img}
            <div className="social-text">
              <b className="clamp-2">{title}</b>
              <span className="social-domain">{host}</span>
            </div>
          </div>
        ) : platform === "whatsapp" ? (
          <div className="social-wa">
            <div className="social-card social-wa-card">
              {img}
              <div className="social-text">
                <b className="clamp-2">{title}</b>
                <span className="clamp-2">{description}</span>
                <span className="social-domain">{host}</span>
              </div>
            </div>
            <span className="social-wa-link">https://{host}/</span>
          </div>
        ) : (
          <div className={`social-card social-x ${card === "summary" ? "social-x-small" : ""}`}>
            {img}
            <div className="social-text">
              <span className="social-domain">{host}</span>
              <b className="clamp-1">{title}</b>
              {card === "summary" ? <span className="clamp-2">{description}</span> : null}
            </div>
          </div>
        )}
      </div>
      <p className="small faint">
        Approximation of the automatic link preview (og:title, og:description, og:image{platform === "x" ? `, twitter:card = ${card}` : ""}). Each app crops and caches differently; a caption written into a post is separate from these tags.
      </p>
    </section>
  );
}
