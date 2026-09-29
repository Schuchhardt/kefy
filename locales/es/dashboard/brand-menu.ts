// Selector de marca: el del sidebar (components/dashboard/BrandSwitcher.tsx)
// y la lista compartida con el de móvil (components/dashboard/BrandMenu.tsx).
//
// locales/en/dashboard/brand-menu.ts se tipa con `BrandMenuCopy`.

const es = {
  switchBrand: (name: string) => `Cambiar de marca (actual: ${name})`,
  noBrand: 'Sin marca',
  brandsLabel: 'Tus marcas',
  newBrand: 'Nueva marca',
  nameLabel: 'Nombre de la marca',
  namePlaceholder: 'Nombre de la marca',
  create: 'Crear',
  creating: 'Creando…',
  cancel: 'Cancelar',
  planLimit: 'Alcanzaste el límite de marcas de tu plan.',
  upgrade: 'Mejorar plan',
  createError: 'No se pudo crear la marca. Inténtalo de nuevo.',
};

export default es;
export type BrandMenuCopy = typeof es;
