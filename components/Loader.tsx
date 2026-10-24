import { SiteImg } from "@/components/AltTextContext";

export default function Loader() {
  return (
    <div className="loader" aria-hidden="true">
      <SiteImg k="chrome.loader.logo" className="loader-logo" src="/assets/pressd-logo.webp" />
      <div className="loader-line" />
    </div>
  );
}
