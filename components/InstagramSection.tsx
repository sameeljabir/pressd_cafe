import { SiteImg } from "@/components/AltTextContext";

const IMAGES = [
  { key: "instagram.coffee", src: "/assets/coffee-matcha.webp" },
  { key: "instagram.pets", src: "/assets/pet-friendly-cafe.webp" },
  { key: "instagram.bowl", src: "/assets/power-bowl.webp" },
  { key: "instagram.work", src: "/assets/work-ambience-cafe.webp" },
  { key: "instagram.smoothies", src: "/assets/smoothies.webp" },
  { key: "instagram.toast", src: "/assets/avocado-toast.webp" },
];

export default function InstagramSection() {
  return (
    <section className="instagram section">
      <div className="instagram-head reveal">
        <div>
          <p className="eyebrow dark">FOLLOW THE GOOD STUFF</p>
          <h2>@PRESSD_WELLNESS_CAFE</h2>
        </div>
        <p>
          Coffee. Wellness. Work. Dogs.
          <br />
          Basically everything we love.
        </p>
      </div>
      <div className="instagram-track">
        {IMAGES.map((image) => (
          <SiteImg key={image.src} k={image.key} src={image.src} />
        ))}
      </div>
      <a
        className="instagram-follow"
        href="https://www.instagram.com/pressd_wellness_cafe?utm_source=ig_web_button_share_sheet&igsh=ZDNlZDc0MzIxNw=="
        target="_blank"
        rel="noopener noreferrer"
      >
        Follow on Instagram →
      </a>
    </section>
  );
}
