import { SiteImg } from "@/components/AltTextContext";

const CARDS = [
  { key: "wellness.bowl", img: "/assets/power-bowl.webp", caption: "01 · POWER PROTEIN BOWL · AED 59" },
  { key: "wellness.avocado", img: "/assets/avocado-toast.webp", caption: "02 · AVOCADO BREAKFAST · AED 48" },
  { key: "wellness.smoothie", img: "/assets/smoothies.webp", caption: "03 · GREEN ENERGY · AED 28" },
];

export default function HealthySection() {
  return (
    <section className="healthy section" id="wellness">
      <p className="eyebrow dark">FRESH INGREDIENTS · BALANCED NUTRITION</p>
      <div className="healthy-head reveal">
        <h2>
          FOOD THAT
          <br />
          <em>WORKS FOR YOU.</em>
        </h2>
        <p>
          Fresh ingredients. Balanced nutrition. Big flavour. Protein bowls, vibrant salads, fresh
          blends and breakfast dishes made with purpose.
        </p>
      </div>
      <div className="healthy-cards">
        {CARDS.map((card) => (
          <figure key={card.caption}>
            <SiteImg k={card.key} src={card.img} loading="lazy" />
            <figcaption>{card.caption}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
