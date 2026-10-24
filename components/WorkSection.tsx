import { SiteImg } from "@/components/AltTextContext";
import SectionHomeButton from "@/components/SectionHomeButton";

export default function WorkSection() {
  return (
    <section className="split reverse dark-section" id="work">
      <div className="split-image">
        <SiteImg k="work.ambience" src="/assets/work-ambience-cafe.webp" loading="lazy" />
      </div>
      <div className="split-copy reveal">
        <p className="eyebrow">FAST WI-FI · POWER OUTLETS · CALM ATMOSPHERE</p>
        <h2>
          YOUR NEW
          <br />
          <em>WORKSPACE.</em>
        </h2>
        <p>
          <strong>Great coffee. Fast Wi-Fi. Zero office energy.</strong>
          <br />
          <br />
          From quick emails to full work sessions, PRESS&apos;D gives you space to focus.
        </p>
        <ul>
          <li>Power at your table</li>
          <li>Comfortable seating</li>
          <li>Natural light</li>
        </ul>
      </div>
      <SectionHomeButton />
    </section>
  );
}
