// Props del wizard «Completa tu marca» (components/dashboard/BrandKitWizard).
// Las pantallas y sus campos viven en lib/brand-setup.ts.

export interface BrandKitWizardProps {
  locale:      string;
  /** Nombre por defecto si el kit todavía se llama «Mi marca». */
  orgName?:    string;
  /** Al guardar la última pantalla. */
  onComplete:  () => void;
  /** «Terminar más tarde», después de guardar. Por defecto, onComplete. */
  onExit?:     () => void;
}
